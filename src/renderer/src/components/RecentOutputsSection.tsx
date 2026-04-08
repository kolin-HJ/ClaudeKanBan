import { useEffect, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useUiStore } from '../store/uiStore'

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
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-1">
        Recent Outputs
      </h3>
      <div className="space-y-1">
        {outputs.map((out) => (
          <div
            key={out.id}
            className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
          >
            <span className="text-base">📄</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-slate-200 truncate">{out.fileName}</div>
              <div className="text-xs text-slate-500 truncate">{out.taskTitle}</div>
            </div>
            <div className="text-xs text-slate-500 shrink-0">{timeAgo(out.createdAt)}</div>
            <button
              onClick={() => openOutputPreview(out.filePath)}
              className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors shrink-0"
            >
              Preview
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
