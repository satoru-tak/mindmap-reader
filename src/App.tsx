import { useEffect, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import Canvas from './Canvas'
import Sidebar from './Sidebar'
import { useStore } from './store'
import { MODE_LABEL, type MapMode } from './types'
import './App.css'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? '⌘' : 'Ctrl'
const ALT = isMac ? 'Option' : 'Alt'

function focusPageInput() {
  const el = document.getElementById('page-input') as HTMLInputElement | null
  if (el && !el.disabled) {
    el.focus()
    el.select()
  }
}

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
      if (['Home', 'h', 'H'].includes(e.key)) {
        e.preventDefault()
        return s.goHome()
      }
      if ((e.key === 'c' || e.key === 'C') && s.maps[s.currentMapId!]?.mode === 'reading') {
        e.preventDefault()
        return s.addChapter()
      }
      if (!s.selectedId) {
        if (['Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          e.preventDefault()
          s.select(s.maps[s.currentMapId!]?.rootId ?? null)
        }
        return
      }
      const nav = e.shiftKey ? 'shift' : e.altKey ? 'alt' : 'none'
      const reading = s.maps[s.currentMapId!]?.mode === 'reading'
      const map: Record<string, () => void> = {
        Tab: () => s.addChild(),
        Enter: () => s.addSibling(),
        F2: () => s.startEdit(s.selectedId!),
        ' ': () => s.startEdit(s.selectedId!),
        Delete: () => s.deleteNode(),
        Backspace: () => s.deleteNode(),
        '/': () => s.toggleCollapse(),
        Home: () => s.goHome(),
        q: () => reading && s.toggleQuote(),
        Q: () => reading && s.toggleQuote(),
        p: () => reading && focusPageInput(),
        P: () => reading && focusPageInput(),
        c: () => reading && s.addChapter(),
        C: () => reading && s.addChapter(),
        h: () => s.goHome(),
        H: () => s.goHome(),
        ArrowLeft: () => s.navigate('left', nav),
        ArrowRight: () => s.navigate('right', nav),
        ArrowUp: () => s.navigate('up', nav),
        ArrowDown: () => s.navigate('down', nav),
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
        <button onClick={s.goHome} title="中心に戻る (H)">
          中心へ
        </button>
        <button onClick={s.requestFit} title="全体を表示">
          全体表示
        </button>
      </div>
    </header>
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
            placeholder={editable ? '42 / 42-45' : ''}
            inputMode="numeric"
            title="P で入力"
            onChange={(e) => setPage(e.target.value)}
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
        {!editable && <span className="hint">ノードを選ぶと、種類とページを設定できます</span>}
      </div>
      <button className="chapter-btn" onClick={s.addChapter} title="C で追加">
        ＋ 章を追加
      </button>
    </div>
  )
}

function Help() {
  const open = useStore((s) => s.helpOpen)
  const setOpen = useStore.getState().setHelpOpen
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
        <dt>← / →</dt>
        <dd>親へ ／ 子へ（前にいた子に戻る）</dd>
        <dt>↑ / ↓</dt>
        <dd>同じ階層の上下（親をまたぐ）</dd>
        <dt>{ALT}+↑ / ↓</dt>
        <dd>階層に関係なく、画面上ですぐ上・下へ</dd>
        <dt>H / Home</dt>
        <dd>中心（タイトル）に戻る</dd>
        <dt>Shift+←</dt>
        <dd>枝の先頭へ（もう一度でタイトル）</dd>
        <dt>Shift+→</dt>
        <dd>枝の先端へ（来た道をたどる）</dd>
        <dt>Shift+↑ / ↓</dt>
        <dd>兄弟の先頭 ／ 末尾へ</dd>
        <dt>Q</dt>
        <dd>引用 ⇄ 自分の言葉（読書モード）</dd>
        <dt>P</dt>
        <dd>ページ番号を入力（読書モード）</dd>
        <dt>C</dt>
        <dd>章を追加（読書モード）</dd>
        <dt>/</dt>
        <dd>折りたたみ・展開</dd>
        <dt>Delete</dt>
        <dd>削除</dd>
        <dt>{MOD}+Z</dt>
        <dd>元に戻す</dd>
        <dt>ドラッグ</dt>
        <dd>別のノードに重ねて離すと、その下に移動</dd>
      </dl>
      <p className="help-note">保存は自動です。データはこのブラウザ内にだけ保存されます。背景をクリックすると、この一覧は閉じます。</p>
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
          <ReadingBar />
          <Canvas />
          <Help />
        </main>
      </div>
    </ReactFlowProvider>
  )
}
