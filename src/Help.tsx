import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from './store'

/**
 * 操作方法の一覧（docs/specs/07-features.md「操作方法の一覧」）
 * 動作名が先・キーが右。詳しい説明は吹き出し。上の検索欄で絞り込める。
 */

const isMac = navigator.platform.includes('Mac')
const MOD = isMac ? '⌘' : 'Ctrl'
const ALT = isMac ? 'Option' : 'Alt'
const TIP_DELAY = 300

/** keys：「/」で並べる別の押し方の一覧。1つの押し方は同時に押すキーの並び */
type Item = { action: string; keys: string[][]; detail?: string }
type Group = { title: string; items: Item[] }

const GROUPS: Group[] = [
  {
    title: '追加・編集',
    items: [
      { action: '詳しい項目を追加', keys: [['Tab']], detail: '掘り下げた項目（子）を追加する。入力中でも使える' },
      { action: '同じ並びの下に追加', keys: [['Enter']], detail: '同じ並び（兄弟）の下に追加する。入力中なら入力を確定する' },
      { action: '同じ並びの上に追加', keys: [['Shift', 'Enter']], detail: '入力中は改行になる' },
      { action: 'まとめの見出しを追加', keys: [[MOD, 'Enter']], detail: '選んだ項目の上に、まとめの見出し（親）を追加する' },
      { action: '編集する', keys: [['Space'], ['F2']], detail: 'ダブルクリックでも編集できる' },
      { action: '入力を取り消す', keys: [['Esc']], detail: '空の項目は消えて、元の項目に戻る' },
      {
        action: '押し間違いを直す',
        keys: [['Tab'], ['Shift', 'Tab']],
        detail: 'Enter で追加した空の項目を「詳しく」に変える（空のまま Tab）。Shift+Tab で「並べて」に戻す',
      },
      { action: '削除', keys: [['Delete']] },
      {
        action: 'メモを開く・閉じる',
        keys: [['M']],
        detail: `メモがある項目には ≡ の印が付く。書いているときは Esc か ${MOD}+Enter で閉じる`,
      },
    ],
  },
  {
    title: '選択の移動',
    items: [
      {
        action: 'タイトル側 ／ 外側へ',
        keys: [['←'], ['→']],
        detail: '1つずつ動く。外側へ動くと、前にいた項目に戻る。タイトルの左側の枝では、← が外側・→ がタイトル側になる',
      },
      { action: '同じ深さの上下へ', keys: [['↑'], ['↓']], detail: '並びをまたいで動く' },
      { action: '読む順で前 ／ 次へ', keys: [[MOD, '↑'], [MOD, '↓']], detail: '深さに関係なく、上から読む順に動く' },
      {
        action: '枝の最初へ',
        keys: [['Shift', '←']],
        detail: 'タイトルのすぐ隣の項目（章など）まで一気に戻る。もう一度押すとタイトルへ',
      },
      {
        action: '枝の最後へ',
        keys: [['Shift', '→']],
        detail: 'いちばん外側の項目まで一気に進む。途中で枝分かれしているときは、前に通った道をたどる（初めてなら上の道）',
      },
      { action: '並びの最初 ／ 最後へ', keys: [['Shift', '↑'], ['Shift', '↓']], detail: '同じ項目から分かれた並びの、いちばん上 ／ 下へ' },
      { action: 'タイトルに戻る', keys: [['H'], ['Home']] },
    ],
  },
  {
    title: '表示',
    items: [
      {
        action: 'マップ一覧を開く・閉じる',
        keys: [[MOD, '\\']],
        detail: isMac ? '日本語キーボードでは ⌘+¥ でも動く' : undefined,
      },
      { action: 'マップ内を検索', keys: [[MOD, 'F']], detail: 'メモの中も探す。Enter で次、Shift+Enter で前へ' },
      { action: '集中モード', keys: [['F']], detail: '選んだ項目と、その詳しい項目だけをはっきり見せて、ほかを薄くする。もう一度 F か Esc で解除' },
      { action: '折りたたむ・広げる', keys: [['/'], [MOD, '/']] },
    ],
  },
  {
    title: '並べ替え・整理',
    items: [
      { action: '順番を入れ替える', keys: [[ALT, '↑'], [ALT, '↓']], detail: '同じ並びの中で上下を入れ替える' },
      {
        action: '枝をタイトルの左 ／ 右へ',
        keys: [[ALT, '←'], [ALT, '→']],
        detail: '選んだ項目が入っている枝ごと動く。タイトルの左右に枝を広げる形になる',
      },
      {
        action: '別の項目の下へ移す',
        keys: [['ドラッグ']],
        detail: '別の項目に重ねて離すと、その詳しい項目になる。タイトルの左右どちらで離すかで、置く側も決まる',
      },
      {
        action: 'コピー ／ 切り取り ／ 貼り付け',
        keys: [[MOD, 'C'], [MOD, 'X'], [MOD, 'V']],
        detail: '貼り付けると、選んだ項目の詳しい項目として入る',
      },
      { action: '複製', keys: [[MOD, 'D']] },
      { action: '元に戻す ／ やり直す', keys: [[MOD, 'Z'], [MOD, 'Shift', 'Z']] },
    ],
  },
  {
    title: '読書モード',
    items: [
      { action: '引用 ⇄ 自分の言葉', keys: [['Q']] },
      { action: 'ページ番号を入力', keys: [['P']] },
      { action: '章を追加', keys: [['C']] },
    ],
  },
  {
    title: 'ファイル',
    items: [
      { action: 'このマップを書き出す', keys: [[MOD, 'Shift', 'S']] },
      { action: 'ファイルを開く', keys: [[MOD, 'O']], detail: 'ファイルを画面にドロップしても開ける' },
    ],
  },
]

