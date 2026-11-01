import { create } from 'zustand'
import type { MapMode, MindMap, MindNodeData, NodeRecord } from './types'
import { getPreloaded, saveState } from './storage'
import { normalizePage } from './page'
import { toClip, type Clip } from './clipboard'

const HISTORY_LIMIT = 100

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

function node(text: string, parentId: string | null): MindNodeData {
  return { id: uid(), parentId, text, children: [], collapsed: false }
}

/** Build a new map from a template. Reading mode gives a book-shaped skeleton. */
const CHAPTER_RE = /^第\s*\d+\s*章/

/** A chapter with the reading template under it: 要点 / 引用 / 気づき. Returns the chapter node. */
function makeChapter(nodes: NodeRecord, parentId: string, num: number): MindNodeData {
  const ch = node(`第${num}章`, parentId)
  nodes[ch.id] = ch
  for (const t of ['要点', '引用', '気づき']) {
    const c = node(t, ch.id)
    nodes[c.id] = c
    ch.children.push(c.id)
  }
  return ch
}

function createMapFromTemplate(mode: MapMode): MindMap {
  const now = Date.now()
  const nodes: NodeRecord = {}
  const rootText = mode === 'reading' ? '本のタイトル' : '中心テーマ'
  const root = node(rootText, null)
  nodes[root.id] = root
  if (mode === 'reading') {
    root.children.push(makeChapter(nodes, root.id, 1).id)
    for (const t of ['気づき・感想', '行動に移すこと']) {
      const c = node(t, root.id)
      nodes[c.id] = c
      root.children.push(c.id)
    }
  }
  return { id: uid(), title: rootText, mode, rootId: root.id, nodes, createdAt: now, updatedAt: now }
}

type Direction = 'left' | 'right' | 'up' | 'down'
export type NavMod = 'none' | 'shift' | 'any'

/** For each node, the child that was last selected under it (so → goes back the way you came). */
const trail = new Map<string, string>()

/** Drag-to-reparent feedback shown while a node is being dragged. */
export interface DragState {
  draggingId: string
  targetId: string | null
  /** why the current target can't be used */
  blocked: 'descendant' | 'same-parent' | null
}

/** Positions from the last auto layout, used for visual (spatial) keyboard navigation. */
export interface NodePos {
  x: number
  y: number
  height: number
  depth: number
}
let layoutCache = new Map<string, NodePos>()
export const setLayoutCache = (m: Map<string, NodePos>) => {
  layoutCache = m
}

interface State {
  maps: Record<string, MindMap>
  currentMapId: string | null
  selectedId: string | null
  editingId: string | null
  past: NodeRecord[]
  future: NodeRecord[]
  /** bumps when the user wants the view re-fitted (map switch, "全体表示") */
  fitToken: number
  /** live text of the node being edited, so the layout can grow sideways while typing */
  draft: { id: string; text: string } | null
  drag: DragState | null
  setDraft: (id: string, text: string) => void
  setDrag: (d: DragState | null) => void

  createMap: (mode: MapMode) => void
  selectMap: (id: string) => void
  deleteMap: (id: string) => void

  select: (id: string | null) => void
  startEdit: (id: string) => void
  stopEdit: () => void

