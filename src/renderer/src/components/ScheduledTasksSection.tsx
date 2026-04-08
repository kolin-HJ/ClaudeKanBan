import { useEffect, useState } from 'react'
import { ScheduledTask } from '../../../shared/types'

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
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-1">
        Scheduled Tasks
      </h3>
      <div className="space-y-1">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
          >
            <span className="text-base">⏱</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-slate-200">{task.name}</div>
              <div className="text-xs text-slate-500">{task.schedule}</div>
            </div>
            {task.lastRun && (
              <div className="text-xs text-slate-500 shrink-0">
                <span
                  className={
                    task.lastStatus === 'success' ? 'text-emerald-400' : 'text-red-400'
                  }
                >
                  {task.lastStatus === 'success' ? '✓' : '✗'}
                </span>{' '}
                {new Date(task.lastRun).toLocaleDateString()}
              </div>
            )}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => handleRun(task.id)}
                className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
              >
                Run
              </button>
              <button
                onClick={() => handleToggle(task.id)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  task.active
                    ? 'bg-emerald-800 hover:bg-emerald-700 text-emerald-300'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-400'
                }`}
              >
                {task.active ? 'On' : 'Off'}
              </button>
              <button
                onClick={() => handleDelete(task.id)}
                className="text-xs px-2 py-1 bg-slate-700 hover:bg-red-700 text-slate-400 hover:text-white rounded transition-colors"
              >
                Del
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
