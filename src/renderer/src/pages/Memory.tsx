import { useEffect, useState } from 'react'
import type { Memory, MemoryType, MemoryCategory } from '../../../shared/types'
import { useProjectStore } from '../store/projectStore'
import api from '../lib/ipc'

const typeLabels: Record<MemoryType, string> = {
  project_context: 'Context',
  task_learning: 'Learning',
  feedback: 'Feedback',
  pattern: 'Pattern',
  blocker: 'Blocker'
}

const hallLabels: Record<string, string> = {
  hall_facts: 'Facts',
  hall_events: 'Events',
  hall_discoveries: 'Discoveries',
  hall_preferences: 'Preferences',
  hall_advice: 'Advice'
}

const hallColors: Record<string, string> = {
  hall_facts: 'bg-blue-900/40 text-blue-300 border-blue-800',
  hall_events: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
  hall_discoveries: 'bg-amber-900/40 text-amber-300 border-amber-800',
  hall_preferences: 'bg-violet-900/40 text-violet-300 border-violet-800',
  hall_advice: 'bg-pink-900/40 text-pink-300 border-pink-800'
}

type Tab = 'palace' | 'kg' | 'diary' | 'identity' | 'search' | 'global'

export default function Memory() {
  const { activeProjectId } = useProjectStore()
  const [tab, setTab] = useState<Tab>('palace')

  if (!activeProjectId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600 text-sm">
        Select a project to manage memories
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-800 bg-slate-950/50">
        <h2 className="text-sm font-semibold text-slate-200 mr-3">Memory Palace</h2>
        {(['palace', 'kg', 'diary', 'identity', 'search', 'global'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-2.5 py-1 rounded text-xs capitalize transition-colors ${
              tab === t ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {t === 'kg' ? 'Knowledge Graph' : t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'palace' && <PalaceTab projectId={activeProjectId} />}
        {tab === 'kg' && <KnowledgeGraphTab />}
        {tab === 'diary' && <DiaryTab projectId={activeProjectId} />}
        {tab === 'identity' && <IdentityTab projectId={activeProjectId} />}
        {tab === 'search' && <SearchTab projectId={activeProjectId} />}
        {tab === 'global' && <GlobalTab />}
      </div>
    </div>
  )
}

// ─── Palace Tab ──────────────────────────────────────────────────────────────

function PalaceTab({ projectId }: { projectId: string }) {
  const [stats, setStats] = useState<any>(null)
  const [rooms, setRooms] = useState<Record<string, number>>({})
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null)
  const [roomMemories, setRoomMemories] = useState<Memory[]>([])
  const [consolidateMsg, setConsolidateMsg] = useState('')

  useEffect(() => {
    api.palace.stats(projectId).then(setStats)
    api.palace.rooms(projectId).then(setRooms)
  }, [projectId])

  const loadRoom = async (room: string) => {
    setSelectedRoom(room)
    const mems = await api.palace.search(projectId, '*', { room })
    setRoomMemories(mems)
  }

  const handleConsolidate = async () => {
    const result = await api.memory.consolidate(projectId)
    setConsolidateMsg(`Merged ${result.merged}, removed ${result.removed}`)
    api.palace.stats(projectId).then(setStats)
    api.palace.rooms(projectId).then(setRooms)
    setTimeout(() => setConsolidateMsg(''), 4000)
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Room grid */}
      <div className="w-64 shrink-0 border-r border-slate-800 overflow-y-auto p-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-slate-500 uppercase tracking-wide">Rooms</span>
          <button
            onClick={handleConsolidate}
            className="text-xs px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
          >
            Consolidate
          </button>
        </div>
        {consolidateMsg && (
          <div className="text-xs text-emerald-400 mb-2">{consolidateMsg}</div>
        )}

        {/* Stats summary */}
        {stats && (
          <div className="bg-slate-800/50 rounded-lg p-2 mb-3 text-xs text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Total memories</span>
              <span className="text-slate-200">{stats.totalMemories}</span>
            </div>
            {stats.wing && (
              <div className="flex justify-between">
                <span>Wing</span>
                <span className="text-violet-400">{stats.wing}</span>
              </div>
            )}
          </div>
        )}

        {/* Hall distribution */}
        {stats?.byHall && Object.keys(stats.byHall).length > 0 && (
          <div className="mb-3">
            <span className="text-xs text-slate-600 block mb-1">Halls</span>
            <div className="space-y-1">
              {Object.entries(stats.byHall).map(([hall, count]) => (
                <div key={hall} className={`flex justify-between text-xs px-2 py-1 rounded border ${hallColors[hall] ?? 'border-slate-700 text-slate-400'}`}>
                  <span>{hallLabels[hall] ?? hall}</span>
                  <span>{count as number}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Room list */}
        <div className="space-y-1">
          {Object.entries(rooms).map(([room, count]) => (
            <button
              key={room}
              onClick={() => loadRoom(room)}
              className={`w-full flex justify-between text-xs px-2 py-1.5 rounded transition-colors ${
                selectedRoom === room
                  ? 'bg-violet-700/30 border border-violet-600 text-slate-200'
                  : 'hover:bg-slate-800 text-slate-400 border border-transparent'
              }`}
            >
              <span>{room}</span>
              <span className="text-slate-600">{count}</span>
            </button>
          ))}
          {Object.keys(rooms).length === 0 && (
            <p className="text-xs text-slate-600 text-center mt-4">No rooms yet. Memories will be auto-classified into rooms.</p>
          )}
        </div>
      </div>

      {/* Right: Room memories */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedRoom ? (
          <>
            <h3 className="text-sm font-medium text-slate-200 mb-3">Room: {selectedRoom}</h3>
            <div className="space-y-2">
              {roomMemories.map((m: any) => (
                <div key={m.id} className="bg-slate-800 rounded-lg p-3 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    {m.hall && (
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${hallColors[m.hall] ?? 'border-slate-600'}`}>
                        {hallLabels[m.hall] ?? m.hall}
                      </span>
                    )}
                    <span className="text-xs text-slate-500">{typeLabels[m.type as MemoryType] ?? m.type}</span>
                    {m.importance > 1.0 && (
                      <span className="text-xs text-amber-400">imp: {m.importance?.toFixed(1)}</span>
                    )}
                  </div>
                  <p className="text-slate-200 leading-relaxed">{m.content}</p>
                </div>
              ))}
              {roomMemories.length === 0 && (
                <p className="text-slate-600 text-sm">No memories in this room yet.</p>
              )}
            </div>
          </>
        ) : (
          <div className="text-center text-slate-600 text-sm mt-12">
            Select a room to browse its memories, or use the Search tab for full-text search.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Knowledge Graph Tab ─────────────────────────────────────────────────────

function KnowledgeGraphTab() {
  const [entities, setEntities] = useState<any[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [triples, setTriples] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [newEntity, setNewEntity] = useState({ name: '', type: 'concept' })
  const [newTriple, setNewTriple] = useState({ subject: '', predicate: '', object: '' })

  useEffect(() => {
    api.kg.listEntities().then(setEntities)
    api.kg.stats().then(setStats)
  }, [])

  const selectEntity = async (name: string) => {
    setSelected(name)
    const t = await api.kg.queryEntity(name)
    setTriples(t)
  }

  const handleAddEntity = async () => {
    if (!newEntity.name.trim()) return
    await api.kg.addEntity(newEntity.name.trim(), newEntity.type)
    api.kg.listEntities().then(setEntities)
    setNewEntity({ name: '', type: 'concept' })
  }

  const handleAddTriple = async () => {
    if (!newTriple.subject || !newTriple.predicate || !newTriple.object) return
    await api.kg.addTriple(newTriple.subject, newTriple.predicate, newTriple.object)
    setNewTriple({ subject: '', predicate: '', object: '' })
    if (selected) selectEntity(selected)
    api.kg.stats().then(setStats)
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Entity list */}
      <div className="w-56 shrink-0 border-r border-slate-800 overflow-y-auto p-3">
        <span className="text-xs text-slate-500 uppercase tracking-wide block mb-2">Entities</span>

        {stats && (
          <div className="bg-slate-800/50 rounded p-2 mb-3 text-xs text-slate-400 space-y-0.5">
            <div className="flex justify-between"><span>Entities</span><span>{stats.entities}</span></div>
            <div className="flex justify-between"><span>Facts</span><span>{stats.currentFacts}</span></div>
            <div className="flex justify-between"><span>Expired</span><span>{stats.expiredFacts}</span></div>
          </div>
        )}

        {/* Add entity form */}
        <div className="mb-3 space-y-1">
          <input
            value={newEntity.name}
            onChange={(e) => setNewEntity((s) => ({ ...s, name: e.target.value }))}
            placeholder="Entity name"
            className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500"
          />
          <div className="flex gap-1">
            <select
              value={newEntity.type}
              onChange={(e) => setNewEntity((s) => ({ ...s, type: e.target.value }))}
              className="flex-1 bg-slate-700 border border-slate-600 rounded px-1 py-1 text-xs text-slate-100 focus:outline-none focus:border-violet-500"
            >
              {['person', 'project', 'concept', 'technology', 'file', 'service'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button onClick={handleAddEntity} className="text-xs px-2 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded">Add</button>
          </div>
        </div>

        <div className="space-y-0.5">
          {entities.map((e: any) => (
            <button
              key={e.id}
              onClick={() => selectEntity(e.name)}
              className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                selected === e.name ? 'bg-violet-700/30 border border-violet-600 text-slate-200' : 'text-slate-400 hover:bg-slate-800 border border-transparent'
              }`}
            >
              <span>{e.name}</span>
              <span className="text-slate-600 ml-1">({e.entityType})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Right: Entity triples / timeline */}
      <div className="flex-1 overflow-y-auto p-4">
        {selected ? (
          <>
            <h3 className="text-sm font-medium text-slate-200 mb-3">Entity: {selected}</h3>

            {/* Add triple form */}
            <div className="bg-slate-800/50 rounded-lg p-3 mb-4">
              <span className="text-xs text-slate-500 block mb-2">Add Fact</span>
              <div className="flex gap-1">
                <input value={newTriple.subject} onChange={(e) => setNewTriple((s) => ({ ...s, subject: e.target.value }))} placeholder="Subject" className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500" />
                <input value={newTriple.predicate} onChange={(e) => setNewTriple((s) => ({ ...s, predicate: e.target.value }))} placeholder="predicate" className="w-28 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500" />
                <input value={newTriple.object} onChange={(e) => setNewTriple((s) => ({ ...s, object: e.target.value }))} placeholder="Object" className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500" />
                <button onClick={handleAddTriple} className="text-xs px-2 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded">Add</button>
              </div>
            </div>

            {/* Timeline */}
            <div className="space-y-1.5">
              {triples.map((t: any) => (
                <div key={t.id} className={`flex items-center gap-2 px-3 py-2 rounded text-xs ${t.current ? 'bg-slate-800' : 'bg-slate-800/30 opacity-60'}`}>
                  <span className="text-sky-300 font-medium">{t.subject}</span>
                  <span className="text-slate-500">{t.predicate}</span>
                  <span className="text-emerald-300 font-medium">{t.object}</span>
                  <span className="text-slate-600 ml-auto">{t.validFrom?.slice(0, 10)}</span>
                  {!t.current && <span className="text-red-400">expired</span>}
                </div>
              ))}
              {triples.length === 0 && <p className="text-xs text-slate-600">No facts found for this entity.</p>}
            </div>
          </>
        ) : (
          <div className="text-center text-slate-600 text-sm mt-12">
            Select an entity to view its facts and timeline.
            <br />
            <span className="text-xs">Facts are auto-extracted from Claude sessions.</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Diary Tab ───────────────────────────────────────────────────────────────

function DiaryTab({ projectId }: { projectId: string }) {
  const [entries, setEntries] = useState<any[]>([])

  useEffect(() => {
    api.diary.read(projectId, undefined, 50).then(setEntries)
  }, [projectId])

  return (
    <div className="overflow-y-auto p-4">
      <h3 className="text-sm font-medium text-slate-200 mb-3">Agent Diary</h3>
      <p className="text-xs text-slate-500 mb-4">
        Claude automatically writes a diary entry summarizing each session: decisions made, problems encountered, files changed, and token usage.
      </p>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-600 text-center mt-8">No diary entries yet. Complete a Claude session to see auto-generated journal entries.</p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry: any) => (
            <div key={entry.id} className="bg-slate-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">{entry.topic}</span>
                <span className="text-xs text-slate-500">{entry.agentName}</span>
                <span className="text-xs text-slate-600 ml-auto">
                  {new Date(entry.createdAt).toLocaleDateString()} {new Date(entry.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">{entry.content}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Identity Tab (L0) ──────────────────────────────────────────────────────

function IdentityTab({ projectId }: { projectId: string }) {
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.palace.identityGet(projectId).then((c: string) => setContent(c))
  }, [projectId])

  const handleSave = async () => {
    await api.palace.identitySet(projectId, content)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const tokenEstimate = Math.ceil(content.length / 4)

  return (
    <div className="p-6 max-w-2xl">
      <h3 className="text-sm font-medium text-slate-200 mb-1">Project Identity (L0)</h3>
      <p className="text-xs text-slate-500 mb-4">
        This text is <strong>always</strong> included in every Claude session for this project.
        Keep it concise (~50 tokens). Describe who you are, what the project is, and key team members.
      </p>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={"I am Claude, an AI assistant working on [project name].\nKey people: [names and roles]\nTech stack: [key technologies]\nImportant conventions: [brief notes]"}
        rows={8}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 font-mono resize-none focus:outline-none focus:border-violet-500 mb-3"
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">~{tokenEstimate} tokens</span>
        <button
          onClick={handleSave}
          className="px-4 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
        >
          {saved ? 'Saved' : 'Save Identity'}
        </button>
      </div>
    </div>
  )
}

// ─── Search Tab ──────────────────────────────────────────────────────────────

function SearchTab({ projectId }: { projectId: string }) {
  const [query, setQuery] = useState('')
  const [wing, setWing] = useState('')
  const [room, setRoom] = useState('')
  const [hall, setHall] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searched, setSearched] = useState(false)

  const handleSearch = async () => {
    if (!query.trim()) return
    const opts: any = {}
    if (wing) opts.wing = wing
    if (room) opts.room = room
    if (hall) opts.hall = hall
    const res = await api.palace.search(projectId, query, Object.keys(opts).length > 0 ? opts : undefined)
    setResults(res)
    setSearched(true)
  }

  return (
    <div className="p-4 overflow-y-auto h-full">
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search memories..."
          className="flex-1 min-w-[200px] bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500"
        />
        <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Room filter" className="w-28 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500" />
        <select value={hall} onChange={(e) => setHall(e.target.value)} className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-violet-500">
          <option value="">All halls</option>
          {Object.entries(hallLabels).map(([h, label]) => (
            <option key={h} value={h}>{label}</option>
          ))}
        </select>
        <button onClick={handleSearch} className="px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-500 text-white rounded transition-colors">Search</button>
      </div>

      {searched && results.length === 0 && (
        <p className="text-sm text-slate-600 text-center mt-8">No results found.</p>
      )}

      <div className="space-y-2">
        {results.map((m: any) => (
          <div key={m.id} className="bg-slate-800 rounded-lg p-3 text-sm">
            <div className="flex items-center gap-2 mb-1 text-xs">
              {m.room && <span className="bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">{m.room}</span>}
              {m.hall && <span className={`px-1.5 py-0.5 rounded border ${hallColors[m.hall] ?? 'border-slate-600'}`}>{hallLabels[m.hall] ?? m.hall}</span>}
              <span className="text-slate-500">{typeLabels[m.type as MemoryType] ?? m.type}</span>
            </div>
            <p className="text-slate-200">{m.content}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Global Tab (Cross-Project Tunnels) ──────────────────────────────────────

function GlobalTab() {
  const [patterns, setPatterns] = useState<Memory[]>([])
  const [tunnels, setTunnels] = useState<any[]>([])

  useEffect(() => {
    api.memory.globalPatterns().then(setPatterns)
    api.palace.tunnels().then(setTunnels)
  }, [])

  return (
    <div className="overflow-y-auto p-4">
      {/* Tunnels */}
      {tunnels.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-slate-200 mb-3">Cross-Project Tunnels</h3>
          <p className="text-xs text-slate-500 mb-2">Rooms that appear in multiple projects, enabling knowledge transfer.</p>
          <div className="space-y-1">
            {tunnels.map((t: any, i: number) => (
              <div key={i} className="flex items-center gap-2 bg-slate-800 rounded px-3 py-2 text-xs">
                <span className="text-violet-300 font-medium">{t.room}</span>
                <span className="text-slate-600">in</span>
                {t.wings.map((w: string) => (
                  <span key={w} className="bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">{w}</span>
                ))}
                <span className="text-slate-600 ml-auto">{t.count} memories</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Global patterns */}
      <h3 className="text-sm font-medium text-slate-200 mb-3">Global Patterns</h3>
      <p className="text-xs text-slate-500 mb-2">High-relevance patterns shared across all projects and included in new session context.</p>
      {patterns.length === 0 ? (
        <p className="text-sm text-slate-600 text-center mt-4">No global patterns yet.</p>
      ) : (
        <div className="space-y-2">
          {patterns.map((m) => (
            <div key={m.id} className="bg-slate-800 rounded-lg p-3 text-sm">
              <p className="text-slate-200">{m.content}</p>
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                <span>{typeLabels[m.type] ?? m.type}</span>
                {m.category && <span>{m.category}</span>}
                <span>score: {m.relevanceScore?.toFixed(1)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
