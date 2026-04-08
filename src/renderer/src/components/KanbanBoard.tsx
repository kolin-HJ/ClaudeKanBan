import { useTaskStore } from '../store/taskStore'
import { useUiStore } from '../store/uiStore'
import TaskCard from './TaskCard'
import { TaskStatus } from '../../../shared/types'
import { cn } from '../lib/utils'

const COLUMNS: { status: TaskStatus; label: string; dotClass: string }[] = [
  { status: 'your-turn', label: 'Your Turn', dotClass: 'bg-primary' },
  { status: 'in-progress', label: "In Progress", dotClass: 'bg-amber-400' },
  { status: 'done', label: 'Done', dotClass: 'bg-emerald-400' }
]

export default function KanbanBoard() {
  const { getTasksByStatus } = useTaskStore()
  const { selectTask } = useUiStore()

  return (
    <div className="flex gap-3 h-full p-4 overflow-hidden">
      {COLUMNS.map((col) => {
        const tasks = getTasksByStatus(col.status)
        return (
          <div key={col.status} className="flex flex-col flex-1 min-w-0">
            {/* Column header */}
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', col.dotClass)} />
              <span className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
                {col.label}
              </span>
              <span className="ml-auto text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-medium">
                {tasks.length}
              </span>
            </div>

            {/* Divider */}
            <div className="h-px bg-border mb-3" />

            {/* Task cards */}
            <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-0.5">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={() => selectTask(task.id)}
                />
              ))}
              {tasks.length === 0 && (
                <div className="text-xs text-muted-foreground/40 text-center mt-10 select-none">
                  Empty
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
