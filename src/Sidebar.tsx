import { useState } from 'react'
import { useStore } from './store'
import { FileMenu } from './FileActions'
import { LOOKS, setLook, setThemePref, useTheme, type ThemePref } from './theme'

const fmt = (t: number) =>
  new Date(t).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function Sidebar() {
  const maps = useStore((s) => s.maps)
  const currentMapId = useStore((s) => s.currentMapId)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const { createMap, selectMap, deleteMap, setSidebarOpen } = useStore.getState()
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const list = Object.values(maps).sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <>
    {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
    <nav className={`sidebar${sidebarOpen ? ' open' : ''}`}>
      <div className="brand">Mindmap Reader</div>
      <div className="new-buttons">
        <button className="primary" onClick={() => createMap('reading')}>
          ＋ 読書マップ
        </button>
        <button onClick={() => createMap('free')}>＋ シンプルマップ</button>
      </div>
      <ul className="map-list">
        {list.map((m) => (
          <li key={m.id} className={m.id === currentMapId ? 'active' : ''}>
            <button className="map-item" onClick={() => selectMap(m.id)} title={m.title || '無題'}>
              <span className="map-title">
                <span className={`dot ${m.mode}`} />
                <span className="map-title-text">{m.title || '無題'}</span>
              </span>
              <span className="map-date">{fmt(m.updatedAt)}</span>
            </button>
            {confirmId === m.id ? (
              <span className="confirm">
                <button className="danger" onClick={() => (deleteMap(m.id), setConfirmId(null))}>
                  削除する
                </button>
                <button onClick={() => setConfirmId(null)}>やめる</button>
              </span>
            ) : (
              <button className="map-delete" title="このマップを削除" onClick={() => setConfirmId(m.id)}>
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      <Settings />
    </nav>
    </>
  )
}

const THEMES: { value: ThemePref; label: string; title: string }[] = [
  { value: 'light', label: 'ライト', title: '明るい画面' },
  { value: 'dark', label: 'ダーク', title: '暗い画面' },
  { value: 'system', label: '自動', title: 'パソコン・スマホの設定に合わせる' },
]

function ThemeSwitch() {
  const { pref } = useTheme()
  return (
    <div className="theme-switch">
      <div className="file-menu-title">画面の明るさ</div>
      <div className="seg theme-seg" role="radiogroup" aria-label="画面の明るさ">
        {THEMES.map((t) => (
          <button
            key={t.value}
            role="radio"
            aria-checked={pref === t.value}
            className={pref === t.value ? 'on' : ''}
            title={t.title}
            onClick={() => setThemePref(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** 見た目のテーマ（配色・線・ノードの形のセット）を選ぶ */
function LookPicker() {
  const { look, resolved } = useTheme()
  return (
    <div className="theme-switch">
      <div className="file-menu-title">見た目のテーマ</div>
      <div className="look-list" role="radiogroup" aria-label="見た目のテーマ">
        {LOOKS.map((l) => (
          <button
            key={l.id}
            role="radio"
            aria-checked={look.id === l.id}
            className={`look-item${look.id === l.id ? ' on' : ''}`}
            title={l.description}
            data-look-id={l.id}
            onClick={() => setLook(l.id)}
          >
            <span className="look-swatch" aria-hidden>
              {l.branches[resolved].slice(0, 4).map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </span>
            <span className="look-name">{l.name}</span>
            {l.tier === 'paid' && <span className="look-tag">有料</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

const SETTINGS_KEY = 'mindmap-reader:settings-open'
function readOpen() {
  try {
    return localStorage.getItem(SETTINGS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * ファイル・テーマ・明るさを「⚙ 設定」1つにまとめる。ふだんは閉じておき、マップ一覧を広く使う。
 * 閉じていても中身は消さない（⌘O などのキー操作がファイル選択を使うため）。
 */
function Settings() {
  const [open, setOpen] = useState(readOpen)
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(SETTINGS_KEY, o ? '0' : '1')
      } catch {
        /* ignore */
      }
      return !o
    })
  }
  return (
    <div className="settings">
      <button className="settings-toggle" aria-expanded={open} aria-controls="settings-body" onClick={toggle}>
        <span className="settings-icon" aria-hidden>
          ⚙
        </span>
        <span className="settings-label">
          設定
          <span className="settings-sub">ファイル・テーマ・明るさ</span>
        </span>
        <span className="settings-chev" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      <div id="settings-body" className="settings-body" hidden={!open}>
        <FileMenu />
        <LookPicker />
        <ThemeSwitch />
      </div>
    </div>
  )
}
