import type { MapMode, MindMap, MindNodeData, NodeRecord } from './types'

/**
 * File export / import.
 * File format (.mindmap.json):
 *   { app: "mindmap-reader", format: 1, exportedAt: ISO string, maps: MindMap[] }
 */
export const FILE_EXT = '.mindmap.json'
const APP = 'mindmap-reader'
const FORMAT = 1

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export function exportJson(maps: MindMap[]): string {
  return JSON.stringify({ app: APP, format: FORMAT, exportedAt: new Date().toISOString(), maps }, null, 2)
}

/** Make a string safe to use as a file name (keeps Japanese). */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').trim().slice(0, 60)
  return cleaned || '無題'
}

export function backupFileName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `mindmap-backup-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${FILE_EXT}`
}

/** Start a download of `text` as a file. Returns false if the browser refused. */
export function downloadText(fileName: string, text: string, type = 'application/json'): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return true
  } catch {
    return false
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Rebuild one map from untrusted data. The tree is rebuilt from the root by following
 * `children`, so broken references, cycles and unreachable nodes are dropped.
 * Returns null when the data isn't a usable map.
 */
function sanitizeMap(raw: unknown): MindMap | null {
  if (!isObj(raw) || !isObj(raw.nodes) || typeof raw.rootId !== 'string') return null
  const src = raw.nodes as Record<string, unknown>
  if (!isObj(src[raw.rootId])) return null

  const nodes: NodeRecord = {}
  const visit = (id: string, parentId: string | null) => {
    const n = src[id]
    if (!isObj(n) || nodes[id]) return // missing or already visited (cycle / duplicate)
    const node: MindNodeData = {
      id,
      parentId,
      text: typeof n.text === 'string' ? n.text : '',
      children: [],
      collapsed: n.collapsed === true,
    }
    if (typeof n.page === 'string' && n.page) node.page = n.page
    if (n.kind === 'quote') node.kind = 'quote'
    if (parentId === raw.rootId && (n.side === 'left' || n.side === 'right')) node.side = n.side
    nodes[id] = node
    const kids = Array.isArray(n.children) ? n.children : []
    for (const k of kids) {
      if (typeof k === 'string' && !nodes[k] && isObj(src[k])) {
        node.children.push(k)
        visit(k, id)
      }
    }
  }
  visit(raw.rootId, null)

  const mode: MapMode = raw.mode === 'reading' ? 'reading' : 'free'
  const now = Date.now()
  return {
    id: newId(), // always a new id: importing never overwrites an existing map
    title: nodes[raw.rootId].text || '無題',
    mode,
    rootId: raw.rootId,
    nodes,
    ...(raw.layout === 'right' || raw.layout === 'both' ? { layout: raw.layout } : {}),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: now,
  }
}

export type ImportResult = { ok: true; maps: MindMap[] } | { ok: false; reason: string }

export function parseImport(text: string): ImportResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'ファイルの形式が正しくありません' }
  }
  // accept our export file, a bare array of maps, or a single map
  const list = isObj(data) && Array.isArray(data.maps) ? data.maps : Array.isArray(data) ? data : [data]
  const maps = list.map(sanitizeMap).filter((m): m is MindMap => !!m)
  if (!maps.length) return { ok: false, reason: 'マインドマップのデータが見つかりませんでした' }
  return { ok: true, maps }
}
