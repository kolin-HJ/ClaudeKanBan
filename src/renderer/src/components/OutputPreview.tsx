import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useUiStore } from '../store/uiStore'

interface Props {
  filePath: string
}

export default function OutputPreview({ filePath }: Props) {
  const { closeOutputPreview } = useUiStore()
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.electronAPI.outputs.readFile(filePath).then((c) => {
      setContent(c)
      setLoading(false)
    })
  }, [filePath])

  const fileName = filePath.split(/[/\\]/).pop() ?? filePath
  const isMarkdown = fileName.endsWith('.md') || fileName.endsWith('.markdown')

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && closeOutputPreview()}
    >
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-[700px] max-w-[90vw] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700">
          <span className="text-lg">📄</span>
          <span className="font-medium text-slate-100 flex-1 truncate">{fileName}</span>
          <button
            onClick={closeOutputPreview}
            className="text-slate-400 hover:text-slate-200 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-slate-500 text-sm">Loading…</div>
          ) : content === null ? (
            <div className="text-red-400 text-sm">File not found or could not be read.</div>
          ) : isMarkdown ? (
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          ) : (
            <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-words">
              {content}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 py-2 border-t border-slate-700">
          <span className="text-xs text-slate-500 truncate flex-1">{filePath}</span>
          <button
            onClick={() => window.electronAPI.system.openExternal(filePath)}
            className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
          >
            Open in editor
          </button>
        </div>
      </div>
    </div>
  )
}
