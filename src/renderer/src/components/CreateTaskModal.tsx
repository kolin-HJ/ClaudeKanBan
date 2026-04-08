import { useState } from 'react'
import { X } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { useTaskStore } from '../store/taskStore'
import { useProjectStore } from '../store/projectStore'
import { TaskDepth, TaskPermission } from '../../../shared/types'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { cn } from '../lib/utils'

const depthOptions: { value: TaskDepth; label: string; desc: string }[] = [
  { value: 'quick', label: 'Quick', desc: 'Single focused task, done in minutes' },
  { value: 'campaign', label: 'Campaign', desc: 'Multi-step goal, several turns' },
  { value: 'deep-build', label: 'Deep Build', desc: 'Complex project with phases' }
]

const permissionOptions: { value: TaskPermission; label: string; desc: string }[] = [
  { value: 'default', label: 'Default', desc: 'Claude asks before risky operations' },
  { value: 'full-auto', label: 'Full Auto', desc: 'Skip all permission prompts' }
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
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && closeCreateTask()}
    >
      <div className="bg-card border border-border rounded-lg p-5 w-[520px] max-w-full mx-4 shadow-2xl shadow-black/50">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-foreground">New Goal</h2>
          <button
            onClick={closeCreateTask}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-accent"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Title */}
        <div className="mb-4">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider block mb-1.5">
            Goal
          </label>
          <Textarea
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What do you want Claude to accomplish?"
            rows={3}
          />
        </div>

        {/* Description */}
        <div className="mb-4">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider block mb-1.5">
            Context <span className="text-muted-foreground/40 font-normal normal-case">(optional)</span>
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Extra details, constraints, or context..."
            rows={2}
          />
        </div>

        {/* Depth */}
        <div className="mb-4">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider block mb-2">
            Depth
          </label>
          <div className="grid grid-cols-3 gap-2">
            {depthOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDepth(opt.value)}
                className={cn(
                  'text-left p-2.5 rounded-md border transition-colors',
                  depth === opt.value
                    ? 'border-primary/40 bg-primary/10 text-foreground'
                    : 'border-border hover:border-border/80 hover:bg-accent text-muted-foreground'
                )}
              >
                <div className="text-xs font-medium mb-0.5">{opt.label}</div>
                <div className="text-xs text-muted-foreground/70 leading-tight">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Permission */}
        <div className="mb-4">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider block mb-2">
            Permission
          </label>
          <div className="grid grid-cols-2 gap-2">
            {permissionOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPermission(opt.value)}
                className={cn(
                  'text-left p-2.5 rounded-md border transition-colors',
                  permission === opt.value
                    ? 'border-primary/40 bg-primary/10 text-foreground'
                    : 'border-border hover:border-border/80 hover:bg-accent text-muted-foreground'
                )}
              >
                <div className="text-xs font-medium mb-0.5">{opt.label}</div>
                <div className="text-xs text-muted-foreground/70 leading-tight">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Auto start */}
        <label className="flex items-center gap-2.5 mb-5 cursor-pointer">
          <div
            onClick={() => setAutoStart(!autoStart)}
            className={cn(
              'w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer',
              autoStart ? 'bg-primary border-primary' : 'border-border bg-input'
            )}
          >
            {autoStart && (
              <svg className="w-2.5 h-2.5 text-primary-foreground" viewBox="0 0 10 10" fill="none">
                <path d="M2 5l2.5 2.5L8 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <span className="text-sm text-foreground">Start session immediately</span>
        </label>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={closeCreateTask}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!title.trim() || loading}
          >
            {loading ? 'Creating...' : autoStart ? 'Create & Start' : 'Create Goal'}
          </Button>
        </div>
      </div>
    </div>
  )
}
