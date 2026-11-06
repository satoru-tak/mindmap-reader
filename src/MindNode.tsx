import { memo, useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { useStore } from './store'
import { fontFor } from './layout'

export type MindFlowNode = Node<
  {
    text: string
    depth: number
    color: string
    childCount: number
    collapsed: boolean
    hiddenCount: number
    page?: string
    quote?: boolean
    /** 1 = タイトルの右側、-1 = 左側 */
    dir?: 1 | -1
  },
  'mind'
>

function MindNodeView({ id, data, width, height }: NodeProps<MindFlowNode>) {
  const selected = useStore((s) => s.selectedId === id)
  const editing = useStore((s) => s.editingId === id)
  const flashing = useStore((s) => s.flashId === id)
  const dropState = useStore((s) =>
    s.drag?.targetId === id ? (s.drag.blocked ? 'drop-blocked' : 'drop-target') : '',
  )
  const { select, startEdit, commitEdit, addChild, toggleCollapse } = useStore.getState()
  const { size, weight } = fontFor(data.depth)
  const isRoot = data.depth === 0

  return (
    <div
      className={`mind-node depth-${Math.min(data.depth, 2)}${selected ? ' selected' : ''}${editing ? ' editing' : ''}${data.quote ? ' quote' : ''}${flashing ? ' flash' : ''}${data.dir === -1 ? ' side-left' : ''} ${dropState}`}
      style={
        {
          width,
          minHeight: height,
          fontSize: size,
          fontWeight: weight,
          '--branch': data.color,
        } as React.CSSProperties
      }
      onClick={(e) => {
        e.stopPropagation()
        select(id)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        startEdit(id)
      }}
    >
      {/* both sides get connection points; the edges pick the side they need */}
      <Handle id="tl" type="target" position={Position.Left} className="mind-handle" isConnectable={false} />
      <Handle id="tr" type="target" position={Position.Right} className="mind-handle" isConnectable={false} />
      <Handle id="sl" type="source" position={Position.Left} className="mind-handle" isConnectable={false} />
      {dropState === 'drop-target' && <span className="drop-badge">ここに移動</span>}
      <div className="mind-body">
      {data.quote && <span className="quote-mark" aria-label="引用">“</span>}
      {editing ? (
        <NodeEditor
          initial={data.text}
          onDraft={(text) => useStore.getState().setDraft(id, text)}
          onCommit={(text) => commitEdit(id, text)}
          onCommitAndAddChild={(text) => {
            commitEdit(id, text)
            // only add a child if the node survived (non-empty)
            if (useStore.getState().maps[useStore.getState().currentMapId!]?.nodes[id]) addChild(id)
          }}
        />
      ) : (
        <div className={`mind-text${data.text ? '' : ' placeholder'}`}>
          {data.text || (isRoot ? 'タイトル' : '（空）')}
        </div>
      )}
      {data.page && <span className="page-badge">p.{data.page}</span>}
      </div>
      {data.childCount > 0 && (
        <button
          className="collapse-btn nodrag"
          title={data.collapsed ? '展開する' : '折りたたむ'}
          onClick={(e) => {
            e.stopPropagation()
            toggleCollapse(id)
          }}
        >
          {data.collapsed ? data.hiddenCount : '−'}
        </button>
      )}
      <Handle id="sr" type="source" position={Position.Right} className="mind-handle" isConnectable={false} />
    </div>
  )
}

function NodeEditor({
  initial,
  onDraft,
  onCommit,
  onCommitAndAddChild,
}: {
  initial: string
  onDraft: (text: string) => void
  onCommit: (text: string) => void
  onCommitAndAddChild: (text: string) => void
}) {
  const [text, setText] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    if (useStore.getState().editCaretEnd) el.setSelectionRange(el.value.length, el.value.length)
    else el.select()
  }, [])

  // keep textarea height in sync with content
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = el.scrollHeight + 'px'
  }, [text])

  const finish = (fn: (t: string) => void, value: string) => {
    if (done.current) return
    done.current = true
    fn(value)
  }

  return (
    <textarea
      ref={ref}
      className="mind-editor nodrag nopan nowheel"
      value={text}
      rows={1}
      placeholder="入力して Enter"
      onChange={(e) => {
        setText(e.target.value)
        onDraft(e.target.value)
      }}
      onBlur={() => finish(onCommit, text)}
      onKeyDown={(e) => {
        // Never react while the Japanese IME is composing (Enter confirms the conversion).
        if (e.nativeEvent.isComposing || e.keyCode === 229) return
        e.stopPropagation()
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          finish(onCommit, text)
        } else if (e.key === 'Tab') {
          e.preventDefault()
          const st = useStore.getState()
          const isNewEmpty = !text.trim() && st.lastAddedId === st.editingId
          if (isNewEmpty) {
            // pressed Enter by mistake? Tab turns the empty new item into a detail of the
            // starting item; Shift+Tab turns a new detail into an item next to it
            const before = st.editingId
            done.current = true // this editor is about to be replaced; don't commit it on blur
            st.retargetNew(e.shiftKey ? 'sibling' : 'child')
            if (useStore.getState().editingId === before) done.current = false // nothing changed
            return
          }
          if (e.shiftKey) return
          finish(onCommitAndAddChild, text)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          finish(onCommit, initial)
        }
      }}
    />
  )
}

export default memo(MindNodeView)
