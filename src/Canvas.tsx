import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  useNodesState,
  useReactFlow,
  type Edge,
  type OnNodeDrag,
} from '@xyflow/react'
import { useStore } from './store'
import { branchColor, layoutTree } from './layout'
import MindNode, { type MindFlowNode } from './MindNode'
import type { NodeRecord } from './types'

const nodeTypes = { mind: MindNode }

const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const DURATION = reducedMotion ? 0 : 200

function countDescendants(nodes: NodeRecord, id: string): number {
  let n = 0
  const stack = [...nodes[id].children]
  while (stack.length) {
    const cur = stack.pop()!
    n++
    stack.push(...nodes[cur].children)
  }
  return n
}

export default function Canvas() {
  const map = useStore((s) => (s.currentMapId ? s.maps[s.currentMapId] : null))
  const selectedId = useStore((s) => s.selectedId)
  const fitToken = useStore((s) => s.fitToken)
  const { fitView, getIntersectingNodes, getViewport, setCenter } = useReactFlow()
  const wrapper = useRef<HTMLDivElement>(null)

  // Auto layout is the source of truth for positions.
  const { flowNodes, edges } = useMemo(() => {
    if (!map) return { flowNodes: [] as MindFlowNode[], edges: [] as Edge[] }
    const laid = layoutTree(map.nodes, map.rootId)
    const byId = new Map(laid.map((l) => [l.id, l]))
    const flowNodes: MindFlowNode[] = laid.map((l) => {
      const n = map.nodes[l.id]
      return {
        id: l.id,
        type: 'mind',
        position: { x: l.x, y: l.y },
        width: l.width,
        height: l.height,
        draggable: l.depth > 0,
        data: {
          text: n.text,
          depth: l.depth,
          color: branchColor(l.branch),
          childCount: n.children.length,
          collapsed: n.collapsed,
          hiddenCount: n.collapsed ? countDescendants(map.nodes, l.id) : 0,
        },
      }
    })
    const edges: Edge[] = laid
      .filter((l) => l.depth > 0)
      .map((l) => {
        const n = map.nodes[l.id]
        return {
          id: `${n.parentId}-${l.id}`,
          source: n.parentId!,
          target: l.id,
          type: 'default',
          style: { stroke: branchColor(byId.get(l.id)!.branch), strokeWidth: l.depth === 1 ? 2.5 : 1.75 },
        }
      })
    return { flowNodes, edges }
  }, [map])

  const [nodes, setNodes, onNodesChange] = useNodesState<MindFlowNode>(flowNodes)
  useEffect(() => setNodes(flowNodes), [flowNodes, setNodes])

  // Fit when switching maps or on request.
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.25, duration: DURATION, maxZoom: 1.2 }), 30)
    return () => clearTimeout(t)
  }, [fitToken, map?.id, fitView])

  // Keep the selected node on screen while moving with the keyboard / adding nodes.
  useEffect(() => {
    if (!selectedId || !wrapper.current) return
    const n = flowNodes.find((f) => f.id === selectedId)
    if (!n) return
    const { x, y, zoom } = getViewport()
    const rect = wrapper.current.getBoundingClientRect()
    const left = n.position.x * zoom + x
    const top = n.position.y * zoom + y
    const right = left + (n.width ?? 0) * zoom
    const bottom = top + (n.height ?? 0) * zoom
    const margin = 40
    if (left < margin || top < margin || right > rect.width - margin || bottom > rect.height - margin) {
      setCenter(n.position.x + (n.width ?? 0) / 2, n.position.y + (n.height ?? 0) / 2, {
        zoom,
        duration: DURATION,
      })
    }
  }, [selectedId, flowNodes, getViewport, setCenter])

  // Drag a node onto another node to make it a child there. Otherwise it snaps back.
  const onNodeDragStop: OnNodeDrag<MindFlowNode> = useCallback(
    (_e, dragged) => {
      const hits = getIntersectingNodes(dragged).filter((h) => h.id !== dragged.id)
      if (hits.length) {
        // prefer the node the drag point overlaps the most: take the last (topmost) hit
        useStore.getState().moveNode(dragged.id, hits[hits.length - 1].id)
      }
      setNodes(flowNodes)
    },
    [getIntersectingNodes, setNodes, flowNodes],
  )

  return (
    <div className="canvas" ref={wrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => useStore.getState().select(null)}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        nodesConnectable={false}
        zoomOnDoubleClick={false}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background gap={24} size={1} color="#d9dde4" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  )
}