  addChild: (id?: string) => void
  addSibling: (id?: string) => void
  /** Shift+Enter: add a sibling above */
  addSiblingBefore: (id?: string) => void
  /** ⌘/Ctrl+Enter: insert a new parent between the node and its parent */
  insertParent: (id?: string) => void
  /** Alt/Option+↑↓: move the node up / down among its siblings */
  moveSibling: (dir: 'up' | 'down', id?: string) => void
  /** ⌘/Ctrl+D: duplicate the branch right below itself */
  duplicateNode: (id?: string) => void
  /** paste branches as children of the selected node */
  pasteClips: (clips: Clip[], parentId?: string) => void
  updateText: (id: string, text: string) => void
  /** Finish editing. An empty, freshly added node is discarded as if it never existed. */
  commitEdit: (id: string, text: string) => void
  lastAddedId: string | null
  /** the item that was selected when lastAddedId was created, and how it was added */
  lastAddedFrom: string | null
  lastAddedKind: 'child' | 'after' | 'before' | null
  /**
   * The just-added item is still empty and the user changes their mind:
   * 'child' (Tab) → make it a detail of the starting item instead,
   * 'sibling' (Shift+Tab) → put it next to the starting item instead.
   */
  retargetNew: (as: 'child' | 'sibling') => void
  deleteNode: (id?: string) => void
  toggleCollapse: (id?: string) => void
  moveNode: (id: string, newParentId: string) => void
  /** jump=true (Shift+矢印): 兄弟の端 / 中心 / 枝の先端へ一気に移動 */
  /**
   * none : ← 親 / → 子 / ↑↓ 同じ階層の上下
   * shift: ← 枝の先頭 / → 枝の先端 / ↑↓ 兄弟の先頭・末尾
   * any  : ↑↓ 深さに関係なく、読む順（アウトライン順）で前・次の項目（⌘/Ctrl+↑↓）
   */
  navigate: (dir: Direction, mod?: NavMod) => void
  undo: () => void
  redo: () => void
  requestFit: () => void
  /** switch the current map between 読書 and シンプル (reading data is kept, only hidden) */
  setMode: (mode: MapMode) => void
  /** reading mode: set the page number(s) of a node ('' clears it) */
  setPage: (id: string, page: string) => void
  /** reading mode: toggle 引用 ⇄ 自分の言葉 */
  toggleQuote: (id?: string) => void
  /** reading mode: add the next chapter (with 要点 / 引用 / 気づき) under the title */
  addChapter: () => void
  /** true: the editor puts the caret at the end instead of selecting all text */
  editCaretEnd: boolean
  /** bumps when the view should be centred on the title */
  centerToken: number
  /** select the title and bring it to the middle of the screen */
  goHome: () => void
  helpOpen: boolean
  setHelpOpen: (open: boolean) => void
  /** add imported maps (always as new maps) and open the first one */
  importMaps: (maps: MindMap[]) => void
  toast: { id: number; text: string; kind: 'info' | 'error' } | null
  showToast: (text: string, kind?: 'info' | 'error') => void
}

const cloneNodes = (nodes: NodeRecord): NodeRecord => {
  const out: NodeRecord = {}
  for (const [k, v] of Object.entries(nodes)) out[k] = { ...v, children: [...v.children] }
  return out
}

export function isDescendant(nodes: NodeRecord, ancestorId: string, id: string): boolean {
  let cur: string | null = id
  while (cur) {
    if (cur === ancestorId) return true
    cur = nodes[cur]?.parentId ?? null
  }
  return false
}

/** Create nodes for a copied branch under parentId. Returns the new top node id (not yet linked). */
function addClip(nodes: NodeRecord, clip: Clip, parentId: string): string {
  const n = node(clip.text, parentId)
  if (clip.page) n.page = clip.page
  if (clip.kind) n.kind = clip.kind
  if (clip.collapsed && clip.children.length) n.collapsed = true
  nodes[n.id] = n
  n.children = clip.children.map((c) => addClip(nodes, c, n.id))
  return n.id
}

const initial = getPreloaded()
const firstMap = createMapFromTemplate('reading')
const initialMaps = initial && Object.keys(initial.maps).length ? initial.maps : { [firstMap.id]: firstMap }
const initialCurrent =
  initial?.currentMapId && initialMaps[initial.currentMapId]
    ? initial.currentMapId
    : Object.keys(initialMaps)[0]

