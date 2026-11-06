import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  Handle,
  Position,
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useNodesState,
  useReactFlow,
  useUpdateNodeInternals,
  type Edge,
  type EdgeProps,
  BaseEdge,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type OnNodeDrag,
} from '@xyflow/react'
import { isDescendant, layoutOf, setLayoutCache, useStore, type DragState, type NodePos } from './store'
import { H_GAP, layoutTree, V_GAP } from './layout'
import MindNode, { type MindFlowNode } from './MindNode'
import SidePicker from './SidePicker'
import { FocusBanner, MemoPanel, SearchBar } from './Panels'
import { branchColor, useTheme } from './theme'
import type { NodeRecord } from './types'

/** Dashed placeholder showing where the dragged node will land. */
function GhostNode({ data, width, height }: { data: { text: string }; width?: number; height?: number }) {
  return (
    <div className="ghost-node" style={{ width, height }}>
      <Handle id="tl" type="target" position={Position.Left} className="mind-handle" isConnectable={false} />
      <Handle id="tr" type="target" position={Position.Right} className="mind-handle" isConnectable={false} />
      {data.text || '（空）'}
    </div>
  )
}

const nodeTypes = { mind: MindNode, ghost: GhostNode }

/**
 * 「下線」の形のテーマ用の線。親からの線と、子の下線を1本の線として描く。
 * 下線を CSS の枠線で描くと、拡大率によって線と1px ほどずれるため。
 */
type UnderlineData = { shape: 'default' | 'smoothstep' | 'straight' | 'step'; underline: number; dir: 1 | -1 }
function UnderlineEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd } = props
  const data = props.data as UnderlineData
  const args = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }
  const [path] =
    data.shape === 'straight'
      ? getStraightPath(args)
      : data.shape === 'smoothstep' || data.shape === 'step'
        ? getSmoothStepPath({ ...args, borderRadius: data.shape === 'step' ? 0 : 5 })
        : getBezierPath(args)
  return <BaseEdge path={`${path} L ${targetX + data.dir * (data.underline + 1)} ${targetY}`} style={style} markerEnd={markerEnd} />
}
const edgeTypes = { underline: UnderlineEdge }

const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const DURATION = reducedMotion ? 0 : 200
const ACCENT = 'var(--accent)'

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

const overlapArea = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

