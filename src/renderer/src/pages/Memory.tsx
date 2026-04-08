import { useEffect, useState } from 'react'
import type { Memory, MemoryType, MemoryCategory } from '../../../shared/types'
import { useProjectStore } from '../store/projectStore'

const typeOptions: MemoryType[] = [
  'project_context',
  'task_learning',
  'feedback',
  'pattern',
  'blocker'
]

const typeLabels: Record<MemoryType, string> = {
  project_context: 'Project Context',
  task_learning: 'Task Learning',
  feedback: 'Feedback',
  pattern: 'Pattern',
  blocker: 'Blocker'
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

const typeColors: Record<MemoryType, string> = {
  project_context: 'bg-sky-900/40 text-sky-300 border-sky-800',
  task_learning: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
  feedback: 'bg-violet-900/40 text-violet-300 border-violet-800',
  pattern: 'bg-amber-900/40 text-amber-300 border-amber-800',
  blocker: 'bg-red-900/40 text-red-300 border-red-800'
}

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

  const filtered = memories.filter(
    (m) => filterType === 'all' || m.type === filterType
  )

  if (!activeProjectId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600 text-sm">
        Select a project to manage memories
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
        <h2 className="text-sm font-semibold text-slate-200">Memory</h2>
        <div className="flex items-center gap-1 flex-1">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search memories…"
            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 w-48"
          />
          <button
            onClick={handleSearch}
            className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
          >
            Search
          </button>
          {search && (
            <button
              onClick={() => { setSearch(''); load() }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Filter by type */}
        <div className="flex gap-1">
          <button
            onClick={() => setFilterType('all')}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              filterType === 'all'
                ? 'bg-slate-600 text-slate-100'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            All
          </button>
          {typeOptions.map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                filterType === t
                  ? typeColors[t]
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {typeLabels[t]}
            </button>
          ))}
        </div>

        <button
          onClick={() => setCreating(true)}
          className="text-xs px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
        >
          + Add Memory
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="bg-slate-800 border-b border-slate-700 p-4">
          <h3 className="text-xs font-semibold text-slate-300 mb-3">New Memory</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as MemoryType)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-violet-500"
              >
                {typeOptions.map((t) => (
                  <option key={t} value={t}>
                    {typeLabels[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Category (optional)</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as MemoryCategory | '')}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-violet-500"
              >
                <option value="">None</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <textarea
            autoFocus
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="What should Claude remember? (1–3 sentences)"
            rows={3}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 resize-none focus:outline-none focus:border-violet-500 mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newContent.trim()}
              className="px-4 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg transition-colors"
            >
              Save Memory
            </button>
            <button
              onClick={() => setCreating(false)}
              className="px-4 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Memory list */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="text-center text-slate-600 text-sm mt-12">
            {search ? 'No memories matched your search' : 'No memories yet. Add one to get started.'}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((mem) => (
              <div
                key={mem.id}
                className={`bg-slate-800 border rounded-lg p-3 ${typeColors[mem.type]}`}
              >
                {editing === mem.id ? (
                  <div>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 resize-none focus:outline-none focus:border-violet-500 mb-2"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdate(mem.id)}
                        className="text-xs px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${typeColors[mem.type]}`}>
                          {typeLabels[mem.type]}
                        </span>
                        {mem.category && (
                          <span className="text-xs text-slate-500">{mem.category}</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-200 leading-relaxed">{mem.content}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => { setEditing(mem.id); setEditContent(mem.content) }}
                        className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(mem.id)}
                        className="text-xs px-2 py-1 bg-slate-700 hover:bg-red-700 text-slate-400 hover:text-white rounded transition-colors"
                      >
                        ×
                      </button>
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
