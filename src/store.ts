import { create } from 'zustand'
import type { MapMode, MindMap, MindNodeData, NodeRecord } from './types'
import { loadState, saveState } from './storage'

const HISTORY_LIMIT = 100

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

function node(text: string, parentId: string | null): MindNodeData {
  return { id: uid(), parentId, text, children: [], collapsed: false }
}

/** Build a new map from a template. Reading mode gives a book-shaped skeleton. */
function createMapFromTemplate(mode: MapMode): MindMap {
  const now = Date.now()
  const nodes: NodeRecord = {}
  const rootText = mode === 'reading' ? '本のタイトル' : '中心テーマ'
  const root = node(rootText, null)
  nodes[root.id] = root
  const childTexts =
    mode === 'reading' ? ['第1章', '気づき・感想', '行動に移すこと'] : ['アイデア1', 'アイデア2']
  for (const t of childTexts) {
    const c = node(t, root.id)
    nodes[c.id] = c
    root.children.push(c.id)
  }
  return { id: uid(), title: rootText, mode, rootId: root.id, nodes, createdAt: now, updatedAt: now }
}

type Direction = 'left' | 'right' | 'up' | 'down'

interface State {
  maps: Record<string, MindMap>
  currentMapId: string | null
  selectedId: string | null
  editingId: string | null
  past: NodeRecord[]
  future: NodeRecord[]
  /** bumps when the user wants the view re-fitted (map switch, "全体表示") */
  fitToken: number

  createMap: (mode: MapMode) => void
  selectMap: (id: string) => void
  deleteMap: (id: string) => void

  select: (id: string | null) => void
  startEdit: (id: string) => void
  stopEdit: () => void

  addChild: (id?: string) => void
  addSibling: (id?: string) => void
  updateText: (id: string, text: string) => void
  /** Finish editing. An empty, freshly added node is discarded as if it never existed. */
  commitEdit: (id: string, text: string) => void
  lastAddedId: string | null
  deleteNode: (id?: string) => void
  toggleCollapse: (id?: string) => void
  moveNode: (id: string, newParentId: string) => void
  navigate: (dir: Direction) => void
  undo: () => void
  redo: () => void
  requestFit: () => void
}

const cloneNodes = (nodes: NodeRecord): NodeRecord => {
  const out: NodeRecord = {}
  for (const [k, v] of Object.entries(nodes)) out[k] = { ...v, children: [...v.children] }
  return out
}

function isDescendant(nodes: NodeRecord, ancestorId: string, id: string): boolean {
  let cur: string | null = id
  while (cur) {
    if (cur === ancestorId) return true
    cur = nodes[cur]?.parentId ?? null
  }
  return false
}

const initial = loadState()
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
    lastAddedId: null,

    createMap: (mode) => {
      const map = createMapFromTemplate(mode)
      set((s) => ({
        maps: { ...s.maps, [map.id]: map },
        currentMapId: map.id,
        selectedId: map.rootId,
        editingId: map.rootId, // start typing the title right away
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
    startEdit: (id) => set({ selectedId: id, editingId: id }),
    stopEdit: () => set({ editingId: null }),

    addChild: (id) => {
      const target = id ?? get().selectedId
      if (!target) return
      mutate((nodes) => {
        const parent = nodes[target]
        const c = node('', parent.id)
        nodes[c.id] = c
        parent.children.push(c.id)
        parent.collapsed = false
        return { selectedId: c.id, editingId: c.id, lastAddedId: c.id }
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
        return { selectedId: c.id, editingId: c.id, lastAddedId: c.id }
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
      if (!map || !map.nodes[id]) return set({ editingId: null })
      const n = map.nodes[id]
      if (!text.trim() && id !== map.rootId && !n.children.length) {
        if (get().lastAddedId === id && n.text === '') {
          const parentId = n.parentId
          get().undo()
          set({ future: [], lastAddedId: null, selectedId: parentId })
        } else get().deleteNode(id)
        return set({ editingId: null })
      }
      if (get().lastAddedId === id && n.text === '' && text !== '') {
        // first text of a node just added: fold into the "add" step so one undo removes it
        mutate((nodes) => {
          nodes[id].text = text
        }, false)
      } else get().updateText(id, text)
      set({ editingId: null, lastAddedId: null })
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

    navigate: (dir) => {
      const map = current()
      const sel = get().selectedId
      if (!map || !sel) return
      const n = map.nodes[sel]
      let next: string | undefined
      if (dir === 'left') next = n.parentId ?? undefined
      else if (dir === 'right') {
        if (n.collapsed && n.children.length) return get().toggleCollapse(sel)
        next = n.children[0]
      } else if (n.parentId) {
        const sibs = map.nodes[n.parentId].children
        const i = sibs.indexOf(sel)
        next = sibs[dir === 'up' ? i - 1 : i + 1]
      }
      if (next) set({ selectedId: next })
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
      })
    },

    requestFit: () => set((s) => ({ fitToken: s.fitToken + 1 })),
  }
})

// Auto-save: no save button, everything is persisted shortly after each change.
let saveTimer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe((s, prev) => {
  if (s.maps === prev.maps && s.currentMapId === prev.currentMapId) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => saveState({ maps: s.maps, currentMapId: s.currentMapId }), 300)
})
