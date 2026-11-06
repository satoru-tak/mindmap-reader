import { parseOutline, type Clip } from './clipboard'
import type { MapMode, MindMap, MindNodeData, NodeRecord } from './types'

/**
 * Markdown の書き出し・読み込み。
 *
 * 書き出しの形（MindNode・XMind・Mindomo などが読み込める形に合わせる）:
 *   # タイトル
 *   ## タイトルのすぐ下の項目
 *   - その下の項目
 *     - さらに下の項目
 * 読書モードの情報は文章に入れて残す：引用は “ ”、ページは（p.12）
 */
export const MD_EXT = '.md'

const label = (n: MindNodeData) => {
  let t = n.text.replace(/\s*\n\s*/g, ' ').trim() || '（空）'
  if (n.kind === 'quote') t = `“${t}”`
  if (n.page) t += `（p.${n.page}）`
  return t
}

export function toMarkdown(map: MindMap): string {
  const { nodes, rootId } = map
  const out: string[] = [`# ${label(nodes[rootId]) === '（空）' ? '無題' : nodes[rootId].text.replace(/\s*\n\s*/g, ' ')}`]
  /** メモは「> 」の行で書く（MindNode などでは引用として表示され、読み込むとメモに戻る） */
  const note = (n: MindNodeData, indent: string) =>
    n.note ? n.note.split('\n').map((l) => `${indent}> ${l}`) : []
  const list = (id: string, depth: number) => {
    for (const k of nodes[id].children) {
      out.push(`${'  '.repeat(depth)}- ${label(nodes[k])}`)
      out.push(...note(nodes[k], '  '.repeat(depth + 1)))
      list(k, depth + 1)
    }
  }
  if (nodes[rootId].note) out.push('', ...note(nodes[rootId], ''))
  for (const k of nodes[rootId].children) {
    out.push('', `## ${label(nodes[k])}`)
    if (nodes[k].note) out.push('', ...note(nodes[k], ''))
    if (nodes[k].children.length) out.push('')
    list(k, 0)
  }
  return out.join('\n') + '\n'
}

/** “引用”（p.12）の形を、引用とページ番号に戻す */
function restoreReading(c: Clip): Clip {
  let text = c.text
  let page: string | undefined
  const pm = text.match(/\s*[（(]p\.\s*([0-9０-９][0-9０-９\-–,、 ]*)[）)]\s*$/)
  if (pm) {
    page = pm[1].trim()
    text = text.slice(0, pm.index).trim()
  }
  const quoted = /^[“"「].*[”"」]$/.test(text) && text.length >= 2
  const out: Clip = { text: quoted ? text.slice(1, -1).trim() : text, children: c.children.map(restoreReading) }
  if (c.note) out.note = c.note
  if (quoted) out.kind = 'quote'
  if (page) out.page = page
  return out
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

/**
 * Markdown（見出し・箇条書き）や、字下げしたテキストからマップを作る。
 * 一番上の見出しが1つだけならそれをタイトルに、そうでなければファイル名をタイトルにする。
 */
export function parseMarkdownMap(text: string, fileTitle: string): MindMap | null {
  const clips = parseOutline(text).map(restoreReading)
  if (!clips.length) return null
  const single = clips.length === 1
  const rootClip: Clip = single ? clips[0] : { text: fileTitle || '無題', children: clips }
  const nodes: NodeRecord = {}
  let reading = false
  const add = (c: Clip, parentId: string | null): string => {
    const id = newId()
    const n: MindNodeData = { id, parentId, text: c.text, children: [], collapsed: false }
    if (parentId && c.kind === 'quote') n.kind = 'quote'
    if (parentId && c.page) n.page = c.page
    if (c.note) n.note = c.note
    if (n.kind || n.page) reading = true
    nodes[id] = n
    n.children = c.children.map((k) => add(k, id))
    return id
  }
  const rootId = add(rootClip, null)
  const mode: MapMode = reading ? 'reading' : 'free'
  const now = Date.now()
  return { id: newId(), title: nodes[rootId].text || '無題', mode, rootId, nodes, createdAt: now, updatedAt: now }
}

export const isMarkdownFile = (name: string) => /\.(md|markdown|txt)$/i.test(name)
