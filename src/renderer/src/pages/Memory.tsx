import { useEffect, useState } from 'react'
import { Plus, Trash2, Check } from 'lucide-react'
import type { Memory, MemoryType, MemoryCategory } from '../../../shared/types'
import { useProjectStore } from '../store/projectStore'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/utils'

const typeOptions: MemoryType[] = [
  'project_context',
  'task_learning',
  'feedback',
  'pattern',
  'blocker'
]

const typeLabels: Record<MemoryType, string> = {
  project_context: 'Context',
  task_learning: 'Learning',
  feedback: 'Feedback',
  pattern: 'Pattern',
  blocker: 'Blocker'
}

const typeVariant: Record<MemoryType, 'info' | 'success' | 'default' | 'warning' | 'secondary'> = {
  project_context: 'info',
  task_learning: 'success',
  feedback: 'default',
  pattern: 'warning',
  blocker: 'secondary'
}

const categoryOptions: MemoryCategory[] = [
  'architecture',
  'convention',
  'debugging',
  'performance',
  'brand_voice',
  'workflow',
  'dependency'
]

export default function Memory() {
  const { activeProjectId } = useProjectStore()
  const [memories, setMemories] = useState<Memory[]>([])
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<MemoryType | 'all'>('all')
  const [editing, setEditing] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [creating, setCreating] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newType, setNewType] = useState<MemoryType>('project_context')
  const [newCategory, setNewCategory] = useState<MemoryCategory | ''>('')

  const load = async () => {
    if (!activeProjectId) return
    const list = await window.electronAPI.memory.list(activeProjectId)
    setMemories(list)
  }

  useEffect(() => {
    load()
  }, [activeProjectId])

  const handleSearch = async () => {
    if (!activeProjectId || !search.trim()) {
      load()
      return
    }
    const results = await window.electronAPI.memory.search(activeProjectId, search)
    setMemories(results)
  }

  const handleCreate = async () => {
    if (!activeProjectId || !newContent.trim()) return
    await window.electronAPI.memory.create(activeProjectId, {
      type: newType,
      category: newCategory || undefined,
      content: newContent.trim(),
      source: 'user_input'
    })
    setCreating(false)
    setNewContent('')
    setNewCategory('')
    load()
  }

  const handleUpdate = async (id: string) => {
    await window.electronAPI.memory.update(id, editContent)
    setEditing(null)
    load()
  }

  const handleDelete = async (id: string) => {
    await window.electronAPI.memory.delete(id)
    load()
  }

  const filtered = memories.filter((m) => filterType === 'all' || m.type === filterType)

  if (!activeProjectId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground/40 text-sm">
        Select a project to manage memories
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Memory</span>
        <div className="flex items-center gap-1 flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search..."
            className="h-7 text-xs w-40"
          />
          {search && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(''); load() }}
              className="h-7 text-xs"
            >
              Clear
            </Button>
          )}
        </div>

        <div className="flex gap-1">
          <button
            onClick={() => setFilterType('all')}
            className={cn(
              'text-xs px-2 py-1 rounded transition-colors',
              filterType === 'all' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            All
          </button>
          {typeOptions.map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={cn(
                'text-xs px-2 py-1 rounded transition-colors',
                filterType === t ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {typeLabels[t]}
            </button>
          ))}
        </div>

        <Button size="sm" onClick={() => setCreating(true)} className="h-7">
          <Plus className="w-3 h-3" />
          Add
        </Button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="border-b border-border p-4 bg-card/50">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">
            New Memory
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as MemoryType)}
                className="w-full bg-input border border-border rounded-md px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {typeOptions.map((t) => (
                  <option key={t} value={t}>{typeLabels[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as MemoryCategory | '')}
                className="w-full bg-input border border-border rounded-md px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">None</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <Textarea
            autoFocus
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="What should Claude remember? (1-3 sentences)"
            rows={3}
            className="mb-3 text-sm"
          />
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={!newContent.trim()}>
              Save Memory
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Memory list */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="text-center text-muted-foreground/40 text-sm mt-12">
            {search ? 'No memories matched your search' : 'No memories yet'}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((mem) => (
              <div
                key={mem.id}
                className="bg-card border border-border rounded-md p-3"
              >
                {editing === mem.id ? (
                  <div>
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      className="mb-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleUpdate(mem.id)} className="h-7">
                        <Check className="w-3 h-3" />
                        Save
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(null)} className="h-7">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge variant={typeVariant[mem.type]}>
                          {typeLabels[mem.type]}
                        </Badge>
                        {mem.category && (
                          <span className="text-xs text-muted-foreground">{mem.category}</span>
                        )}
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">{mem.content}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setEditing(mem.id); setEditContent(mem.content) }}
                        className="h-7 px-2 text-xs"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(mem.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