export const useStore = create<State>((set, get) => {
  /** Apply a mutation to the current map's nodes, recording undo history. */
  const mutate = (
    fn: (nodes: NodeRecord, map: MindMap) => Partial<State> | void,
    record = true,
  ) => {
    const { maps, currentMapId, past } = get()
    if (!currentMapId) return
    const map = maps[currentMapId]
    const before = map.nodes
    const nodes = cloneNodes(before)
    const extra = fn(nodes, map) || {}
    const root = nodes[map.rootId]
    set({
      maps: {
        ...maps,
        [map.id]: { ...map, nodes, title: root.text || '無題', updatedAt: Date.now() },
      },
      ...(record ? { past: [...past, before].slice(-HISTORY_LIMIT), future: [] } : {}),
      ...extra,
    })
  }

  const current = () => {
    const { maps, currentMapId } = get()
    return currentMapId ? maps[currentMapId] : null
  }

  return {
    maps: initialMaps,
    currentMapId: initialCurrent,
    selectedId: initialMaps[initialCurrent]?.rootId ?? null,
    editingId: null,
    past: [],
    future: [],
    fitToken: 0,
    centerToken: 0,
    editCaretEnd: false,
    helpOpen: (() => {
      try {
        return localStorage.getItem('mindmap-reader:help') !== 'closed'
      } catch {
        return true
      }
    })(),
    setHelpOpen: (open) => {
      try {
        localStorage.setItem('mindmap-reader:help', open ? 'open' : 'closed')
      } catch {
        /* ignore */
      }
      set({ helpOpen: open })
    },
    lastAddedId: null,
    lastAddedFrom: null,
    lastAddedKind: null,
    toast: null,
    showToast: (text, kind = 'info') => {
      const id = Date.now()
      set({ toast: { id, text, kind } })
      setTimeout(() => get().toast?.id === id && set({ toast: null }), 3500)
    },
    importMaps: (imported) => {
      if (!imported.length) return
      set((s) => {
        const maps = { ...s.maps }
        for (const m of imported) {
          // same title as an existing map: mark it so the two can be told apart in the list
          const titles = new Set(Object.values(maps).map((x) => x.title))
          if (titles.has(m.title)) {
            let n = 2
            while (titles.has(`${m.title}（${n}）`)) n++
            const title = `${m.title}（${n}）`
            m.nodes[m.rootId] = { ...m.nodes[m.rootId], text: title }
            m.title = title
          }
          maps[m.id] = m
        }
        const first = imported[0]
        return {
          maps,
          currentMapId: first.id,
          selectedId: first.rootId,
          editingId: null,
          past: [],
          future: [],
          fitToken: s.fitToken + 1,
        }
      })
    },
    draft: null,
    drag: null,
    setDraft: (id, text) => set({ draft: { id, text } }),
    setDrag: (d) => set({ drag: d }),

    createMap: (mode) => {
      const map = createMapFromTemplate(mode)
      set((s) => ({
        maps: { ...s.maps, [map.id]: map },
        currentMapId: map.id,
        selectedId: map.rootId,
        editingId: map.rootId, // start typing the title right away
        editCaretEnd: false,
        past: [],
        future: [],
        fitToken: s.fitToken + 1,
      }))
    },

    selectMap: (id) =>
      set((s) => ({
        currentMapId: id,
        selectedId: s.maps[id]?.rootId ?? null,
        editingId: null,
        past: [],
        future: [],
        fitToken: s.fitToken + 1,
      })),

    deleteMap: (id) =>
      set((s) => {
        const maps = { ...s.maps }
        delete maps[id]
        if (!Object.keys(maps).length) {
          const m = createMapFromTemplate('reading')
          maps[m.id] = m
        }
        const nextId = s.currentMapId === id ? Object.keys(maps)[0] : s.currentMapId!
        return {
          maps,
          currentMapId: nextId,
          selectedId: maps[nextId].rootId,
          editingId: null,
          past: s.currentMapId === id ? [] : s.past,
          future: s.currentMapId === id ? [] : s.future,
          fitToken: s.fitToken + 1,
        }
      }),

    select: (id) => set({ selectedId: id }),
    startEdit: (id) => set({ selectedId: id, editingId: id, draft: null, editCaretEnd: false }),
    stopEdit: () => set({ editingId: null, draft: null }),

    addChild: (id) => {
      const target = id ?? get().selectedId
      if (!target) return
      mutate((nodes) => {
        const parent = nodes[target]
        const c = node('', parent.id)
        nodes[c.id] = c
        parent.children.push(c.id)
        parent.collapsed = false
        return { selectedId: c.id, editingId: c.id, lastAddedId: c.id, lastAddedFrom: parent.id, lastAddedKind: 'child', draft: null, editCaretEnd: false }
      })
    },

    addSibling: (id) => {
      const target = id ?? get().selectedId
      const map = current()
      if (!target || !map) return
      if (target === map.rootId) return get().addChild(target)
      mutate((nodes) => {
        const parent = nodes[nodes[target].parentId!]
        const c = node('', parent.id)
        nodes[c.id] = c
        parent.children.splice(parent.children.indexOf(target) + 1, 0, c.id)
        return { selectedId: c.id, editingId: c.id, lastAddedId: c.id, lastAddedFrom: target, lastAddedKind: 'after', draft: null, editCaretEnd: false }
      })
    },

    addSiblingBefore: (id) => {
      const target = id ?? get().selectedId
      const map = current()
      if (!target || !map) return
      if (target === map.rootId) return get().addChild(target)
      mutate((nodes) => {
        const parent = nodes[nodes[target].parentId!]
        const c = node('', parent.id)
        nodes[c.id] = c
        parent.children.splice(parent.children.indexOf(target), 0, c.id)
        return { selectedId: c.id, editingId: c.id, lastAddedId: c.id, lastAddedFrom: target, lastAddedKind: 'before', draft: null, editCaretEnd: false }
      })
    },

    insertParent: (id) => {
      const target = id ?? get().selectedId
      const map = current()
      if (!target || !map || target === map.rootId) return
      mutate((nodes) => {
        const parent = nodes[nodes[target].parentId!]
        const c = node('', parent.id)
        nodes[c.id] = c
        parent.children[parent.children.indexOf(target)] = c.id
        c.children.push(target)
        nodes[target].parentId = c.id
        return { selectedId: c.id, editingId: c.id, lastAddedId: null, draft: null, editCaretEnd: false }
      })
    },

    moveSibling: (dir, id) => {
      const target = id ?? get().selectedId
      const map = current()
      if (!target || !map || target === map.rootId) return
      const sibs = map.nodes[map.nodes[target].parentId!].children
      const i = sibs.indexOf(target)
      const j = dir === 'up' ? i - 1 : i + 1
      if (j < 0 || j >= sibs.length) return
      mutate((nodes) => {
        const arr = nodes[nodes[target].parentId!].children
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      })
    },

    duplicateNode: (id) => {
      const target = id ?? get().selectedId
      const map = current()
      if (!target || !map || target === map.rootId) return
      const clip = toClip(map.nodes, target)
      mutate((nodes) => {
        const parent = nodes[nodes[target].parentId!]
        const newId = addClip(nodes, clip, parent.id)
        parent.children.splice(parent.children.indexOf(target) + 1, 0, newId)
        return { selectedId: newId }
      })
    },

    pasteClips: (clips, parentId) => {
      const target = parentId ?? get().selectedId
      const map = current()
      if (!target || !map || !clips.length) return
      mutate((nodes) => {
        const parent = nodes[target]
        const ids = clips.map((c) => addClip(nodes, c, parent.id))
        parent.children.push(...ids)
        parent.collapsed = false
        return { selectedId: ids[0] }
      })
    },

    updateText: (id, text) => {
      const map = current()
      if (!map || map.nodes[id]?.text === text) return
      mutate((nodes) => {
        nodes[id].text = text
      })
    },

    commitEdit: (id, text) => {
      const map = current()
      if (!map || !map.nodes[id]) return set({ editingId: null, draft: null })
      const n = map.nodes[id]
      if (!text.trim() && id !== map.rootId && !n.children.length) {
        if (get().lastAddedId === id && n.text === '') {
          // cancelled a just-added empty item: go back to the item you started from
          const back = get().lastAddedFrom && map.nodes[get().lastAddedFrom!] ? get().lastAddedFrom : n.parentId
          get().undo()
          set({ future: [], lastAddedId: null, lastAddedFrom: null, lastAddedKind: null, selectedId: back })
        } else get().deleteNode(id)
        return set({ editingId: null, draft: null })
      }
      if (get().lastAddedId === id && n.text === '' && text !== '') {
        // first text of a node just added: fold into the "add" step so one undo removes it
        mutate((nodes) => {
          nodes[id].text = text
        }, false)
      } else get().updateText(id, text)
      set({ editingId: null, lastAddedId: null, draft: null, editCaretEnd: false })
    },

    retargetNew: (as) => {
      const { lastAddedId, lastAddedFrom, lastAddedKind, editingId } = get()
      const map = current()
      if (!map || !lastAddedId || editingId !== lastAddedId || !lastAddedFrom) return
      if (map.nodes[lastAddedId]?.text !== '') return
      if (as === 'child' && lastAddedKind === 'child') return
      if (as === 'sibling' && (lastAddedKind !== 'child' || lastAddedFrom === map.rootId)) return
      const from = lastAddedFrom
      get().undo() // remove the empty item without leaving a trace in history
      set({ future: [] })
      if (as === 'child') get().addChild(from)
      else get().addSibling(from)
    },

    deleteNode: (id) => {
      const target = id ?? get().selectedId
      const map = current()
      if (!target || !map || target === map.rootId) return
      mutate((nodes) => {
        const parent = nodes[nodes[target].parentId!]
        const idx = parent.children.indexOf(target)
        parent.children.splice(idx, 1)
        const stack = [target]
        while (stack.length) {
          const cur = stack.pop()!
          stack.push(...nodes[cur].children)
          delete nodes[cur]
        }
        const next = parent.children[idx] ?? parent.children[idx - 1] ?? parent.id
        return { selectedId: next, editingId: null }
      })
    },

    toggleCollapse: (id) => {
      const target = id ?? get().selectedId
      const map = current()
      if (!target || !map || !map.nodes[target]?.children.length) return
      mutate((nodes) => {
        nodes[target].collapsed = !nodes[target].collapsed
      })
    },

    moveNode: (id, newParentId) => {
      const map = current()
      if (!map || id === map.rootId) return
      if (map.nodes[id].parentId === newParentId) return
      if (isDescendant(map.nodes, id, newParentId)) return // can't drop into own subtree
      mutate((nodes) => {
        const oldParent = nodes[nodes[id].parentId!]
        oldParent.children = oldParent.children.filter((c) => c !== id)
        nodes[id].parentId = newParentId
        nodes[newParentId].children.push(id)
        nodes[newParentId].collapsed = false
        return { selectedId: id }
      })
    },

    navigate: (dir, mod = 'none') => {
      const map = current()
      const sel = get().selectedId
      if (!map || !sel) return
      const nodes = map.nodes
      const n = nodes[sel]
      const pos = (id: string) => layoutCache.get(id)
      const visibleKids = (id: string) => (nodes[id].collapsed ? [] : nodes[id].children)
      /** child to go to with →: the one you came from, otherwise the top one */
      const nextChild = (id: string) => {
        const kids = visibleKids(id)
        const remembered = trail.get(id)
        return remembered && kids.includes(remembered) ? remembered : kids[0]
      }
      let next: string | undefined

      if (dir === 'left') {
        if (mod === 'shift') {
          // start of this branch (the node right next to the title); from there, the title
          let cur = sel
          while (nodes[cur].parentId && nodes[cur].parentId !== map.rootId) cur = nodes[cur].parentId!
          next = cur === sel ? (n.parentId ?? undefined) : cur
        } else next = n.parentId ?? undefined
      } else if (dir === 'right') {
        if (n.collapsed && n.children.length) return get().toggleCollapse(sel)
        next = nextChild(sel)
        if (mod === 'shift') {
          // tip of the branch, following the path you came from
          let cur = next
          while (cur) {
            next = cur
            cur = nextChild(cur)
          }
        }
      } else if (mod === 'shift') {
        if (n.parentId) {
          const sibs = nodes[n.parentId].children
          next = dir === 'up' ? sibs[0] : sibs[sibs.length - 1]
        }
      } else if (mod === 'any') {
        // ⌘/Ctrl+↑↓: previous / next item in reading order (top to bottom like an outline),
        // regardless of depth — so you never have to go back to a parent first
        const order: string[] = []
        const walk = (id: string) => {
          order.push(id)
          for (const k of visibleKids(id)) walk(k)
        }
        walk(map.rootId)
        const i = order.indexOf(sel)
        next = order[dir === 'up' ? i - 1 : i + 1]
      } else {
        // ↑↓: the item above / below on the same level, crossing groups
        const me = pos(sel)
        if (me) {
          const myCy = me.y + me.height / 2
          let best: string | undefined
          let bestDist = Infinity
          for (const [id, p] of layoutCache) {
            if (id === sel || p.depth !== me.depth) continue
            const dy = p.y + p.height / 2 - myCy
            if ((dir === 'up' && dy < -1) || (dir === 'down' && dy > 1)) {
              if (Math.abs(dy) < bestDist) {
                bestDist = Math.abs(dy)
                best = id
              }
            }
          }
          next = best
        }
      }
      if (next && next !== sel) set({ selectedId: next })
    },

    undo: () => {
      const { past, future, maps, currentMapId, selectedId } = get()
      if (!past.length || !currentMapId) return
      const map = maps[currentMapId]
      const prev = past[past.length - 1]
      set({
        maps: { ...maps, [map.id]: { ...map, nodes: prev, title: prev[map.rootId].text || '無題' } },
        past: past.slice(0, -1),
        future: [map.nodes, ...future],
        selectedId: selectedId && prev[selectedId] ? selectedId : map.rootId,
        editingId: null,
        draft: null,
      })
    },

    redo: () => {
      const { past, future, maps, currentMapId, selectedId } = get()
      if (!future.length || !currentMapId) return
      const map = maps[currentMapId]
      const next = future[0]
      set({
        maps: { ...maps, [map.id]: { ...map, nodes: next, title: next[map.rootId].text || '無題' } },
        past: [...past, map.nodes],
        future: future.slice(1),
        selectedId: selectedId && next[selectedId] ? selectedId : map.rootId,
        editingId: null,
        draft: null,
      })
    },

    requestFit: () => set((s) => ({ fitToken: s.fitToken + 1 })),
    setMode: (mode) => {
      const { maps, currentMapId } = get()
      if (!currentMapId || maps[currentMapId].mode === mode) return
      set({ maps: { ...maps, [currentMapId]: { ...maps[currentMapId], mode, updatedAt: Date.now() } } })
    },

    setPage: (id, page) => {
      const map = current()
      const clean = normalizePage(page)
      if (!map?.nodes[id] || (map.nodes[id].page ?? '') === clean) return
      mutate((nodes) => {
        if (clean) nodes[id].page = clean
        else delete nodes[id].page
      })
    },

    toggleQuote: (id) => {
      const target = id ?? get().selectedId
      const map = current()
      if (!target || !map || target === map.rootId) return
      mutate((nodes) => {
        if (nodes[target].kind === 'quote') delete nodes[target].kind
        else nodes[target].kind = 'quote'
      })
    },

    addChapter: () => {
      const map = current()
      if (!map) return
      const root = map.nodes[map.rootId]
      const chapters = root.children.filter((c) => CHAPTER_RE.test(map.nodes[c].text))
      mutate((nodes) => {
        const nums = chapters.map((c) => Number(map.nodes[c].text.match(/\d+/)?.[0] ?? 0))
        const ch = makeChapter(nodes, map.rootId, Math.max(0, ...nums) + 1)
        const r = nodes[map.rootId]
        // place it right after the last chapter (before 気づき・感想 etc.)
        const after = chapters.length ? r.children.indexOf(chapters[chapters.length - 1]) + 1 : 0
        r.children.splice(after, 0, ch.id)
        r.collapsed = false
        // edit the chapter title with the caret at the end, ready to type its name
        return { selectedId: ch.id, editingId: ch.id, draft: null, editCaretEnd: true, lastAddedId: null }
      })
    },

    goHome: () => {
      const map = current()
      if (!map) return
      set((s) => ({ selectedId: map.rootId, editingId: null, centerToken: s.centerToken + 1 }))
    },
  }
})

