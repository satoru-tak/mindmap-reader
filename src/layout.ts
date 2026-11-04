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
}

/**
 * Left-to-right tree layout: root on the left, children to the right,
 * each subtree gets a vertical band and the parent is centred on it.
 */
export function layoutTree(
  nodes: NodeRecord,
  rootId: string,
  editing?: { id: string; text: string } | null,
  showReading = false,
  /** 線がつながる高さ。center＝ノードの真ん中、bottom＝ノードの下の端（下線の形） */
  anchor: 'center' | 'bottom' = 'center',
): LaidOutNode[] {
  const out: LaidOutNode[] = []
  const sizes = new Map<string, { width: number; height: number }>()
  const bandHeight = new Map<string, number>()

  const visibleChildren = (id: string) => (nodes[id].collapsed ? [] : nodes[id].children)

  const measure = (id: string, depth: number): number => {
    const n = nodes[id]
    const extra = showReading && depth > 0 ? readingExtra(n.page, n.kind === 'quote') : 0
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

  const place = (id: string, depth: number, x: number, top: number, branch: number) => {
    const size = sizes.get(id)!
    const band = bandHeight.get(id)!
    out.push({ id, x, y: top + band / 2 - size.height / 2, ...size, depth, branch })
    const kids = visibleChildren(id)
    let kidsHeight = 0
    kids.forEach((k, i) => (kidsHeight += bandHeight.get(k)! + (i > 0 ? V_GAP : 0)))
    let cursor = top + band / 2 - kidsHeight / 2
    kids.forEach((k, i) => {
      place(k, depth + 1, x + size.width + H_GAP, cursor, depth === 0 ? i : branch)
      cursor += bandHeight.get(k)! + V_GAP
    })
  }

  /*
   * 下線の形：線は各ノードの下の端につながる。親の下の端を、最初と最後の子の
   * 下の端のちょうど真ん中に置く。子が1つ（または奇数個の真ん中）なら、
   * 親と子の下線が一直線になる。タイトル（カード）だけは真ん中につながる。
   */
  type Block = { items: LaidOutNode[]; height: number; anchor: number }
  const anchorOf = (h: number, depth: number) => (depth > 0 ? h : h / 2)
  const block = (id: string, depth: number, x: number, branch: number): Block => {
    const size = sizes.get(id)!
    const own = anchorOf(size.height, depth)
    const kids = visibleChildren(id)
    if (!kids.length) {
      return { items: [{ id, x, y: 0, ...size, depth, branch }], height: size.height, anchor: own }
    }
    const childX = x + size.width + H_GAP
    let cursor = 0
    const placed: { b: Block; top: number }[] = []
    kids.forEach((k, i) => {
      const b = block(k, depth + 1, childX, depth === 0 ? i : branch)
      placed.push({ b, top: cursor })
      cursor += b.height + V_GAP
    })
    const stack = cursor - V_GAP
    const first = placed[0]
    const last = placed[placed.length - 1]
    const mid = (first.top + first.b.anchor + last.top + last.b.anchor) / 2
    const selfTop = mid - own
    const shift = Math.max(0, -selfTop)
    const items: LaidOutNode[] = [{ id, x, y: selfTop + shift, ...size, depth, branch }]
    for (const { b, top } of placed) for (const it of b.items) items.push({ ...it, y: it.y + top + shift })
    return { items, height: Math.max(stack, selfTop + size.height) + shift, anchor: mid + shift }
  }

  if (!nodes[rootId]) return out
  measure(rootId, 0)
  if (anchor === 'bottom') return block(rootId, 0, 0, -1).items
  place(rootId, 0, 0, 0, -1)
  return out
}
