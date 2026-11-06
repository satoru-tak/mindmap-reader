import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from './store'

/* ============================================================
 * キャンバスの上に重ねて出す小さなパネル：
 *  - 検索バー（⌘F）
 *  - メモ欄（M）
 *  - 集中モードの案内（F）
 * ============================================================ */

/** マップ内の検索。Enter で次、Shift+Enter で前、Esc で閉じる */
export function SearchBar() {
  const search = useStore((s) => s.search)
  const { setSearchQuery, searchStep, closeSearch } = useStore.getState()
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (search.open) {
      input.current?.focus()
      input.current?.select()
    }
  }, [search.open])
  if (!search.open) return null
  const count = search.hits.length
  return (
    <div className="search-bar" onClick={(e) => e.stopPropagation()}>
      <span className="search-icon" aria-hidden>
        ⌕
      </span>
      <input
        ref={input}
        value={search.query}
        placeholder="マップ内を検索（メモも）"
        aria-label="マップ内を検索"
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.key === 'Enter') {
            e.preventDefault()
            searchStep(e.shiftKey ? -1 : 1)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            closeSearch()
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            searchStep(1)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            searchStep(-1)
          }
        }}
      />
      <span className="search-count" aria-live="polite">
        {search.query.trim() ? (count ? `${search.index + 1} / ${count}` : '見つかりません') : ''}
      </span>
      <button disabled={!count} onClick={() => searchStep(-1)} title="前へ (Shift+Enter)" aria-label="前へ">
        ↑
      </button>
      <button disabled={!count} onClick={() => searchStep(1)} title="次へ (Enter)" aria-label="次へ">
        ↓
      </button>
      <button onClick={closeSearch} title="閉じる (Esc)" aria-label="検索を閉じる">
        ×
      </button>
    </div>
  )
}

/** 選んだ項目のメモ。書いた内容は、欄から離れたとき・閉じたとき・別の項目を選んだときに保存 */
export function MemoPanel() {
  const open = useStore((s) => s.memoOpen)
  const node = useStore((s) => {
    const map = s.currentMapId ? s.maps[s.currentMapId] : null
    return map && s.selectedId ? map.nodes[s.selectedId] : null
  })
  const { setNote, setMemoOpen } = useStore.getState()
  const [text, setText] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)
  // 別の項目を選ぶと、その項目のメモに切り替わる（前の項目のメモは、欄から離れたときに保存済み）
  useEffect(() => setText(node?.note ?? ''), [node?.id, node?.note])
  // 開いたらすぐ入力できるように（開いた直後に打った文字も落とさない）
  useLayoutEffect(() => {
    if (open) area.current?.focus()
  }, [open])
  if (!open || !node) return null
  const save = () => setNote(node.id, text)
  return (
    <aside className="memo-panel" onClick={(e) => e.stopPropagation()}>
      <div className="memo-head">
        <span className="memo-title">
          メモ：<strong>{node.text || '（空）'}</strong>
        </span>
        <button
          onClick={() => {
            save()
            setMemoOpen(false)
          }}
          aria-label="メモを閉じる"
          title="閉じる (Esc)"
        >
          ×
        </button>
      </div>
      <textarea
        ref={area}
        value={text}
        placeholder="この項目の説明や、思いついたことを書いておけます。マップには印だけが出ます。"
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.key === 'Escape') {
            e.preventDefault()
            save()
            setMemoOpen(false)
          }
        }}
      />
      <div className="memo-foot">自動で保存されます</div>
    </aside>
  )
}

/** 集中モード中の案内と、解除ボタン */
export function FocusBanner() {
  const label = useStore((s) => {
    const map = s.currentMapId ? s.maps[s.currentMapId] : null
    return s.focusId && map?.nodes[s.focusId] ? map.nodes[s.focusId].text || '（空）' : null
  })
  if (label === null) return null
  return (
    <div className="focus-banner" onClick={(e) => e.stopPropagation()}>
      <span>
        集中モード：<strong>{label}</strong>
      </span>
      <button onClick={() => useStore.getState().toggleFocus()} title="解除 (F / Esc)">
        解除
      </button>
    </div>
  )
}

/* ---------- バックアップのお知らせ（サイドバー） ---------- */

const DAY = 24 * 60 * 60 * 1000
export const BACKUP_KEY = 'mindmap-reader:last-backup'
const SNOOZE_KEY = 'mindmap-reader:backup-snooze'
const FIRST_KEY = 'mindmap-reader:first-seen'
/** これだけの日数バックアップしていなければ知らせる */
export const BACKUP_REMIND_DAYS = 7
const SNOOZE_DAYS = 3

const readNum = (k: string) => {
  try {
    const v = Number(localStorage.getItem(k))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}
const writeNum = (k: string, v: number) => {
  try {
    localStorage.setItem(k, String(v))
  } catch {
    /* ignore */
  }
}

/** 「すべてバックアップ」をしたときに呼ぶ */
export function markBackedUp() {
  writeNum(BACKUP_KEY, Date.now())
  window.dispatchEvent(new Event('mindmap-backup'))
}

/**
 * 最後のバックアップ（なければ使い始め）から7日以上たち、そのあとに変更があれば、控えめに知らせる。
 * データはこのブラウザの中だけにあるので、消えてしまったときの備え。
 */
export function BackupReminder({ onBackup }: { onBackup: () => void }) {
  const maps = useStore((s) => s.maps)
  const [, rerender] = useState(0)
  useEffect(() => {
    if (!readNum(FIRST_KEY)) writeNum(FIRST_KEY, Date.now())
    const r = () => rerender((n) => n + 1)
    window.addEventListener('mindmap-backup', r)
    const t = setInterval(r, 60 * 60 * 1000)
    return () => {
      window.removeEventListener('mindmap-backup', r)
      clearInterval(t)
    }
  }, [])
  const now = Date.now()
  const last = readNum(BACKUP_KEY)
  const since = last ?? readNum(FIRST_KEY) ?? now
  const snooze = readNum(SNOOZE_KEY) ?? 0
  const changed = Object.values(maps).some((m) => m.updatedAt > (last ?? 0))
  const days = Math.floor((now - since) / DAY)
  if (!changed || days < BACKUP_REMIND_DAYS || now < snooze) return null
  return (
    <div className="backup-reminder" role="status">
      <div className="backup-text">
        {last ? `最後のバックアップから${days}日たちました。` : 'まだバックアップしていません。'}
        <br />
        データはこのブラウザの中だけにあります。
      </div>
      <div className="backup-actions">
        <button className="primary" onClick={onBackup}>
          今すぐバックアップ
        </button>
        <button
          onClick={() => {
            writeNum(SNOOZE_KEY, now + SNOOZE_DAYS * DAY)
            rerender((n) => n + 1)
          }}
        >
          あとで
        </button>
      </div>
    </div>
  )
}
