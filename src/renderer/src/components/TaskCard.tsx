import { useEffect } from 'react'
import { FileText } from 'lucide-react'
import { Task } from '../../../shared/types'
import { useTaskStore } from '../store/taskStore'
import { Badge } from './ui/badge'
import { cn } from '../lib/utils'

interface Props {
  task: Task
  onClick: () => void
}

const depthVariant: Record<string, 'default' | 'warning' | 'info'> = {
  quick: 'info',
  campaign: 'warning',
  'deep-build': 'default'
}

const statusDotClass: Record<string, string> = {
  'your-turn': 'bg-primary',
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
      className={cn(
        'bg-card border border-border rounded-md p-3 cursor-pointer',
        'hover:border-border/80 hover:bg-accent/30 transition-all',
        'group select-none'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-2 mb-2">
        <span className={cn('mt-1.5 w-1.5 h-1.5 rounded-full shrink-0', statusDotClass[task.status])} />
        <span className="text-sm font-medium text-foreground leading-snug flex-1 min-w-0">
          {task.title}
        </span>
        <Badge variant={depthVariant[task.depth] ?? 'muted'} className="shrink-0 ml-1">
          {task.depth}
        </Badge>
      </div>

      {/* Running indicator */}
      {sessionStatus === 'running' && (
        <div className="flex items-center gap-1.5 mb-2 text-xs text-amber-400">
          <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
          Running
        </div>
      )}

      {/* Last 2 messages */}
      {lastTwo.length > 0 && (
        <div className="space-y-1 mb-2">
          {lastTwo.map((msg) => (
            <div key={msg.id} className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              <span
                className={cn(
                  'font-medium mr-1',
                  msg.role === 'user' ? 'text-primary/80' : 'text-emerald-400/80'
                )}
              >
                {msg.role === 'user' ? 'You' : 'Claude'}
              </span>
              {msg.content}
            </div>
          ))}
        </div>
      )}

      {/* Outputs */}
      {taskOutputs.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border">
          {taskOutputs.slice(0, 3).map((out) => (
            <span
              key={out.id}
              className="text-xs text-muted-foreground flex items-center gap-1"
            >
              <FileText className="w-3 h-3 shrink-0" />
              <span className="max-w-[80px] truncate">{out.fileName}</span>
            </span>
          ))}
          {taskOutputs.length > 3 && (
            <span className="text-xs text-muted-foreground/60">+{taskOutputs.length - 3}</span>
          )}
        </div>
      )}
    </div>
  )
}