const norm = (s: string) => s.normalize('NFKC').toLowerCase()

/** 検索の対象。⌘/Ctrl・Option/Alt は英語の呼び名でも引けるようにする */
function haystack(g: Group, it: Item) {
  const keys = it.keys.map((k) => k.join('+')).join(' ')
  let extra = ''
  if (keys.includes(MOD)) extra += ' cmd command ctrl control'
  if (keys.includes(ALT)) extra += ' alt option'
  return norm([g.title, it.action, keys, it.detail ?? '', extra].join(' '))
}

export function filterGroups(q: string): Group[] {
  const words = norm(q).split(/\s+/).filter(Boolean)
  if (!words.length) return GROUPS
  return GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => {
      const h = haystack(g, it)
      const keys = it.keys.flat().map(norm)
      // 英数字1文字（例：d）は、そのキーそのものだけに合わせる（command などの途中の文字に合わないように）
      return words.every((w) => (/^[a-z0-9]$/.test(w) ? keys.includes(w) : h.includes(w)))
    }),
  })).filter((g) => g.items.length)
}

function Keys({ keys }: { keys: string[][] }) {
  return (
    <span className="help-keys">
      {keys.map((combo, i) => (
        <span key={i} className="help-combo">
          {i > 0 && <span className="help-or">/</span>}
          {combo.map((k, j) => (
            <kbd key={j} className={k === 'ドラッグ' ? 'word' : undefined}>
              {k}
            </kbd>
          ))}
        </span>
      ))}
    </span>
  )
}

function useHelpTip() {
  const [tip, setTip] = useState<{ text: string; top: number; left: number; above: boolean } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hide = () => {
    clearTimeout(timer.current)
    setTip(null)
  }
  const show = (row: HTMLElement, text?: string) => {
    clearTimeout(timer.current)
    setTip(null)
    if (!text) return
    timer.current = setTimeout(() => {
      const r = row.getBoundingClientRect()
      const panel = row.closest('.help')?.getBoundingClientRect() ?? r
      // 一覧の右に場所があれば右へ。なければ（狭い画面）行の上へ
      if (window.innerWidth - panel.right >= 220)
        setTip({ text, top: r.top + r.height / 2, left: panel.right + 8, above: false })
      else setTip({ text, top: r.top - 6, left: Math.max(8, r.left), above: true })
    }, TIP_DELAY)
  }
  const node = tip
    ? createPortal(
        <div
          className={`map-tip help-tip${tip.above ? ' above' : ''}`}
          role="tooltip"
          style={{ top: tip.top, left: tip.left }}
        >
          {tip.text}
        </div>,
        document.body,
      )
    : null
  return { show, hide, node }
}

export default function Help() {
  const open = useStore((s) => s.helpOpen)
  const setOpen = useStore.getState().setHelpOpen
  const [q, setQ] = useState('')
  const groups = useMemo(() => filterGroups(q), [q])
  const tip = useHelpTip()

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
        <button
          onClick={() => {
            tip.hide()
            setOpen(false)
          }}
          aria-label="閉じる"
        >
          ×
        </button>
      </div>
      <input
        className="help-search"
        type="search"
        value={q}
        placeholder="動作やキーで探す（例：コピー、Tab）"
        aria-label="操作方法を探す"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.preventDefault()
          if (q) setQ('')
          else e.currentTarget.blur()
        }}
      />
      <div className="help-body" onScroll={tip.hide}>
        {groups.length === 0 && <p className="help-empty">見つかりませんでした</p>}
        {groups.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            <ul className="help-list">
              {g.items.map((it) => (
                <li
                  key={it.action}
                  className={`help-row${it.detail ? ' has-detail' : ''}`}
                  tabIndex={0}
                  aria-label={`${it.action}：${it.keys.map((k) => k.join('+')).join(' または ')}${it.detail ? `。${it.detail}` : ''}`}
                  onMouseDown={(e) => e.preventDefault() /* クリックでフォーカスを奪わない */}
                  onMouseEnter={(e) => tip.show(e.currentTarget, it.detail)}
                  onMouseLeave={tip.hide}
                  onFocus={(e) => tip.show(e.currentTarget, it.detail)}
                  onBlur={tip.hide}
                >
                  <span className="help-action">{it.action}</span>
                  <Keys keys={it.keys} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="help-note">
        「枝」は、タイトルから伸びる線と、その先に付いている項目のまとまりのことです。「詳しく」は親子の「子」、「並べて」は「兄弟」、「まとめる」は「親」にあたります。行にマウスを乗せると詳しい説明が出ます。
        <br />
        保存は自動です。データはこのブラウザ内にだけ保存されるので、ときどき「すべてバックアップ」でファイルに残してください。背景をクリックすると、この一覧は閉じます。
      </p>
      {tip.node}
    </aside>
  )
}
