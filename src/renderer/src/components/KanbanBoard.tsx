import { useTaskStore } from '../store/taskStore'
import { useUiStore } from '../store/uiStore'
import TaskCard from './TaskCard'
import { TaskStatus } from '../../../shared/types'

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'your-turn', label: 'Your Turn', color: 'border-violet-500' },
  { status: 'in-progress', label: "Claude's Turn", color: 'border-amber-500' },
  { status: 'done', label: 'Done', color: 'border-emerald-500' }
]

export default function KanbanBoard() {
  const { getTasksByStatus } = useTaskStore()
  const { selectTask } = useUiStore()

  return (
    <div className="flex gap-4 h-full p-4 overflow-hidden">
      {COLUMNS.map((col) => {
        const tasks = getTasksByStatus(col.status)
        return (
          <div key={col.status} className="flex flex-col flex-1 min-w-0">
            {/* Column header */}
            <div className={`flex items-center gap-2 mb-3 pb-2 border-b-2 ${col.color}`}>
              <span className="font-semibold text-sm text-slate-200">{col.label}</span>
              <span className="ml-auto text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded-full">
                {tasks.length}
              </span>
            </div>

            {/* Task cards */}
            <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-1">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={() => selectTask(task.id)}
                />
              ))}
              {tasks.length === 0 && (
                <div className="text-xs text-slate-600 italic text-center mt-8">
                  {col.status === 'your-turn' ? 'No tasks waiting for you' : 'Empty'}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
