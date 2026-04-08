import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { useUiStore } from '../store/uiStore'
import { Button } from './ui/button'

interface RecentOutput {
  id: string
  taskId: string
  filePath: string
  fileName: string
  previewText?: string
  createdAt: string
  taskTitle: string
}

export default function RecentOutputsSection() {
  const { activeProjectId } = useProjectStore()
  const { openOutputPreview } = useUiStore()
  const [outputs, setOutputs] = useState<RecentOutput[]>([])

  useEffect(() => {
    if (!activeProjectId) return
    window.electronAPI.outputs.recent(activeProjectId, 10).then(setOutputs)
  }, [activeProjectId])

  if (outputs.length === 0) return null

  const timeAgo = (dateStr: string) => {
    const ms = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(ms / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
        Recent Outputs
      </h3>
      <div className="space-y-1">
        {outputs.map((out) => (
          <div
            key={out.id}
            className="flex items-center gap-2.5 bg-card border border-border rounded-md px-3 py-2"
          >
            <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground truncate">{out.fileName}</div>
              <div className="text-xs text-muted-foreground/60 truncate">{out.taskTitle}</div>
            </div>
            <span className="text-xs text-muted-foreground/40 shrink-0">{timeAgo(out.createdAt)}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openOutputPreview(out.filePath)}
              className="h-6 px-2 text-xs shrink-0"
            >
              Preview
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
