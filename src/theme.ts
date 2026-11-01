import { useSyncExternalStore } from 'react'

/** ライト / ダーク / 自動（OSの設定に合わせる） */
export type ThemePref = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const KEY = 'mindmap-reader:theme'
const media = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

let pref: ThemePref = readPref()
const listeners = new Set<() => void>()

const resolve = (p: ThemePref): ResolvedTheme => (p === 'system' ? (media?.matches ? 'dark' : 'light') : p)

function apply() {
  document.documentElement.dataset.theme = resolve(pref)
  listeners.forEach((l) => l())
}

/** Call once before the first render so there is no flash of the wrong colours. */
export function initTheme() {
  apply()
  media?.addEventListener?.('change', () => pref === 'system' && apply())
}

export function setThemePref(p: ThemePref) {
  pref = p
  try {
    localStorage.setItem(KEY, p)
  } catch {
    /* ignore */
  }
  apply()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useTheme() {
  const current = useSyncExternalStore(subscribe, () => pref)
  const resolved = useSyncExternalStore(subscribe, () => resolve(pref))
  return { pref: current, resolved }
}
