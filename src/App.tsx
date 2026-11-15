import { useEffect, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import Canvas from './Canvas'
import Sidebar from './Sidebar'
import { DropZone, exportCurrent, openFilePicker, Toast } from './FileActions'
import { layoutOf, useStore } from './store'
import Help from './Help'
import { toggleSidebar, useShowEditButtons, useSidebarCollapsed } from './prefs'
import { clipsForPaste, getInternalClips, setInternalClip, toClip, toOutline } from './clipboard'
import { MODE_LABEL, type BranchLayout, type MapMode } from './types'
import { filterPageInput } from './page'
import './App.css'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? '⌘' : 'Ctrl'

function focusPageInput() {
  const el = document.getElementById('page-input') as HTMLInputElement | null
  if (el && !el.disabled) {
    el.focus()
    el.select()
  }
}

/**
 * Copy / cut / paste.
 * The keydown handler does the work, so it works even in browsers that don't fire the
 * clipboard events when nothing is selected (Safari). The clipboard events, when they do
 * fire, put the outline text on the system clipboard for other apps.
 */
let prepared: { outline: string; at: number } | null = null
let lastPasteEventAt = 0

function copySelection(cut: boolean) {
  const s = useStore.getState()
  const map = s.currentMapId ? s.maps[s.currentMapId] : null
  if (!map || !s.selectedId) return null
  const clip = toClip(map.nodes, s.selectedId)
  const outline = toOutline(clip)
  setInternalClip(outline, [clip])
  if (cut && s.selectedId !== map.rootId) s.deleteNode()
  s.showToast(cut ? '切り取りました' : 'コピーしました（ほかのアプリには箇条書きとして貼り付けられます）')
  return outline
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState()
      const t = e.target as HTMLElement
      if (s.editingId || t.closest('input, textarea, [contenteditable="true"], .help')) return
      if (e.isComposing) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const run = (fn: () => void) => {
        e.preventDefault()
        fn()
      }

      // ---- with ⌘ / Ctrl (Mac / Windows switch automatically) ----
      if (mod) {
        if (key === 'z') return run(() => (e.shiftKey ? s.redo() : s.undo()))
        if (key === 'y') return run(s.redo)
        if (key === 's')
          // habit: ⌘S. Saving is automatic, so offer the file export instead of the browser's "save page"
          return run(() =>
            e.shiftKey ? exportCurrent() : s.showToast(`保存は自動で行われています。ファイルに書き出すには ${MOD}+Shift+S`),
          )
        if (key === 'o') return run(openFilePicker)
        if (key === 'f') return run(s.openSearch)
        // ⌘+\（日本語キーボードの Mac では ¥ のキー）
        if (key === '\\' || key === '¥' || e.code === 'Backslash' || e.code === 'IntlYen')
          return run(() => toggleSidebar({ open: s.sidebarOpen, setOpen: s.setSidebarOpen }))
        if (key === 'Home') return run(s.goHome)
        if (!s.selectedId) return
        if (key === 'd') return run(() => s.duplicateNode())
        if (key === '/') return run(() => s.toggleCollapse())
        if (key === 'Enter') return run(() => s.insertParent())
        if (key === 'ArrowUp') return run(() => s.navigate('up', 'any'))
        if (key === 'ArrowDown') return run(() => s.navigate('down', 'any'))
        if (key === 'c' || key === 'x') {
          const outline = copySelection(key === 'x')
          if (outline) {
            prepared = { outline, at: Date.now() }
            // best effort for browsers without the copy event; the event (if any) also sets it
            navigator.clipboard?.writeText?.(outline).catch(() => {})
          }
          return // no preventDefault: let the browser fire the copy / cut event too
        }
        if (key === 'v') {
          const at = Date.now()
          // if no paste event arrives (Safari outside text fields), paste what was copied in the app
          setTimeout(() => {
            const clips = getInternalClips()
            if (lastPasteEventAt < at && clips) useStore.getState().pasteClips(clips)
          }, 80)
          return
        }
        return
      }

      if (key === 'Home' || key === 'h') return run(s.goHome)
      if (key === 'Escape' && s.focusId) return run(s.toggleFocus)
      const reading = s.maps[s.currentMapId!]?.mode === 'reading'
      if (key === 'c' && reading) return run(s.addChapter)
      if (!s.selectedId) {
        if (['Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key))
          run(() => s.select(s.maps[s.currentMapId!]?.rootId ?? null))
        return
      }

      // ---- Option / Alt: reorder among siblings (same as XMind) ----
      if (e.altKey) {
        if (key === 'ArrowUp') return run(() => s.moveSibling('up'))
        if (key === 'ArrowDown') return run(() => s.moveSibling('down'))
        // 枝をタイトルの左側 / 右側へ（右だけのマップなら、左右に広げる形に切り替わる）
        if (key === 'ArrowLeft') return run(() => s.setSide('left'))
        if (key === 'ArrowRight') return run(() => s.setSide('right'))
        return
      }

      const nav = e.shiftKey ? 'shift' : 'none'
      const map: Record<string, () => void> = {
        Tab: () => s.addChild(),
        Enter: () => (e.shiftKey ? s.addSiblingBefore() : s.addSibling()),
        F2: () => s.startEdit(s.selectedId!),
        ' ': () => s.startEdit(s.selectedId!),
        Delete: () => s.deleteNode(),
        Backspace: () => s.deleteNode(),
        '/': () => s.toggleCollapse(),
        q: () => reading && s.toggleQuote(),
        m: () => s.setMemoOpen(!s.memoOpen),
        f: () => s.toggleFocus(),
        p: () => reading && focusPageInput(),
        ArrowLeft: () => s.navigate('left', nav),
        ArrowRight: () => s.navigate('right', nav),
        ArrowUp: () => s.navigate('up', nav),
        ArrowDown: () => s.navigate('down', nav),
      }
      const fn = map[key]
      if (fn) run(fn)
    }

    // Copy / cut / paste use the clipboard events, so no clipboard permission is needed.
    const editingText = (e: Event) => {
      const t = e.target as HTMLElement | null
      return !!useStore.getState().editingId || !!t?.closest?.('input, textarea, [contenteditable="true"]')
    }
    const onCopyCut = (e: ClipboardEvent) => {
      if (editingText(e) || !e.clipboardData) return
      // from the keyboard: already handled in keydown, just hand the text to the system clipboard
      let outline = prepared && Date.now() - prepared.at < 1000 ? prepared.outline : null
      prepared = null
      // from the browser's Edit menu: do the whole thing here
      if (!outline) outline = copySelection(e.type === 'cut')
      if (!outline) return
      e.clipboardData.setData('text/plain', outline)
      e.preventDefault()
    }
    const onPaste = (e: ClipboardEvent) => {
      if (editingText(e)) return
      lastPasteEventAt = Date.now()
      const s = useStore.getState()
      if (!s.selectedId || !e.clipboardData) return
      const text = e.clipboardData.getData('text/plain')
      const clips = text.trim() ? clipsForPaste(text) : getInternalClips()
      if (!clips?.length) return
      e.preventDefault()
      s.pasteClips(clips)
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('copy', onCopyCut)
    window.addEventListener('cut', onCopyCut)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('copy', onCopyCut)
      window.removeEventListener('cut', onCopyCut)
      window.removeEventListener('paste', onPaste)
    }
  }, [])
}