export default function Canvas() {
  const map = useStore((s) => (s.currentMapId ? s.maps[s.currentMapId] : null))
  const selectedId = useStore((s) => s.selectedId)
  const fitToken = useStore((s) => s.fitToken)
  const centerToken = useStore((s) => s.centerToken)
  const draft = useStore((s) => s.draft)
  const editingId = useStore((s) => s.editingId)
  const drag = useStore((s) => s.drag)
  const { resolved: theme, look } = useTheme()
  const focusId = useStore((s) => s.focusId)
  const { fitView, getViewport, setViewport, setCenter, screenToFlowPosition } = useReactFlow()
  const wrapper = useRef<HTMLDivElement>(null)

  // While editing, lay out with the live text so the node grows sideways and neighbours make room.
  const editingText = editingId ? { id: editingId, text: draft?.id === editingId ? draft.text : map?.nodes[editingId]?.text ?? '' } : null

  // Auto layout is the source of truth for positions.
  const { flowNodes, edges } = useMemo(() => {
    if (!map) return { flowNodes: [] as MindFlowNode[], edges: [] as Edge[] }
    const showReading = map.mode === 'reading'
    const laid = layoutTree(map.nodes, map.rootId, {
      editing: editingText,
      showReading,
      anchor: look.node === 'underline' ? 'bottom' : 'center',
      both: layoutOf(map) === 'both',
    })
    const cache = new Map<string, NodePos>()
    for (const l of laid) cache.set(l.id, { x: l.x, y: l.y, height: l.height, depth: l.depth, dir: l.dir })
    setLayoutCache(cache)
    const byId = new Map(laid.map((l) => [l.id, l]))
    // 集中モード：その枝と、タイトルまでの道だけをはっきり見せる
    let focusSet: Set<string> | null = null
    if (focusId && map.nodes[focusId]) {
      focusSet = new Set<string>()
      const add = (id: string) => {
        focusSet!.add(id)
        map.nodes[id].children.forEach(add)
      }
      add(focusId)
      let cur = map.nodes[focusId].parentId
      while (cur) {
        focusSet.add(cur)
        cur = map.nodes[cur].parentId
      }
    }
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
          color: branchColor(look, theme, l.branch),
          childCount: n.children.length,
          collapsed: n.collapsed,
          hiddenCount: n.collapsed ? countDescendants(map.nodes, l.id) : 0,
          page: showReading && l.depth > 0 ? n.page : undefined,
          quote: showReading && l.depth > 0 && n.kind === 'quote',
          dir: l.dir,
          note: !!n.note,
          dimmed: focusSet ? !focusSet.has(l.id) : false,
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
          // left side: leave the parent on its left, enter the child on its right
          sourceHandle: l.dir === -1 ? 'sl' : 'sr',
          targetHandle: l.dir === -1 ? 'tr' : 'tl',
          type: look.node === 'underline' ? 'underline' : look.edge.shape,
          data: { shape: look.edge.shape, underline: l.width, dir: l.dir },
          style: {
            stroke: branchColor(look, theme, byId.get(l.id)!.branch),
            strokeWidth: l.depth === 1 ? look.edge.width1 : look.edge.width2,
            ...(focusSet && !focusSet.has(l.id) ? { opacity: 0.15 } : {}),
          },
        }
      })
    return { flowNodes, edges }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, editingText?.id, editingText?.text, look, theme, focusId])

  const [nodes, setNodes, onNodesChange] = useNodesState<MindFlowNode>(flowNodes)
  // 折りたたみ・展開で形が変わっても、そのノードは画面上の同じ位置に留める
  const prevPos = useRef(new Map<string, { x: number; y: number }>())
  const pinId = useStore((s) => s.pinId)
  useEffect(() => {
    if (pinId) {
      const before = prevPos.current.get(pinId)
      const after = flowNodes.find((f) => f.id === pinId)?.position
      if (before && after && (before.x !== after.x || before.y !== after.y)) {
        const { x, y, zoom } = getViewport()
        setViewport({ x: x - (after.x - before.x) * zoom, y: y - (after.y - before.y) * zoom, zoom })
      }
      useStore.getState().clearPin()
    }
    prevPos.current = new Map(flowNodes.map((f) => [f.id, f.position]))
    setNodes(flowNodes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowNodes, setNodes])

  // The node shape (theme) moves the connection points, so re-measure them when it changes.
  const updateNodeInternals = useUpdateNodeInternals()
  useEffect(() => {
    const ids = flowNodes.map((f) => f.id)
    const t = requestAnimationFrame(() => updateNodeInternals(ids))
    return () => cancelAnimationFrame(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look.id, updateNodeInternals])

  // While dragging: the old link fades out, and a dashed ghost + link shows where the node will land.
  const { shownEdges, ghost } = useMemo(() => {
    if (!drag || !map) return { shownEdges: edges, ghost: null }
    const parentId = map.nodes[drag.draggingId]?.parentId
    const willMove = drag.targetId && !drag.blocked
    const shownEdges = edges.map((e) =>
      e.target === drag.draggingId && e.source === parentId
        ? { ...e, style: { ...e.style, opacity: willMove ? 0.15 : 0.5, strokeDasharray: willMove ? '4 4' : undefined } }
        : e,
    )
    if (!willMove) return { shownEdges, ghost: null }
    const target = flowNodes.find((f) => f.id === drag.targetId)
    const dragged = flowNodes.find((f) => f.id === drag.draggingId)
    if (!target || !dragged) return { shownEdges, ghost: null }
    // place the ghost to the right of the target, below its last visible child
    const tn = map.nodes[target.id]
    const kids = tn.collapsed ? [] : tn.children.filter((c) => c !== drag.draggingId)
    const last = kids.length ? flowNodes.find((f) => f.id === kids[kids.length - 1]) : undefined
    // left side (or dropping on the title's left): the ghost grows to the left
    const toLeft = target.id === map.rootId ? drag.side === 'left' : target.data.dir === -1
    const gx = toLeft ? target.position.x - H_GAP - (dragged.width ?? 0) : target.position.x + (target.width ?? 0) + H_GAP
    const gy = last
      ? last.position.y + (last.height ?? 0) + V_GAP
      : target.position.y + ((target.height ?? 0) - (dragged.height ?? 0)) / 2
    const ghost: MindFlowNode = {
      id: '__ghost',
      type: 'ghost' as 'mind',
      position: { x: gx, y: gy },
      width: dragged.width,
      height: dragged.height,
      draggable: false,
      selectable: false,
      data: { ...dragged.data },
    }
    shownEdges.push({
      id: 'drop-preview',
      source: target.id,
      target: '__ghost',
      sourceHandle: toLeft ? 'sl' : 'sr',
      targetHandle: toLeft ? 'tr' : 'tl',
      type: look.edge.shape,
      animated: !reducedMotion,
      style: { stroke: ACCENT, strokeWidth: 2.5, strokeDasharray: '6 4' },
    })
    return { shownEdges, ghost }
  }, [edges, drag, map, flowNodes, look])

  const shownNodes = useMemo(() => (ghost ? [...nodes, ghost] : nodes), [nodes, ghost])

  // Fit when switching maps or on request.
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.25, duration: DURATION, maxZoom: 1.2 }), 30)
    return () => clearTimeout(t)
  }, [fitToken, map?.id, fitView])

  // 集中モードに入ったら、その枝が画面に収まるように表示する
  useEffect(() => {
    if (!focusId || !map?.nodes[focusId]) return
    const ids: { id: string }[] = []
    const add = (id: string) => {
      ids.push({ id })
      if (!map.nodes[id].collapsed) map.nodes[id].children.forEach(add)
    }
    add(focusId)
    const t = setTimeout(() => fitView({ nodes: ids, padding: 0.3, duration: DURATION, maxZoom: 1.2 }), 30)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId])

  // "中心へ": bring the title to the middle of the screen, keeping the zoom level.
  useEffect(() => {
    if (!centerToken || !map) return
    const root = flowNodes.find((f) => f.id === map.rootId)
    if (!root) return
    setCenter(root.position.x + (root.width ?? 0) / 2, root.position.y + (root.height ?? 0) / 2, {
      zoom: getViewport().zoom,
      duration: DURATION,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerToken])

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

  /**
   * Which node should become the new parent?
   * 1. the node under the mouse pointer
   * 2. the node under the dragged node's left edge (its "connector" side)
   * 3. the node the dragged node overlaps the most
   */
  const findTarget = useCallback(
    (dragged: MindFlowNode, pointer: { x: number; y: number } | null): DragState => {
      const base: DragState = { draggingId: dragged.id, targetId: null, blocked: null }
      if (!map) return base
      // other nodes don't move during a drag, so their layout boxes are reliable
      const candidates = flowNodes.filter((f) => f.id !== dragged.id)
      const contains = (f: MindFlowNode, pt: { x: number; y: number }, pad = 6) =>
        pt.x >= f.position.x - pad &&
        pt.x <= f.position.x + (f.width ?? 0) + pad &&
        pt.y >= f.position.y - pad &&
        pt.y <= f.position.y + (f.height ?? 0) + pad
      const w = dragged.width ?? 0
      const h = dragged.height ?? 0
      const leftEdge = { x: dragged.position.x + 6, y: dragged.position.y + h / 2 }
      const rightEdge = { x: dragged.position.x + w - 6, y: dragged.position.y + h / 2 }

      let best: MindFlowNode | undefined =
        (pointer && candidates.find((f) => contains(f, pointer))) ||
        candidates.find((f) => contains(f, leftEdge)) ||
        candidates.find((f) => contains(f, rightEdge))
      if (!best) {
        const box = { x: dragged.position.x, y: dragged.position.y, w, h }
        let bestArea = 0
        for (const f of candidates) {
          const area = overlapArea(box, { x: f.position.x, y: f.position.y, w: f.width ?? 0, h: f.height ?? 0 })
          if (area > bestArea) {
            bestArea = area
            best = f
          }
        }
      }
      if (!best) return base
      if (isDescendant(map.nodes, dragged.id, best.id)) return { ...base, targetId: best.id, blocked: 'descendant' }
      // dropping on the title in a left-and-right map: the side is where you let go
      let side: DragState['side']
      if (best.id === map.rootId && layoutOf(map) === 'both') {
        const cx = best.position.x + (best.width ?? 0) / 2
        const px = pointer?.x ?? dragged.position.x + w / 2
        side = px < cx ? 'left' : 'right'
      }
      if (map.nodes[dragged.id].parentId === best.id) {
        const sideChanges = side && side !== (dragged.data.dir === -1 ? 'left' : 'right')
        if (!sideChanges) return { ...base, targetId: best.id, blocked: 'same-parent' }
      }
      return { ...base, targetId: best.id, side }
    },
    [flowNodes, map],
  )

  const pointerOf = useCallback(
    (e: MouseEvent | TouchEvent | React.MouseEvent) => {
      const pt = 'touches' in e ? (e.touches[0] ?? e.changedTouches?.[0]) : e
      return pt ? screenToFlowPosition({ x: pt.clientX, y: pt.clientY }) : null
    },
    [screenToFlowPosition],
  )

  const onNodeDragStart: OnNodeDrag<MindFlowNode> = useCallback((_e, n) => {
    useStore.getState().select(n.id)
    useStore.getState().setDrag({ draggingId: n.id, targetId: null, blocked: null })
  }, [])

  const onNodeDrag: OnNodeDrag<MindFlowNode> = useCallback(
    (e, dragged) => {
      const next = findTarget(dragged, pointerOf(e))
      const cur = useStore.getState().drag
      if (!cur || cur.targetId !== next.targetId || cur.blocked !== next.blocked || cur.side !== next.side)
        useStore.getState().setDrag(next)
    },
    [findTarget, pointerOf],
  )

  // Drop onto a node to make it the new parent. Otherwise the node snaps back to its place.
  const onNodeDragStop: OnNodeDrag<MindFlowNode> = useCallback(
    (e, dragged) => {
      const result = findTarget(dragged, pointerOf(e))
      useStore.getState().setDrag(null)
      if (result.targetId && !result.blocked) useStore.getState().moveNode(dragged.id, result.targetId, result.side)
      setNodes(flowNodes)
    },
    [findTarget, pointerOf, setNodes, flowNodes],
  )

  return (
    <div className="canvas" ref={wrapper}>
      <ReactFlow
        nodes={shownNodes}
        edges={shownEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={theme}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => {
          const st = useStore.getState()
          st.select(null)
          if (st.helpOpen) st.setHelpOpen(false)
        }}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        nodesConnectable={false}
        zoomOnDoubleClick={false}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background
          key={look.grid}
          variant={look.grid === 'lines' ? BackgroundVariant.Lines : BackgroundVariant.Dots}
          gap={look.grid === 'lines' ? 28 : 24}
          size={1}
          color="var(--grid)"
        />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
      <DragHint />
      <SearchBar />
      <FocusBanner />
      <div className="canvas-right">
        <SidePicker />
        <MemoPanel />
      </div>
    </div>
  )
}

/** A short sentence at the top of the canvas saying what will happen on drop. */
function DragHint() {
  const drag = useStore((s) => s.drag)
  const map = useStore((s) => (s.currentMapId ? s.maps[s.currentMapId] : null))
  if (!drag || !map) return null
  const name = (id: string) => `「${(map.nodes[id]?.text || '（空）').slice(0, 20)}」`
  const sub = countDescendants(map.nodes, drag.draggingId)
  const subNote = sub > 0 ? `（その先の${sub}個の項目も一緒に移動）` : ''
  let text: string
  let kind = 'idle'
  if (!drag.targetId) {
    text = '移動先の項目に重ねてください。何もない所で離すと元に戻ります'
  } else if (drag.blocked === 'descendant') {
    text = '自分より先（詳しい側）にある項目には移動できません'
    kind = 'blocked'
  } else if (drag.blocked === 'same-parent') {
    text = 'すでにこの項目の詳しい項目です（離すと元に戻ります）'
  } else {
    text = `離すと ${name(drag.targetId)} の詳しい項目として移動します${subNote}`
    kind = 'ok'
  }
  return <div className={`drag-hint ${kind}`}>{text}</div>
}
