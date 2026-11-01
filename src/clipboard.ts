import type { NodeKind, NodeRecord } from './types'

/** A copied branch, independent of node ids. */
export interface Clip {
  text: string
  page?: string
  kind?: NodeKind
  collapsed?: boolean
  children: Clip[]
}

export function toClip(nodes: NodeRecord, id: string): Clip {
  const n = nodes[id]
  const c: Clip = { text: n.text, children: n.children.map((k) => toClip(nodes, k)) }
  if (n.page) c.page = n.page
  if (n.kind) c.kind = n.kind
  if (n.collapsed) c.collapsed = true
  return c
}

/**
 * Plain-text outline for other apps (Markdown list, 2 spaces per level).
 * Reading-mode info is written into the text so it survives: “quote” (p.12)
 */
export function toOutline(clip: Clip, depth = 0): string {
  let label = clip.text.replace(/\n/g, ' ')
  if (clip.kind === 'quote') label = `“${label}”`
  if (clip.page) label += `（p.${clip.page}）`
  const line = `${'  '.repeat(depth)}- ${label}`
  return [line, ...clip.children.map((c) => toOutline(c, depth + 1))].join('\n')
}

/**
 * Turn pasted plain text into branches. Indentation (spaces / tabs) becomes hierarchy;
 * list markers (-, *, +, 1.) and Markdown headings (#) are removed.
 */
export function parseOutline(text: string): Clip[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim())
  const roots: Clip[] = []
  const stack: { indent: number; clip: Clip }[] = []
  // Markdown headings nest by level, and list items under a heading become its children
  let headingIndent = -1
  for (const raw of lines) {
    const expanded = raw.replace(/\t/g, '    ')
    let indent = expanded.length - expanded.trimStart().length
    let body = expanded.trim()
    const heading = body.match(/^(#{1,6})\s+/)
    if (heading) {
      indent = (heading[1].length - 1) * 1000 // # = top, ## = below it, …
      headingIndent = indent
      body = body.slice(heading[0].length)
    } else if (headingIndent >= 0) {
      indent += headingIndent + 500
    }
    body = body.replace(/^([-*+•・]|\d+[.)])\s+/, '').trim()
    if (!body) continue
    const clip: Clip = { text: body, children: [] }
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    if (stack.length) stack[stack.length - 1].clip.children.push(clip)
    else roots.push(clip)
    stack.push({ indent, clip })
  }
  return roots
}

/** What was last copied inside the app (keeps page / quote info that plain text loses). */
let internal: { outline: string; clips: Clip[] } | null = null
export const setInternalClip = (outline: string, clips: Clip[]) => {
  internal = { outline, clips }
}
/** If the pasted text is what we copied ourselves, use the rich version. */
export const clipsForPaste = (text: string): Clip[] =>
  internal && text.trim() === internal.outline.trim() ? internal.clips : parseOutline(text)
export const getInternalClips = (): Clip[] | null => internal?.clips ?? null
