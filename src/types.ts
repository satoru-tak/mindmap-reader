// 'free' is the stored value for the シンプル mode (kept for compatibility with saved data)
export type MapMode = 'reading' | 'free'

export const MODE_LABEL: Record<MapMode, string> = { reading: '読書', free: 'シンプル' }

/** Reading mode: whether a node is a quote from the book or the reader's own words (default). */
export type NodeKind = 'quote'

export interface MindNodeData {
  id: string
  parentId: string | null
  text: string
  children: string[]
  collapsed: boolean
  /** reading mode: page number(s) in the book, e.g. "42" or "42-45" */
  page?: string
  /** reading mode: 'quote' = taken from the book; undefined = own words */
  kind?: NodeKind
}

export type NodeRecord = Record<string, MindNodeData>

export interface MindMap {
  id: string
  title: string
  mode: MapMode
  rootId: string
  nodes: NodeRecord
  createdAt: number
  updatedAt: number
}
