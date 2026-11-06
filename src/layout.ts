import type { NodeRecord } from './types'

export const H_GAP = 56
export const V_GAP = 12
const MAX_WIDTH = 300
/** while editing, a node may grow wider before it wraps, so typing extends sideways */
export const EDIT_MAX_WIDTH = 480
const MIN_WIDTH = 64
const PAD_X = 14
const PAD_Y = 8

export function fontFor(depth: number) {
  if (depth === 0) return { size: 18, weight: 700 }
  if (depth === 1) return { size: 15, weight: 600 }
  return { size: 14, weight: 400 }
}

const FONT_FAMILY =
  '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic UI", Meiryo, system-ui, sans-serif'

let ctx: CanvasRenderingContext2D | null = null
function measureLine(text: string, size: number, weight: number) {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return text.length * size
  ctx.font = `${weight} ${size}px ${FONT_FAMILY}`
  return ctx.measureText(text).width
}

/** Estimate the rendered size of a node so the tree can be laid out before React renders it. */
export const QUOTE_EXTRA = 18 // room for the “ mark of a quote
export const PAGE_FONT = 11
/** room for the memo mark */
export const NOTE_EXTRA = 26

/** extra width taken by reading-mode decorations (quote mark, page badge) */
export function readingExtra(page: string | undefined, quote: boolean) {
  let w = quote ? QUOTE_EXTRA : 0
  if (page) w += measureLine('p.' + page, PAGE_FONT, 600) + 18
  return Math.ceil(w)
}

export function measureNode(text: string, depth: number, maxWidth = MAX_WIDTH, editing = false, extra = 0) {
  const { size, weight } = fontFor(depth)
  const lineHeight = Math.round(size * 1.45)
  const inner = maxWidth - PAD_X * 2 - extra
  const lines = (text || '　').split('\n')
  let width = 0
  let lineCount = 0
  for (const line of lines) {
    const w = measureLine(line || '　', size, weight)
    width = Math.max(width, Math.min(w, inner))
    lineCount += Math.max(1, Math.ceil(w / inner))
  }
  return {
    // editing: leave room for the caret and one more character so text never wraps early
    width: Math.max(editing ? 120 : MIN_WIDTH, Math.ceil(width) + PAD_X * 2 + 2 + extra + (editing ? size + 4 : 0)),
    height: lineCount * lineHeight + PAD_Y * 2 + 2,
  }
}

export interface LaidOutNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  depth: number
  branch: number // index of the top-level branch, used for colour
  /** 1 = タイトルの右側、-1 = 左側（タイトル自身は 1） */
  dir: 1 | -1
}

export interface LayoutOptions {
  editing?: { id: string; text: string } | null
  showReading?: boolean
  /** 線がつながる高さ。center＝ノードの真ん中、bottom＝ノードの下の端（下線の形） */
  anchor?: 'center' | 'bottom'
  /** 左右に枝を伸ばすか */
  both?: boolean
}

/**
 * 左右の振り分け。上から順に、右側の高さが全体の半分になるまで右、残りを左に置く
 * （順番は保ったまま）。本人が左右を決めた枝は、その指定を優先する。
 */
export function assignSides(nodes: NodeRecord, kids: string[], heights: number[]): ('left' | 'right')[] {
  const total = heights.reduce((a, b) => a + b, 0)
  let right = 0
  let switched = false // 一度左に移ったら、後ろの枝は左に置く（上からの順番を保つ）
  return kids.map((k, i) => {
    const fixed = nodes[k].side
    let side = fixed
    if (!side) {
      if (!switched && (i === 0 || right + heights[i] / 2 <= total / 2)) side = 'right'
      else {
        side = 'left'
        switched = true
      }
    }
    if (side === 'right') right += heights[i]
    return side
  })
}

/**
 * Tree layout. The title sits in the middle; branches grow to the right (and, with both,
 * also to the left). Each subtree gets a vertical band and its parent is placed on it.
 */
