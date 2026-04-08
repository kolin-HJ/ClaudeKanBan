import { useEffect, useState } from 'react'
import { RefreshCw, FileText, ExternalLink } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '../components/ui/button'
import { cn } from '../lib/utils'

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
    const diff = Date.now() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  if (!activeProjectId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground/40 text-sm">
        Select a project to view outputs
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className="w-72 shrink-0 border-r border-border flex flex-col">
        <div className="flex items-center justify-between px-4 h-10 border-b border-border shrink-0">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Outputs
          </span>
          <Button variant="ghost" size="icon" onClick={load} className="h-7 w-7">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && outputs.length === 0 ? (
            <div className="flex items-center justify-center mt-12 text-muted-foreground/40 text-xs">
              Loading...
            </div>
          ) : outputs.length === 0 ? (
            <div className="flex items-center justify-center mt-12 text-muted-foreground/40 text-xs">
              No outputs yet
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {outputs.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className={cn(
                    'w-full text-left px-2.5 py-2 rounded-md border transition-colors',
                    selected?.id === item.id
                      ? 'bg-primary/10 border-primary/20 text-foreground'
                      : 'border-transparent hover:bg-accent text-muted-foreground hover:text-foreground'
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <FileText className="w-3 h-3 shrink-0 text-muted-foreground" />
                    <span className="text-xs font-medium truncate flex-1">{item.fileName}</span>
                  </div>
                  {item.taskTitle && (
                    <div className="text-xs text-muted-foreground/60 truncate pl-4">
                      {item.taskTitle}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground/40 pl-4 mt-0.5">
                    {formatDate(item.createdAt)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="flex items-center gap-3 px-4 h-10 border-b border-border shrink-0">
              <span className="text-sm font-medium text-foreground flex-1 truncate">
                {selected.fileName}
              </span>
              <span className="text-xs text-muted-foreground/50 font-mono truncate max-w-[280px] hidden lg:block">
                {selected.filePath}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.electronAPI.system.openExternal(selected.filePath)}
                className="shrink-0 h-7"
              >
                <ExternalLink className="w-3 h-3" />
                Open
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {fileContent ? (
                isMarkdown(selected.fileName) ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{fileContent}</ReactMarkdown>
                  </div>
                ) : (
                  <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {fileContent}
                  </pre>
                )
              ) : (
                <div className="text-muted-foreground/40 text-sm">
                  File is empty or could not be read
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground/40 text-sm">
            Select an output to preview it
          </div>
        )}
      </div>
    </div>
  )
}
