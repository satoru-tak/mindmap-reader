import type { MindMap } from './types'

// MVP: all data stays in the browser (no server, nothing is sent anywhere).
const KEY = 'mindmap-reader:v1'

export interface PersistedState {
  maps: Record<string, MindMap>
  currentMapId: string | null
}

export function loadState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as PersistedState) : null
  } catch {
    return null
  }
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Storage may be unavailable (private mode, quota). The app keeps working in memory.
  }
}