// Remember the path to the selected node, so → returns along it.
useStore.subscribe((s, prev) => {
  if (s.currentMapId !== prev.currentMapId) trail.clear()
  if (!s.selectedId || s.selectedId === prev.selectedId || !s.currentMapId) return
  const nodes = s.maps[s.currentMapId]?.nodes
  let cur: string | undefined = s.selectedId
  while (cur && nodes?.[cur]?.parentId) {
    trail.set(nodes[cur].parentId!, cur)
    cur = nodes[cur].parentId!
  }
})

// Auto-save: no save button, everything is persisted shortly after each change.
let saveTimer: ReturnType<typeof setTimeout> | undefined
let dirty = false
const flush = () => {
  clearTimeout(saveTimer)
  if (!dirty) return
  dirty = false
  const s = useStore.getState()
  void saveState({ maps: s.maps, currentMapId: s.currentMapId })
}
useStore.subscribe((s, prev) => {
  if (s.maps === prev.maps && s.currentMapId === prev.currentMapId) return
  dirty = true
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flush, 300)
})
// save right away when the tab is hidden or closed, so the last edit is never lost
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush())
}

// Expose the store for automated tests (e2e/commands.mjs). Read-only use; harmless in production.
if (typeof window !== 'undefined') (window as unknown as { __mindmap: typeof useStore }).__mindmap = useStore
