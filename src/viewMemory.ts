import { useSyncExternalStore } from 'react'

/**
 * マップを開いたときの表示（docs/specs/02-layout.md「マップを開いたときの表示」）
 *  - マップごとに、前回見ていた場所（画面の真ん中のマップ上の座標）・倍率・選んでいた項目を覚える
 *  - 初めて開くマップは「最初の倍率」で表示する
 * マップのデータとは分けて、ブラウザ（localStorage）に保存する。
 */

export interface MapView {
  /** 画面の真ん中に見えていた、マップ上の座標 */
  cx: number
  cy: number
  zoom: number
  /** 選んでいた項目 */
  sel?: string
}

const VIEWS_KEY = 'mindmap-reader:views'
const ZOOM_KEY = 'mindmap-reader:default-zoom'

export const ZOOM_CHOICES = [0.8, 0.9, 1, 1.2] as const
export const DEFAULT_ZOOM = 1

function readViews(): Record<string, MapView> {
  try {
    const v = JSON.parse(localStorage.getItem(VIEWS_KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

let views = readViews()
let writeTimer: ReturnType<typeof setTimeout> | undefined
const flush = () => {
  clearTimeout(writeTimer)
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(views))
  } catch {
    /* ignore */
  }
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', flush)

export const getView = (mapId: string): MapView | undefined => views[mapId]

export function saveView(mapId: string, patch: Partial<MapView>) {
  const prev = views[mapId]
  if (!prev && (patch.cx === undefined || patch.cy === undefined || patch.zoom === undefined)) return
  views = { ...views, [mapId]: { ...prev, ...patch } as MapView }
  clearTimeout(writeTimer)
  writeTimer = setTimeout(flush, 300)
}

export function forgetView(mapId: string) {
  if (!views[mapId]) return
  const next = { ...views }
  delete next[mapId]
  views = next
  flush()
}

/* ---------- 最初の倍率 ---------- */

function readZoom(): number {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY))
    return (ZOOM_CHOICES as readonly number[]).includes(v) ? v : DEFAULT_ZOOM
  } catch {
    return DEFAULT_ZOOM
  }
}

let defaultZoom = readZoom()
const listeners = new Set<() => void>()

export const getDefaultZoom = () => defaultZoom

export function setDefaultZoom(z: number) {
  defaultZoom = z
  try {
    localStorage.setItem(ZOOM_KEY, String(z))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function useDefaultZoom() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => defaultZoom,
  )
}
