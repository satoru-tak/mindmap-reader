export type MapMode = 'reading' | 'free'

export interface MindNodeData {
  id: string
  parentId: string | null
  text: string
  children: string[]
  collapsed: boolean
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
