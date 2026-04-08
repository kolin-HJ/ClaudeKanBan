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

type Tab = 'project' | 'global'

export default function Memory() {
  const { activeProjectId } = useProjectStore()
  const [memories, setMemories] = useState<Memory[]>([])
  const [globalPatterns, setGlobalPatterns] = useState<Memory[]>([])
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<MemoryType | 'all'>('all')
  const [editing, setEditing] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [creating, setCreating] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newType, setNewType] = useState<MemoryType>('project_context')
  const [newCategory, setNewCategory] = useState<MemoryCategory | ''>('')
  const [tab, setTab] = useState<Tab>('project')
  const [consolidateResult, setConsolidateResult] = useState<string | null>(null)

  const load = async () => {
    if (!activeProjectId) return
    const list = await window.electronAPI.memory.list(activeProjectId)
    setMemories(list)
  }

  const loadGlobal = async () => {
    try {
      const patterns = await window.electronAPI.memory.globalPatterns()
      setGlobalPatterns(patterns)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    load()
    loadGlobal()
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

  const handleConsolidate = async () => {
    if (!activeProjectId) return
    try {
      const result = await window.electronAPI.memory.consolidate(activeProjectId)
      setConsolidateResult(
        `Merged ${result.merged} duplicate(s), removed ${result.removed} redundant memor${result.removed === 1 ? 'y' : 'ies'}.`
      )
      load()
      setTimeout(() => setConsolidateResult(null), 5000)
    } catch {
      setConsolidateResult('Consolidation failed.')
      setTimeout(() => setConsolidateResult(null), 3000)
    }
  }

  const handleExport = async () => {
    if (!activeProjectId) return
    try {
      const data = await window.electronAPI.memory.exportMemories(activeProjectId)
      const blob = JSON.stringify(data, null, 2)
      // Create download via data URL trick
      const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(blob)
      window.electronAPI.system.openExternal(dataUrl)
    } catch {
      // ignore
    }
  }

  const handleImport = async () => {
    if (!activeProjectId) return
    try {
      const result = await window.electronAPI.system.openDialog({
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
        title: 'Import Memories'
      })
      if (result.canceled || !result.filePaths[0]) return
      const content = await window.electronAPI.outputs.readFile(result.filePaths[0])
      if (!content) return
      const data = JSON.parse(content)
      if (Array.isArray(data)) {
        await window.electronAPI.memory.importMemories(activeProjectId, data)
        load()
      }
    } catch {
      // ignore
    }
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
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 flex-wrap">
        <h2 className="text-sm font-semibold text-slate-200">Memory</h2>

        {/* Project / Global tab toggle */}
        <div className="flex gap-1 bg-slate-800 rounded-lg p-0.5">
          <button
            onClick={() => setTab('project')}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              tab === 'project' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Project
          </button>
          <button
            onClick={() => { setTab('global'); loadGlobal() }}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              tab === 'global' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Global Patterns
          </button>
        </div>

        {tab === 'project' && (
          <>
            <div className="flex items-center gap-1 flex-1">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search memories..."
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

            {/* Action buttons */}
            <div className="flex gap-1">
              <button
                onClick={() => setCreating(true)}
                className="text-xs px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
              >
                + Add
              </button>
              <button
                onClick={handleConsolidate}
                className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
                title="Merge similar/duplicate memories"
              >
                Consolidate
              </button>
              <button
                onClick={handleExport}
                className="text-xs px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
                title="Export memories as JSON"
              >
                Export
              </button>
              <button
                onClick={handleImport}
                className="text-xs px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
                title="Import memories from JSON"
              >
                Import
              </button>
            </div>
          </>
        )}
      </div>

      {/* Consolidation result banner */}
      {consolidateResult && (
        <div className="bg-emerald-900/30 border-b border-emerald-800 px-4 py-2 text-xs text-emerald-300">
          {consolidateResult}
        </div>
      )}

      {/* Create form */}
      {creating && tab === 'project' && (
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
            placeholder="What should Claude remember? (1-3 sentences)"
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
        {tab === 'project' ? (
          filtered.length === 0 ? (
            <div className="text-center text-slate-600 text-sm mt-12">
              {search ? 'No memories matched your search' : 'No memories yet. Add one to get started.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((mem) => (
                <MemoryCard
                  key={mem.id}
                  mem={mem}
                  editing={editing}
                  editContent={editContent}
                  onEdit={(id, content) => { setEditing(id); setEditContent(content) }}
                  onSave={handleUpdate}
                  onCancel={() => setEditing(null)}
                  onDelete={handleDelete}
                  onEditChange={setEditContent}
                />
              ))}
            </div>
          )
        ) : (
          /* Global patterns view */
          globalPatterns.length === 0 ? (
            <div className="text-center text-slate-600 text-sm mt-12">
              No global patterns found. Patterns and conventions with high relevance scores across all projects appear here.
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 mb-3">
                These patterns are shared across all projects and automatically included in new session context.
              </p>
              {globalPatterns.map((mem) => (
                <div
                  key={mem.id}
                  className={`bg-slate-800 border rounded-lg p-3 ${typeColors[mem.type] ?? 'border-slate-700'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${typeColors[mem.type] ?? 'border-slate-600 text-slate-400'}`}>
                      {typeLabels[mem.type] ?? mem.type}
                    </span>
                    {mem.category && (
                      <span className="text-xs text-slate-500">{mem.category}</span>
                    )}
                    <span className="text-xs text-slate-600 ml-auto">
                      score: {mem.relevanceScore?.toFixed(1)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed">{mem.content}</p>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

function MemoryCard({
  mem,
  editing,
  editContent,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onEditChange
}: {
  mem: Memory
  editing: string | null
  editContent: string
  onEdit: (id: string, content: string) => void
  onSave: (id: string) => void
  onCancel: () => void
  onDelete: (id: string) => void
  onEditChange: (content: string) => void
}) {
  return (
    <div className={`bg-slate-800 border rounded-lg p-3 ${typeColors[mem.type]}`}>
      {editing === mem.id ? (
        <div>
          <textarea
            value={editContent}
            onChange={(e) => onEditChange(e.target.value)}
            rows={3}
            className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 resize-none focus:outline-none focus:border-violet-500 mb-2"
          />
          <div className="flex gap-2">
            <button
              onClick={() => onSave(mem.id)}
              className="text-xs px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded transition-colors"
            >
              Save
            </button>
            <button
              onClick={onCancel}
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
              <span className="text-xs text-slate-600 ml-auto">
                {mem.relevanceScore < 1.0 && `score: ${mem.relevanceScore?.toFixed(1)}`}
              </span>
            </div>
            <p className="text-sm text-slate-200 leading-relaxed">{mem.content}</p>
          </div>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => onEdit(mem.id, mem.content)}
              className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(mem.id)}
              className="text-xs px-2 py-1 bg-slate-700 hover:bg-red-700 text-slate-400 hover:text-white rounded transition-colors"
            >
              x
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
