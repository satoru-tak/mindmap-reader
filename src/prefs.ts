import { useSyncExternalStore } from 'react'

/**
 * 画面の小さな好み（ブラウザごとに保存）。
 * - 編集ボタン（→ 詳しく・↓ 並べて・まとめる・編集・削除）を出すか（docs/specs/07-features.md）
 */
const EDIT_KEY = 'mindmap-reader:edit-buttons'

function read(): boolean {
  try {
    return localStorage.getItem(EDIT_KEY) !== 'hidden'
  } catch {
    return true
  }
}

let showEdit = read()
const listeners = new Set<() => void>()

export function setShowEditButtons(show: boolean) {
  showEdit = show
  try {
    localStorage.setItem(EDIT_KEY, show ? 'shown' : 'hidden')
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function useShowEditButtons() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => showEdit,
  )
}

/* ---------- 広い画面でサイドバーを閉じているか（docs/specs/07-features.md） ---------- */
const SIDEBAR_KEY = 'mindmap-reader:sidebar'
let sidebarCollapsed = (() => {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'collapsed'
  } catch {
    return false
  }
})()
const sidebarListeners = new Set<() => void>()

export function setSidebarCollapsed(collapsed: boolean) {
  sidebarCollapsed = collapsed
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'open')
  } catch {
    /* ignore */
  }
  sidebarListeners.forEach((l) => l())
}

export function useSidebarCollapsed() {
  return useSyncExternalStore(
    (l) => {
      sidebarListeners.add(l)
      return () => sidebarListeners.delete(l)
    },
    () => sidebarCollapsed,
  )
}

/** 狭い画面（引き出し）かどうか */
export const isNarrow = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 720px)').matches

/**
 * ☰・«・⌘+\ の共通の動き：狭い画面は引き出しを開け閉め、広い画面はサイドバーを閉じる / 開く
 */
export function toggleSidebar(drawer: { open: boolean; setOpen: (o: boolean) => void }, want?: boolean) {
  if (isNarrow()) drawer.setOpen(want ?? !drawer.open)
  else setSidebarCollapsed(!(want ?? sidebarCollapsed))
}
