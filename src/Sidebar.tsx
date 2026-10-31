import { useState } from 'react'
import { useStore } from './store'

const fmt = (t: number) =>
  new Date(t).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function Sidebar() {
  const maps = useStore((s) => s.maps)
  const currentMapId = useStore((s) => s.currentMapId)
  const { createMap, selectMap, deleteMap } = useStore.getState()
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const list = Object.values(maps).sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <nav className="sidebar">
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
            <button className="map-item" onClick={() => selectMap(m.id)}>
              <span className="map-title">
                <span className={`dot ${m.mode}`} />
                {m.title || '無題'}
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
    </nav>
  )
}
