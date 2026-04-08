import { useState } from 'react'
import { useUiStore } from '../store/uiStore'
import { useTaskStore } from '../store/taskStore'
import { useProjectStore } from '../store/projectStore'
import { TaskDepth, TaskPermission } from '../../../shared/types'

const depthOptions: { value: TaskDepth; label: string; desc: string }[] = [
  { value: 'quick', label: 'Quick', desc: 'Single focused task, done in minutes' },
  { value: 'campaign', label: 'Campaign', desc: 'Multi-step goal, may take several turns' },
  { value: 'deep-build', label: 'Deep Build', desc: 'Complex project with phases and planning' }
]

const permissionOptions: { value: TaskPermission; label: string; desc: string }[] = [
  { value: 'default', label: 'Default', desc: 'Claude asks before risky operations' },
  { value: 'full-auto', label: 'Full Auto', desc: 'Skip all permission prompts (use with care)' }
]

export default function CreateTaskModal() {
  const { closeCreateTask, selectTask } = useUiStore()
  const { createTask, spawnSession } = useTaskStore()
  const { activeProjectId } = useProjectStore()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [depth, setDepth] = useState<TaskDepth>('quick')
  const [permission, setPermission] = useState<TaskPermission>('default')
  const [autoStart, setAutoStart] = useState(true)
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!title.trim() || !activeProjectId) return
    setLoading(true)
    try {
      const task = await createTask(activeProjectId, {
        title: title.trim(),
        description: description.trim() || undefined,
        depth,
        permission
      })
      closeCreateTask()
      selectTask(task.id)
      if (autoStart) {
        await spawnSession(task.id)
      }
    } catch (err) {
      console.error('Failed to create task:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && closeCreateTask()}
    >
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-[540px] max-w-full mx-4 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">New Goal</h2>

        {/* Title */}
        <div className="mb-4">
          <label className="text-xs text-slate-400 font-medium uppercase tracking-wide block mb-1">
            Goal / Task
          </label>
          <textarea
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What do you want Claude to accomplish?"
            rows={3}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 resize-none focus:outline-none focus:border-violet-500 transition-colors"
          />
        </div>

        {/* Description */}
        <div className="mb-4">
          <label className="text-xs text-slate-400 font-medium uppercase tracking-wide block mb-1">
            Additional context <span className="text-slate-600 font-normal">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Any extra details, constraints, or context…"
            rows={2}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 resize-none focus:outline-none focus:border-violet-500 transition-colors"
          />
        </div>

        {/* Depth */}
        <div className="mb-4">
          <label className="text-xs text-slate-400 font-medium uppercase tracking-wide block mb-2">
            Depth
          </label>
          <div className="grid grid-cols-3 gap-2">
            {depthOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDepth(opt.value)}
                className={`
                  text-left p-2.5 rounded-lg border transition-colors
                  ${
                    depth === opt.value
                      ? 'border-violet-500 bg-violet-900/30 text-slate-100'
                      : 'border-slate-600 hover:border-slate-500 text-slate-300'
                  }
                `}
              >
                <div className="text-sm font-medium">{opt.label}</div>
                <div className="text-xs text-slate-500 mt-0.5 leading-tight">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Permission */}
        <div className="mb-4">
          <label className="text-xs text-slate-400 font-medium uppercase tracking-wide block mb-2">
            Permission
          </label>
          <div className="grid grid-cols-2 gap-2">
            {permissionOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPermission(opt.value)}
                className={`
                  text-left p-2.5 rounded-lg border transition-colors
                  ${
                    permission === opt.value
                      ? 'border-violet-500 bg-violet-900/30 text-slate-100'
                      : 'border-slate-600 hover:border-slate-500 text-slate-300'
                  }
                `}
              >
                <div className="text-sm font-medium">{opt.label}</div>
                <div className="text-xs text-slate-500 mt-0.5 leading-tight">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Auto start */}
        <label className="flex items-center gap-2 mb-5 cursor-pointer">
          <input
            type="checkbox"
            checked={autoStart}
            onChange={(e) => setAutoStart(e.target.checked)}
            className="w-4 h-4 rounded accent-violet-500"
          />
          <span className="text-sm text-slate-300">Start Claude session immediately</span>
        </label>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={closeCreateTask}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || loading}
            className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
          >
            {loading ? 'Creating…' : autoStart ? 'Create & Start →' : 'Create Goal'}
          </button>
        </div>
      </div>
    </div>
  )
}
