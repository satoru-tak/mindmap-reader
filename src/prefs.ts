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
