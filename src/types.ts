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
  /** タイトルのすぐ下の枝だけ：左右どちらに置くか。undefined＝自動 */
  side?: Side
}

export type Side = 'left' | 'right'
/** 枝の伸ばし方。right＝右だけ、both＝左右 */
export type BranchLayout = 'right' | 'both'
/** マップごとの既定値：読書は本の順に読めるよう右だけ、シンプルは左右 */
export const defaultLayout = (mode: MapMode): BranchLayout => (mode === 'reading' ? 'right' : 'both')

export type NodeRecord = Record<string, MindNodeData>

export interface MindMap {
  id: string
  title: string
  mode: MapMode
  rootId: string
  nodes: NodeRecord
  /** 枝の伸ばし方。undefined＝モードの既定値（defaultLayout） */
  layout?: BranchLayout
  createdAt: number
  updatedAt: number
}
