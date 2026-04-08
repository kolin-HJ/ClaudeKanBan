import { useEffect } from 'react'
import { Task } from '../../../shared/types'
import { useTaskStore } from '../store/taskStore'

interface Props {
  task: Task
  onClick: () => void
}

const depthColors: Record<string, string> = {
  quick: 'bg-sky-900/40 text-sky-300',
  campaign: 'bg-amber-900/40 text-amber-300',
  'deep-build': 'bg-purple-900/40 text-purple-300'
}

const statusDot: Record<string, string> = {
  'your-turn': 'bg-violet-400',
  'in-progress': 'bg-amber-400 animate-pulse',
  done: 'bg-emerald-400'
}

export default function TaskCard({ task, onClick }: Props) {
  const { messages, outputs, loadMessages, loadOutputs, sessionStatuses } = useTaskStore()

  useEffect(() => {
    loadMessages(task.id)
    loadOutputs(task.id)
  }, [task.id])

  const taskMessages = messages[task.id] ?? []
  const taskOutputs = outputs[task.id] ?? []
  const lastTwo = taskMessages.slice(-2)
  const sessionStatus = sessionStatuses[task.id]

  return (
    <div
      onClick={onClick}
      className="
        bg-slate-800 border border-slate-700 rounded-lg p-3 cursor-pointer
        hover:border-slate-600 hover:bg-slate-750 transition-all
        group select-none
      "
    >
      {/* Header */}
      <div className="flex items-start gap-2 mb-2">
        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${statusDot[task.status]}`} />
        <span className="text-sm font-medium text-slate-100 leading-snug flex-1">
          {task.title}
        </span>
        <span
          className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${depthColors[task.depth] ?? ''}`}
        >
          {task.depth}
        </span>
      </div>

      {/* Session indicator */}
      {sessionStatus === 'running' && (
        <div className="flex items-center gap-1 mb-2 text-xs text-amber-400">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Running…
        </div>
      )}

      {/* Last 2 messages */}
      {lastTwo.length > 0 && (
        <div className="space-y-1 mb-2">
          {lastTwo.map((msg) => (
            <div key={msg.id} className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
              <span
                className={`font-medium mr-1 ${msg.role === 'user' ? 'text-violet-400' : 'text-emerald-400'}`}
              >
                {msg.role === 'user' ? 'You:' : 'Claude:'}
              </span>
              {msg.content}
            </div>
          ))}
        </div>
      )}

      {/* Outputs */}
      {taskOutputs.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {taskOutputs.slice(0, 3).map((out) => (
            <span
              key={out.id}
              className="text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded flex items-center gap-1"
            >
              <span>📄</span>
              <span className="max-w-[80px] truncate">{out.fileName}</span>
            </span>
          ))}
          {taskOutputs.length > 3 && (
            <span className="text-xs text-slate-500">+{taskOutputs.length - 3} more</span>
          )}
        </div>
      )}
    </div>
  )
}
