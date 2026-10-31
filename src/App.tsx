import { useEffect, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import Canvas from './Canvas'
import Sidebar from './Sidebar'
import { useStore } from './store'
import './App.css'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? '⌘' : 'Ctrl'

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState()
      const t = e.target as HTMLElement
      if (s.editingId || t.closest('input, textarea, [contenteditable="true"]')) return
      if (e.isComposing) return
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        return e.shiftKey ? s.redo() : s.undo()
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        return s.redo()
      }
      if (mod) return
      if (!s.selectedId) {
        if (['Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          e.preventDefault()
          s.select(s.maps[s.currentMapId!]?.rootId ?? null)
        }
        return
      }
      const map: Record<string, () => void> = {
        Tab: () => s.addChild(),
        Enter: () => s.addSibling(),
        F2: () => s.startEdit(s.selectedId!),
        ' ': () => s.startEdit(s.selectedId!),
        Delete: () => s.deleteNode(),
        Backspace: () => s.deleteNode(),
        '/': () => s.toggleCollapse(),
        ArrowLeft: () => s.navigate('left'),
        ArrowRight: () => s.navigate('right'),
        ArrowUp: () => s.navigate('up'),
        ArrowDown: () => s.navigate('down'),
      }
      const fn = map[e.key]
      if (fn) {
        e.preventDefault()
        fn()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function Toolbar() {
  const title = useStore((s) => (s.currentMapId ? s.maps[s.currentMapId]?.title : ''))
  const mode = useStore((s) => (s.currentMapId ? s.maps[s.currentMapId]?.mode : 'free'))
  const hasSel = useStore((s) => !!s.selectedId)
  const isRootSel = useStore((s) => !!s.currentMapId && s.maps[s.currentMapId]?.rootId === s.selectedId)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const s = useStore.getState()

  return (
    <header className="toolbar">
      <div className="toolbar-title">
        <span className={`mode-badge ${mode}`}>{mode === 'reading' ? '読書' : '自由'}</span>
        <h1>{title || '無題'}</h1>
      </div>
      <div className="toolbar-actions">
        <button disabled={!hasSel} onClick={() => s.addChild()} title="子を追加 (Tab)">
          ＋ 子
        </button>
        <button disabled={!hasSel} onClick={() => s.addSibling()} title="兄弟を追加 (Enter)">
          ＋ 兄弟
        </button>
        <button disabled={!hasSel} onClick={() => s.selectedId && s.startEdit(s.selectedId)} title="編集 (Space / F2)">
          編集
        </button>
        <button disabled={!hasSel || isRootSel} onClick={() => s.deleteNode()} title="削除 (Delete)">
          削除
        </button>
        <span className="sep" />
        <button disabled={!canUndo} onClick={s.undo} title={`元に戻す (${MOD}+Z)`}>
          ↶
        </button>
        <button disabled={!canRedo} onClick={s.redo} title={`やり直す (${MOD}+Shift+Z)`}>
          ↷
        </button>
        <span className="sep" />
        <button onClick={s.requestFit} title="全体を表示">
          全体表示
        </button>
      </div>
    </header>
  )
}

function Help() {
  const [open, setOpenState] = useState(() => {
    try {
      return localStorage.getItem('mindmap-reader:help') !== 'closed'
    } catch {
      return true
    }
  })
  const setOpen = (v: boolean) => {
    setOpenState(v)
    try {
      localStorage.setItem('mindmap-reader:help', v ? 'open' : 'closed')
    } catch {
      /* ignore */
    }
  }
  if (!open)
    return (
      <button className="help-toggle" onClick={() => setOpen(true)}>
        ? 操作方法
      </button>
    )
  return (
    <aside className="help">
      <div className="help-head">
        <strong>操作方法</strong>
        <button onClick={() => setOpen(false)} aria-label="閉じる">
          ×
        </button>
      </div>
      <dl>
        <dt>Tab</dt>
        <dd>子を追加（入力中でも可）</dd>
        <dt>Enter</dt>
        <dd>兄弟を追加 ／ 入力を確定</dd>
        <dt>Space / F2</dt>
        <dd>編集（ダブルクリックでも可）</dd>
        <dt>Shift+Enter</dt>
        <dd>入力中に改行</dd>
        <dt>Esc</dt>
        <dd>入力を取り消し</dd>
        <dt>矢印キー</dt>
        <dd>選択を移動</dd>
        <dt>/</dt>
        <dd>折りたたみ・展開</dd>
        <dt>Delete</dt>
        <dd>削除</dd>
        <dt>{MOD}+Z</dt>
        <dd>元に戻す</dd>
        <dt>ドラッグ</dt>
        <dd>別のノードに重ねると付け替え</dd>
      </dl>
      <p className="help-note">保存は自動です。データはこのブラウザ内にだけ保存されます。</p>
    </aside>
  )
}

export default function App() {
  useKeyboard()
  return (
    <ReactFlowProvider>
      <div className="app">
        <Sidebar />
        <main className="main">
          <Toolbar />
          <Canvas />
          <Help />
        </main>
      </div>
    </ReactFlowProvider>
  )
}