function Toolbar() {
  const title = useStore((s) => (s.currentMapId ? s.maps[s.currentMapId]?.title : ''))
  const mode = useStore((s) => (s.currentMapId ? s.maps[s.currentMapId]?.mode : 'free'))
  const hasSel = useStore((s) => !!s.selectedId)
  const isRootSel = useStore((s) => !!s.currentMapId && s.maps[s.currentMapId]?.rootId === s.selectedId)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const memoOpen = useStore((s) => s.memoOpen)
  const showEdit = useShowEditButtons()
  const focusOn = useStore((s) => !!s.focusId)
  const s = useStore.getState()

  return (
    <header className="toolbar">
      <div className="toolbar-title">
        <button
          className="menu-btn"
          aria-label="マップ一覧を開く"
          title={`マップ一覧を開く (${MOD}+\\)`}
          onClick={() => toggleSidebar({ open: s.sidebarOpen, setOpen: s.setSidebarOpen }, true)}
        >
          ☰
        </button>
        <div className="mode-switch" role="radiogroup" aria-label="モード">
          {(['reading', 'free'] as MapMode[]).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              className={mode === m ? `on ${m}` : ''}
              onClick={() => s.setMode(m)}
              title={m === 'reading' ? 'ページ番号・引用・章の型が使えます' : '余計な項目のない普通のマップ'}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <LayoutSwitch />
        <h1>{title || '無題'}</h1>
      </div>
      <div className="toolbar-actions">
        {showEdit && (
          <>
            <button disabled={!hasSel} onClick={() => s.addChild()} title="この項目を掘り下げて、詳しい項目を追加 (Tab)">
              → 詳しく
            </button>
            <button disabled={!hasSel} onClick={() => s.addSibling()} title="同じ並びに項目を追加 (Enter ／ 上に追加は Shift+Enter)">
              ↓ 並べて
            </button>
            <button
              disabled={!hasSel || isRootSel}
              onClick={() => s.insertParent()}
              title={`選んだ項目の上に、まとめの見出しを追加 (${MOD}+Enter)`}
            >
              まとめる
            </button>
            <button disabled={!hasSel} onClick={() => s.selectedId && s.startEdit(s.selectedId)} title="編集 (Space / F2)">
              編集
            </button>
            <button disabled={!hasSel || isRootSel} onClick={() => s.deleteNode()} title="削除 (Delete)">
              削除
            </button>
            <span className="sep" />
          </>
        )}
        <button disabled={!hasSel} onClick={() => s.setMemoOpen(!memoOpen)} className={memoOpen ? 'on' : ''} title="選んだ項目のメモ (M)">
          メモ
        </button>
        <span className="sep" />
        <button disabled={!canUndo} onClick={s.undo} title={`元に戻す (${MOD}+Z)`}>
          ↶
        </button>
        <button disabled={!canRedo} onClick={s.redo} title={`やり直す (${MOD}+Shift+Z)`}>
          ↷
        </button>
        <span className="sep" />
        <button
          disabled={!focusOn && (!hasSel || isRootSel)}
          onClick={s.toggleFocus}
          className={focusOn ? 'on' : ''}
          title="選んだ枝だけを表示して、ほかを薄くする (F)"
        >
          集中
        </button>
        <button onClick={s.openSearch} title={`マップ内を検索 (${MOD}+F)`}>
          検索
        </button>
      </div>
    </header>
  )
}

const LAYOUTS: { value: BranchLayout; label: string; title: string }[] = [
  { value: 'right', label: '右だけ', title: '枝を右側だけに伸ばす（上から下へ読む順になる）' },
  { value: 'both', label: '左右', title: '枝を左右に伸ばす（量に合わせて自動で振り分け）' },
]

/** 枝の伸ばし方（右だけ ⇄ 左右）。マップごとに覚える */
function LayoutSwitch() {
  const layout = useStore((s) => (s.currentMapId && s.maps[s.currentMapId] ? layoutOf(s.maps[s.currentMapId]) : 'right'))
  const s = useStore.getState()
  return (
    <div className="seg layout-switch" role="radiogroup" aria-label="枝の伸ばし方">
      {LAYOUTS.map((l) => (
        <button
          key={l.value}
          role="radio"
          aria-checked={layout === l.value}
          className={layout === l.value ? 'on' : ''}
          title={l.title}
          onClick={() => s.setLayout(l.value)}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

/** Reading-mode bar: kind (自分の言葉 / 引用), page number, and ＋章. */
function ReadingBar() {
  const map = useStore((s) => (s.currentMapId ? s.maps[s.currentMapId] : null))
  const selectedId = useStore((s) => s.selectedId)
  const n = map && selectedId ? map.nodes[selectedId] : null
  const editable = !!n && n.id !== map?.rootId
  const s = useStore.getState()
  const [page, setPage] = useState('')
  useEffect(() => setPage(n?.page ?? ''), [n?.id, n?.page])
  if (!map || map.mode !== 'reading') return null

  const commit = () => editable && s.setPage(n!.id, page)
  return (
    <div className="reading-bar">
      <div className={`reading-fields${editable ? '' : ' disabled'}`}>
        <span className="label">種類</span>
        <div className="seg" role="radiogroup" aria-label="種類">
          <button
            role="radio"
            aria-checked={editable && n!.kind !== 'quote'}
            className={editable && n!.kind !== 'quote' ? 'on' : ''}
            disabled={!editable}
            onClick={() => n!.kind === 'quote' && s.toggleQuote(n!.id)}
          >
            自分の言葉
          </button>
          <button
            role="radio"
            aria-checked={editable && n!.kind === 'quote'}
            className={editable && n!.kind === 'quote' ? 'on quote' : ''}
            disabled={!editable}
            onClick={() => n!.kind !== 'quote' && s.toggleQuote(n!.id)}
            title="Q で切り替え"
          >
            “ 引用
          </button>
        </div>
        <label className="label" htmlFor="page-input">
          ページ
        </label>
        <span className="page-field">
          p.
          <input
            id="page-input"
            value={page}
            disabled={!editable}
            placeholder={editable ? '42 / 42-45 / 12, 15' : ''}
            inputMode="numeric"
            title="P で入力"
            onChange={(e) =>
              // don't touch the text mid-conversion (Japanese IME); tidy it once confirmed
              setPage((e.nativeEvent as InputEvent).isComposing ? e.target.value : filterPageInput(e.target.value))
            }
            onCompositionEnd={(e) => setPage(filterPageInput(e.currentTarget.value))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'Enter') {
                commit()
                ;(e.target as HTMLInputElement).blur()
              } else if (e.key === 'Escape') {
                setPage(n?.page ?? '')
                setTimeout(() => (e.target as HTMLInputElement).blur())
              }
            }}
          />
        </span>
      </div>
      <button className="chapter-btn" onClick={s.addChapter} title="C で追加">
        ＋ 章を追加
      </button>
    </div>
  )
}

export default function App() {
  useKeyboard()
  const sidebarCollapsed = useSidebarCollapsed()
  return (
    <ReactFlowProvider>
      <div className={`app${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
        <DropZone />
        <Sidebar />
        <main className="main">
          <Toolbar />
          <ReadingBar />
          <Canvas />
          <Help />
          <Toast />
        </main>
      </div>
    </ReactFlowProvider>
  )
}
