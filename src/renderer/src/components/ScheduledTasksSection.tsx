import { useEffect, useState } from 'react'
import { Play, Trash2, Check, X } from 'lucide-react'
import { ScheduledTask } from '../../../shared/types'
import { Button } from './ui/button'
import { cn } from '../lib/utils'

export default function ScheduledTasksSection() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])

  const load = async () => {
    const list = await window.electronAPI.scheduled.list()
    setTasks(list)
  }

  useEffect(() => {
    load()
  }, [])

  if (tasks.length === 0) return null

  const handleRun = async (id: string) => {
    await window.electronAPI.scheduled.run(id)
    load()
  }

  const handleToggle = async (id: string) => {
    await window.electronAPI.scheduled.toggle(id)
    load()
  }

  const handleDelete = async (id: string) => {
    await window.electronAPI.scheduled.delete(id)
    load()
  }

  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
        Scheduled Tasks
      </h3>
      <div className="space-y-1">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center gap-2.5 bg-card border border-border rounded-md px-3 py-2"
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground truncate">{task.name}</div>
              <div className="text-xs text-muted-foreground/60">{task.schedule}</div>
            </div>
            {task.lastRun && (
              <div className="flex items-center gap-1 text-xs shrink-0">
                {task.lastStatus === 'success' ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <X className="w-3 h-3 text-red-400" />
                )}
                <span className="text-muted-foreground/60">
                  {new Date(task.lastRun).toLocaleDateString()}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRun(task.id)}
                className="h-6 w-6"
              >
                <Play className="w-3 h-3" />
              </Button>
              <button
                onClick={() => handleToggle(task.id)}
                className={cn(
                  'text-xs px-2 py-0.5 rounded transition-colors',
                  task.active
                    ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                {task.active ? 'On' : 'Off'}
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(task.id)}
                className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
