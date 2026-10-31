import type { NodeRecord } from './types'

export const H_GAP = 56
export const V_GAP = 12
const MAX_WIDTH = 260
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
export function measureNode(text: string, depth: number) {
  const { size, weight } = fontFor(depth)
  const lineHeight = Math.round(size * 1.45)
  const inner = MAX_WIDTH - PAD_X * 2
  const lines = (text || '　').split('\n')
  let width = 0
  let lineCount = 0
  for (const line of lines) {
    const w = measureLine(line || '　', size, weight)
    width = Math.max(width, Math.min(w, inner))
    lineCount += Math.max(1, Math.ceil(w / inner))
  }
  return {
    width: Math.max(MIN_WIDTH, Math.ceil(width) + PAD_X * 2 + 2),
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
export function layoutTree(nodes: NodeRecord, rootId: string): LaidOutNode[] {
  const out: LaidOutNode[] = []
  const sizes = new Map<string, { width: number; height: number }>()
  const bandHeight = new Map<string, number>()

  const visibleChildren = (id: string) => (nodes[id].collapsed ? [] : nodes[id].children)

  const measure = (id: string, depth: number): number => {
    const size = measureNode(nodes[id].text, depth)
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

  if (!nodes[rootId]) return out
  measure(rootId, 0)
  place(rootId, 0, 0, 0, -1)
  return out
}

/** Calm, low-saturation branch colours (low stimulus by design). */
export const BRANCH_COLORS = ['#5b8def', '#3fa58a', '#d08a3c', '#a873c9', '#d0607a', '#4aa3b5', '#8a9a3c']
export const branchColor = (branch: number) =>
  branch < 0 ? '#3b4250' : BRANCH_COLORS[branch % BRANCH_COLORS.length]
