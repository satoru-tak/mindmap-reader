import { useEffect, useRef, useState } from 'react'
import { useStore } from './store'
import { backupFileName, downloadText, exportJson, FILE_EXT, parseImport, safeFileName } from './transfer'

/** Read files chosen or dropped by the user and add the maps they contain. */
export async function importFiles(files: FileList | File[]) {
  const { importMaps, showToast } = useStore.getState()
  const all = []
  const failed: string[] = []
  for (const f of Array.from(files)) {
    const res = parseImport(await f.text())
    if (res.ok) all.push(...res.maps)
    else failed.push(`${f.name}：${res.reason}`)
  }
  if (all.length) importMaps(all)
  if (failed.length) showToast(`読み込めませんでした ― ${failed.join(' / ')}`, 'error')
  else if (all.length) showToast(`${all.length}件のマップを読み込みました`)
}

export function exportCurrent() {
  const { maps, currentMapId, showToast } = useStore.getState()
  const map = currentMapId ? maps[currentMapId] : null
  if (!map) return
  const ok = downloadText(safeFileName(map.title) + FILE_EXT, exportJson([map]))
  showToast(ok ? `「${map.title}」を書き出しました（ダウンロードフォルダ）` : '書き出せませんでした', ok ? 'info' : 'error')
}

export function exportAll() {
  const { maps, showToast } = useStore.getState()
  const list = Object.values(maps).sort((a, b) => b.updatedAt - a.updatedAt)
  const ok = downloadText(backupFileName(), exportJson(list))
  showToast(ok ? `${list.length}件のマップをバックアップしました（ダウンロードフォルダ）` : '書き出せませんでした', ok ? 'info' : 'error')
}

let openPicker: (() => void) | null = null
/** Open the file chooser (used by the keyboard shortcut). */
export const openFilePicker = () => openPicker?.()

/** Sidebar section: export / backup / open. */
export function FileMenu() {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    openPicker = () => input.current?.click()
    return () => {
      openPicker = null
    }
  }, [])
  return (
    <div className="file-menu">
      <div className="file-menu-title">ファイル</div>
      <button onClick={exportCurrent} title="今開いているマップをファイルに保存">
        このマップを書き出す
      </button>
      <button onClick={exportAll} title="すべてのマップを1つのファイルに保存">
        すべてバックアップ
      </button>
      <button onClick={() => input.current?.click()} title="書き出したファイルを開く（画面にドロップしても可）">
        ファイルを開く…
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void importFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** Full-window drop zone: drop exported files anywhere to open them. */
export function DropZone() {
  const [active, setActive] = useState(false)
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setActive(true)
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (!depth) setActive(false)
    }
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault()
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setActive(false)
      if (e.dataTransfer?.files.length) void importFiles(e.dataTransfer.files)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])
  if (!active) return null
  return (
    <div className="drop-zone">
      <div className="drop-zone-inner">ここにファイルを離すと、マップとして読み込みます</div>
    </div>
  )
}

export function Toast() {
  const toast = useStore((s) => s.toast)
  if (!toast) return null
  return (
    <div className={`toast ${toast.kind}`} role="status" key={toast.id}>
      {toast.text}
    </div>
  )
}
