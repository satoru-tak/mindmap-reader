import { useSyncExternalStore } from 'react'

/* ============================================================
 * 画面の明るさ（ライト / ダーク / 自動）と、
 * 見た目のテーマ（配色・線・ノードの形のセット）を扱う。
 * ============================================================ */

/** ライト / ダーク / 自動（OSの設定に合わせる） */
export type ThemePref = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

/** 線の形（React Flow の edge type） */
export type EdgeShape = 'default' | 'smoothstep' | 'straight' | 'step'
/** ノードの形。CSS の :root[data-shape] で切り替える */
export type NodeShape = 'card' | 'pill' | 'underline'

export interface Look {
  id: string
  name: string
  description: string
  /** basic = 基本テーマ（無料）。paid = 今後追加する有料テーマ */
  tier: 'basic' | 'paid'
  /** 枝の色。ライト用とダーク用 */
  branches: { light: string[]; dark: string[] }
  edge: { shape: EdgeShape; width1: number; width2: number }
  node: NodeShape
  /** 背景の模様 */
  grid: 'dots' | 'lines'
}

/**
 * テーマの一覧。新しいテーマはここに1つ足し、必要なら index.css に
 * :root[data-look='id'] の色（変数）を足すだけで増やせる。
 */
export const LOOKS: Look[] = [
  {
    id: 'simple',
    name: 'シンプル',
    description: '標準。落ち着いた色と、角の丸いカード',
    tier: 'basic',
    branches: {
      light: ['#5b8def', '#3fa58a', '#d08a3c', '#a873c9', '#d0607a', '#4aa3b5', '#8a9a3c'],
      dark: ['#7ea4f3', '#56bf9f', '#e0a25a', '#bf92dc', '#e07f96', '#66bccd', '#a6b65a'],
    },
    edge: { shape: 'default', width1: 2.5, width2: 1.75 },
    node: 'card',
    grid: 'dots',
  },
  {
    id: 'soft',
    name: 'やわらか',
    description: 'パステルの色と、丸いノード',
    tier: 'basic',
    branches: {
      light: ['#8fb3f0', '#86cdb5', '#f0b98a', '#c9a6e3', '#eea2b4', '#8fcfdc', '#b9c780'],
      dark: ['#9dbcf2', '#8fd3bc', '#f2c299', '#d0b0e6', '#f0adbd', '#9ad5e0', '#c2cf8c'],
    },
    edge: { shape: 'default', width1: 4, width2: 3 },
    node: 'pill',
    grid: 'dots',
  },
  {
    id: 'note',
    name: 'ノート',
    description: 'ノートに書いたような下線と、直角の線',
    tier: 'basic',
    branches: {
      light: ['#41618f', '#3d7a69', '#9a6a33', '#755a95', '#9a4f62', '#3f7f8c', '#6b7633'],
      dark: ['#9fb6db', '#8fc5b5', '#d6b07f', '#bba6d6', '#d69aaa', '#93c4cf', '#b6c27f'],
    },
    edge: { shape: 'smoothstep', width1: 2, width2: 1.5 },
    node: 'underline',
    grid: 'lines',
  },
]

export const DEFAULT_LOOK = LOOKS[0]
export const lookById = (id: string | undefined) => LOOKS.find((l) => l.id === id) ?? DEFAULT_LOOK

/** タイトル（中心）につながる線の色 */
const ROOT_LINE = { light: '#3b4250', dark: '#c9d0db' }

export function branchColor(look: Look, mode: ResolvedTheme, branch: number) {
  if (branch < 0) return ROOT_LINE[mode]
  const list = look.branches[mode]
  return list[branch % list.length]
}

/* ---------- 保存と状態 ---------- */

const KEY = 'mindmap-reader:theme'
const LOOK_KEY = 'mindmap-reader:look'
const media = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* ignore */
  }
}

function readPref(): ThemePref {
  const v = read(KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}

let pref: ThemePref = readPref()
let look: Look = lookById(read(LOOK_KEY) ?? undefined)
const listeners = new Set<() => void>()

const resolve = (p: ThemePref): ResolvedTheme => (p === 'system' ? (media?.matches ? 'dark' : 'light') : p)

function apply() {
  const el = document.documentElement
  el.dataset.theme = resolve(pref)
  el.dataset.look = look.id
  el.dataset.shape = look.node
  listeners.forEach((l) => l())
}

/** Call once before the first render so there is no flash of the wrong colours. */
export function initTheme() {
  apply()
  media?.addEventListener?.('change', () => pref === 'system' && apply())
}

export function setThemePref(p: ThemePref) {
  pref = p
  write(KEY, p)
  apply()
}

export function setLook(id: string) {
  look = lookById(id)
  write(LOOK_KEY, look.id)
  apply()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useTheme() {
  const current = useSyncExternalStore(subscribe, () => pref)
  const resolved = useSyncExternalStore(subscribe, () => resolve(pref))
  const currentLook = useSyncExternalStore(subscribe, () => look)
  return { pref: current, resolved, look: currentLook }
}
