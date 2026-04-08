import { useEffect, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface OutputItem {
  id: string
  taskId: string
  taskTitle?: string
  filePath: string
  fileName: string
  previewText?: string
  createdAt: string
}

export default function Outputs() {
  const { activeProjectId } = useProjectStore()
  const [outputs, setOutputs] = useState<OutputItem[]>([])
  const [selected, setSelected] = useState<OutputItem | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (!activeProjectId) return
    setLoading(true)
    try {
      const items = await window.electronAPI.outputs.recent(activeProjectId, 100)
      setOutputs(items)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [activeProjectId])

  const handleSelect = async (item: OutputItem) => {
    setSelected(item)
    const content = await window.electronAPI.outputs.readFile(item.filePath)
    setFileContent(content ?? '')
  }

  const isMarkdown = (fileName: string) =>
    fileName.endsWith('.md') || fileName.endsWith('.markdown') || fileName.endsWith('.txt')

  const formatDate = (ts: string) => {
    const d = new Date(ts)
    const now = Date.now()
    const diff = now - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  if (!activeProjectId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600 text-sm">
        Select a project to view outputs
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel — file list */}
      <div className="w-72 shrink-0 border-r border-slate-800 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-200">Outputs</h2>
          <button
            onClick={load}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            ↻
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && outputs.length === 0 ? (
            <div className="flex items-center justify-center mt-12 text-slate-600 text-xs">
              Loading…
            </div>
          ) : outputs.length === 0 ? (
            <div className="flex items-center justify-center mt-12 text-slate-600 text-xs">
              No outputs yet
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {outputs.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className={`
                    w-full text-left px-3 py-2 rounded-lg border transition-colors
                    ${selected?.id === item.id
                      ? 'bg-violet-700/30 border-violet-600'
                      : 'border-transparent hover:bg-slate-800 hover:border-slate-700'
                    }
                  `}
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-slate-400 text-xs">📄</span>
                    <span className="text-xs text-slate-200 truncate flex-1">{item.fileName}</span>
                  </div>
                  {item.taskTitle && (
                    <div className="text-xs text-slate-500 truncate">{item.taskTitle}</div>
                  )}
                  <div className="text-xs text-slate-600 mt-0.5">{formatDate(item.createdAt)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel — file content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-slate-200 flex-1">{selected.fileName}</h2>
              <span className="text-xs text-slate-500 truncate max-w-[300px]">{selected.filePath}</span>
              <button
                onClick={() => window.electronAPI.system.openExternal(selected.filePath)}
                className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors shrink-0"
              >
                Open externally
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {fileContent ? (
                isMarkdown(selected.fileName) ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{fileContent}</ReactMarkdown>
                  </div>
                ) : (
                  <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {fileContent}
                  </pre>
                )
              ) : (
                <div className="text-slate-600 text-sm">File is empty or could not be read</div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-600 text-sm">
            Select an output file to preview it
          </div>
        )}
      </div>
    </div>
  )
}
