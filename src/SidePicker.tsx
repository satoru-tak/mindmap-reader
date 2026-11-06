import { layoutOf, topBranch, useStore } from './store'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
const ALT = isMac ? 'Option' : 'Alt'

/** 左右に広げるマップで、選んだ項目の枝をタイトルの左 / 右に置く（自動に戻すこともできる） */
export default function SidePicker() {
  const info = useStore((s) => {
    const map = s.currentMapId ? s.maps[s.currentMapId] : null
    if (!map || !s.selectedId || layoutOf(map) !== 'both') return null
    const top = topBranch(map.nodes, map.rootId, s.selectedId)
    return top ? (map.nodes[top].side ?? 'auto') : null
  })
  if (!info) return null
  const s = useStore.getState()
  const opts: { v: 'left' | 'auto' | 'right'; label: string; title: string }[] = [
    { v: 'left', label: '← 左', title: `この枝をタイトルの左側に置く (${ALT}+←)` },
    { v: 'auto', label: '自動', title: '量に合わせて自動で振り分ける' },
    { v: 'right', label: '右 →', title: `この枝をタイトルの右側に置く (${ALT}+→)` },
  ]
  return (
    <div className="side-picker" onClick={(e) => e.stopPropagation()}>
      <span className="label">この枝の位置</span>
      <div className="seg" role="radiogroup" aria-label="この枝の位置">
        {opts.map((o) => (
          <button
            key={o.v}
            role="radio"
            aria-checked={info === o.v}
            className={info === o.v ? 'on' : ''}
            title={o.title}
            onClick={() => s.setSide(o.v === 'auto' ? null : o.v)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