export function layoutTree(nodes: NodeRecord, rootId: string, opts: LayoutOptions = {}): LaidOutNode[] {
  const { editing, showReading = false, anchor = 'center', both = false } = opts
  const sizes = new Map<string, { width: number; height: number }>()
  const bandHeight = new Map<string, number>()

  const visibleChildren = (id: string) => (nodes[id].collapsed ? [] : nodes[id].children)

  const measure = (id: string, depth: number): number => {
    const n = nodes[id]
    const extra = (showReading && depth > 0 ? readingExtra(n.page, n.kind === 'quote') : 0) + (n.note ? NOTE_EXTRA : 0)
    const size =
      editing && editing.id === id
        ? measureNode(editing.text, depth, EDIT_MAX_WIDTH, true, extra)
        : measureNode(n.text, depth, MAX_WIDTH, false, extra)
    sizes.set(id, size)
    const kids = visibleChildren(id)
    let kidsHeight = 0
    kids.forEach((k, i) => {
      kidsHeight += measure(k, depth + 1) + (i > 0 ? V_GAP : 0)
    })
    const h = Math.max(size.height, kidsHeight)
    bandHeight.set(id, h)
    return h
  }

  /*
   * A block = a node and everything under it, laid out with its own top at y = 0.
   * anchor: the height where the line into this block connects.
   *  - center: the middle of the node; the parent sits in the middle of its children's band
   *  - bottom (下線の形): the bottom edge; the parent's bottom sits halfway between the
   *    first and the last child's bottoms, so a single (or middle) child continues in a straight line
   */
  type Block = { items: LaidOutNode[]; height: number; anchor: number }
  const anchorOf = (h: number, depth: number) => (anchor === 'bottom' && depth > 0 ? h : h / 2)

  /** stack blocks top to bottom; returns them with tops relative to the stack */
  const stack = (kids: string[], depth: number, place: (k: string) => Block) => {
    let cursor = 0
    const placed: { b: Block; top: number }[] = []
    for (const k of kids) {
      const b = place(k)
      placed.push({ b, top: cursor })
      cursor += b.height + V_GAP
    }
    const height = Math.max(0, cursor - V_GAP)
    const first = placed[0]
    const last = placed[placed.length - 1]
    const mid =
      anchor === 'bottom' && first
        ? (first.top + first.b.anchor + last.top + last.b.anchor) / 2
        : height / 2
    void depth
    return { placed, height, mid }
  }

  const block = (id: string, depth: number, x: number, branch: number, dir: 1 | -1): Block => {
    const size = sizes.get(id)!
    const own = anchorOf(size.height, depth)
    const kids = visibleChildren(id)
    const self = (y: number): LaidOutNode => ({ id, x, y, ...size, depth, branch, dir })
    if (!kids.length) return { items: [self(0)], height: size.height, anchor: own }
    const s = stack(kids, depth + 1, (k) => {
      const kx = dir === 1 ? x + size.width + H_GAP : x - H_GAP - sizes.get(k)!.width
      return block(k, depth + 1, kx, branch, dir)
    })
    const selfTop = s.mid - own
    const shift = Math.max(0, -selfTop)
    const items: LaidOutNode[] = [self(selfTop + shift)]
    for (const { b, top } of s.placed) for (const it of b.items) items.push({ ...it, y: it.y + top + shift })
    return { items, height: Math.max(s.height, selfTop + size.height) + shift, anchor: s.mid + shift }
  }

  if (!nodes[rootId]) return []
  measure(rootId, 0)
  const root = sizes.get(rootId)!
  const kids = visibleChildren(rootId)
  const sides = both ? assignSides(nodes, kids, kids.map((k) => bandHeight.get(k)!)) : kids.map(() => 'right' as const)
  const branchOf = new Map(kids.map((k, i) => [k, i]))
  const sideBlocks = (side: 'left' | 'right') => {
    const list = kids.filter((_, i) => sides[i] === side)
    return stack(list, 1, (k) => {
      const kx = side === 'right' ? root.width + H_GAP : -H_GAP - sizes.get(k)!.width
      return block(k, 1, kx, branchOf.get(k)!, side === 'right' ? 1 : -1)
    })
  }
  const R = sideBlocks('right')
  const L = sideBlocks('left')
  // both sides line up on the title's own connection height
  const rootAnchor = root.height / 2
  const out: LaidOutNode[] = [{ id: rootId, x: 0, y: 0, ...root, depth: 0, branch: -1, dir: 1 }]
  for (const side of [R, L]) {
    const top = rootAnchor - side.mid
    for (const { b, top: t } of side.placed) for (const it of b.items) out.push({ ...it, y: it.y + t + top })
  }
  // keep every y ≥ 0 (positions are relative; this keeps the numbers tidy)
  const minY = Math.min(...out.map((o) => o.y))
  return minY < 0 ? out.map((o) => ({ ...o, y: o.y - minY })) : out
}
