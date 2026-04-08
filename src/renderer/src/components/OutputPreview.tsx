import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { X, FileText, ExternalLink } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { Button } from './ui/button'

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
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && closeOutputPreview()}
    >
      <div className="bg-card border border-border rounded-lg shadow-2xl shadow-black/50 w-[700px] max-w-[90vw] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
          <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="font-medium text-foreground text-sm flex-1 truncate">{fileName}</span>
          <button
            onClick={closeOutputPreview}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-accent"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-muted-foreground text-sm">Loading...</div>
          ) : content === null ? (
            <div className="text-destructive text-sm">File not found or could not be read.</div>
          ) : isMarkdown ? (
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          ) : (
            <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap break-words leading-relaxed">
              {content}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border">
          <span className="text-xs text-muted-foreground/60 truncate flex-1 font-mono">{filePath}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.electronAPI.system.openExternal(filePath)}
          >
            <ExternalLink className="w-3 h-3" />
            Open in editor
          </Button>
        </div>
      </div>
    </div>
  )
}
