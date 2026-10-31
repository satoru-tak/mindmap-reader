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
  },
  'mind'
>

function MindNodeView({ id, data, width, height }: NodeProps<MindFlowNode>) {
  const selected = useStore((s) => s.selectedId === id)
  const editing = useStore((s) => s.editingId === id)
  const dropState = useStore((s) =>
    s.drag?.targetId === id ? (s.drag.blocked ? 'drop-blocked' : 'drop-target') : '',
  )
  const { select, startEdit, commitEdit, addChild, toggleCollapse } = useStore.getState()
  const { size, weight } = fontFor(data.depth)
  const isRoot = data.depth === 0

  return (
    <div
      className={`mind-node depth-${Math.min(data.depth, 2)}${selected ? ' selected' : ''}${editing ? ' editing' : ''}${data.quote ? ' quote' : ''} ${dropState}`}
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
      <Handle type="target" position={Position.Left} className="mind-handle" isConnectable={false} />
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
      <Handle type="source" position={Position.Right} className="mind-handle" isConnectable={false} />
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
