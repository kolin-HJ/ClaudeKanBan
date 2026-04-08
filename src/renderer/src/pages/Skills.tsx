import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Skill } from '../../../shared/types'
import { useProjectStore } from '../store/projectStore'

export default function Skills() {
  const { activeProject } = useProjectStore()
  const project = activeProject()

  const [skills, setSkills] = useState<Skill[]>([])
  const [selected, setSelected] = useState<Skill | null>(null)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [fetchMode, setFetchMode] = useState<'url' | 'blank'>('blank')

  const load = async () => {
    const list = await window.electronAPI.skills.list(project?.path)
    setSkills(list)
  }

  useEffect(() => {
    load()
  }, [project?.path])

  const filtered = skills.filter(
    (s) =>
      !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.category?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSelect = (skill: Skill) => {
    setSelected(skill)
    setEditing(false)
    setEditContent(skill.content)
  }

  const handleEdit = () => {
    setEditContent(selected?.content ?? '')
    setEditing(true)
  }

  const handleSave = async () => {
    if (!selected) return
    await window.electronAPI.skills.update(selected.filePath, editContent)
    setEditing(false)
    setSelected({ ...selected, content: editContent })
    load()
  }

  const handleCreateBlank = async () => {
    if (!newName.trim()) return
    const targetDir = project
      ? `${project.path}/.claude/skills`
      : `${process.env.USERPROFILE || '~'}/.claude/skills`
    const content = `---\nname: ${newName}\n---\n\n# ${newName}\n\nDescribe this skill here.\n`
    const skill = await window.electronAPI.skills.create(newName, content, targetDir)
    setCreating(false)
    setNewName('')
    load()
    handleSelect(skill)
    setEditing(true)
  }

  const handleFetchUrl = async () => {
    if (!newUrl.trim()) return
    try {
      const content = await window.electronAPI.skills.fetchUrl(newUrl)
      const targetDir = project
        ? `${project.path}/.claude/skills`
        : `${process.env.USERPROFILE || '~'}/.claude/skills`
      const name = newName || newUrl.split('/').pop()?.replace('.md', '') || 'new-skill'
      const skill = await window.electronAPI.skills.create(name, content, targetDir)
      setCreating(false)
      setNewName('')
      setNewUrl('')
      load()
      handleSelect(skill)
    } catch (err: any) {
      alert(`Failed to fetch: ${err.message}`)
    }
  }

  const categoryColors: Record<string, string> = {
    Writing: 'bg-blue-900/40 text-blue-300',
    Code: 'bg-green-900/40 text-green-300',
    Research: 'bg-purple-900/40 text-purple-300',
    Marketing: 'bg-pink-900/40 text-pink-300',
    Analysis: 'bg-amber-900/40 text-amber-300'
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Skills list */}
      <div className="w-64 shrink-0 border-r border-slate-800 flex flex-col">
        <div className="p-3 border-b border-slate-800">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-semibold text-slate-200 flex-1">Skills</h2>
            <button
              onClick={() => setCreating(true)}
              className="text-xs px-2 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded transition-colors"
            >
              + Add
            </button>
          </div>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search skills…"
            className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.map((skill) => (
            <button
              key={skill.filePath}
              onClick={() => handleSelect(skill)}
              className={`
                w-full text-left p-2 rounded-lg transition-colors
                ${selected?.filePath === skill.filePath
                  ? 'bg-violet-700/30 border border-violet-600'
                  : 'hover:bg-slate-800 border border-transparent'
                }
              `}
            >
              <div className="text-sm text-slate-200 truncate">{skill.name}</div>
              {skill.category && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded mt-0.5 inline-block ${
                    categoryColors[skill.category] ?? 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {skill.category}
                </span>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="text-xs text-slate-600 text-center mt-8">
              {searchQuery ? 'No matching skills' : 'No skills found'}
            </div>
          )}
        </div>
      </div>

      {/* Skill detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {creating ? (
          <div className="p-6 max-w-lg">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">Add Skill</h3>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setFetchMode('blank')}
                className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                  fetchMode === 'blank'
                    ? 'border-violet-500 bg-violet-900/30 text-slate-100'
                    : 'border-slate-600 text-slate-400'
                }`}
              >
                Blank
              </button>
              <button
                onClick={() => setFetchMode('url')}
                className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                  fetchMode === 'url'
                    ? 'border-violet-500 bg-violet-900/30 text-slate-100'
                    : 'border-slate-600 text-slate-400'
                }`}
              >
                From GitHub URL
              </button>
            </div>
            <div className="mb-3">
              <label className="text-xs text-slate-400 block mb-1">Name</label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Skill name"
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500"
              />
            </div>
            {fetchMode === 'url' && (
              <div className="mb-3">
                <label className="text-xs text-slate-400 block mb-1">GitHub URL</label>
                <input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo/blob/main/skill.md"
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500"
                />
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={fetchMode === 'url' ? handleFetchUrl : handleCreateBlank}
                className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
              >
                {fetchMode === 'url' ? 'Fetch & Create' : 'Create'}
              </button>
              <button
                onClick={() => setCreating(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : selected ? (
          <>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-slate-200 flex-1">{selected.name}</h2>
              <span className="text-xs text-slate-500 truncate max-w-[200px]">{selected.filePath}</span>
              {editing ? (
                <>
                  <button
                    onClick={handleSave}
                    className="text-xs px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="text-xs px-3 py-1 text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={handleEdit}
                  className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {editing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-full min-h-[400px] bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono resize-none focus:outline-none focus:border-violet-500"
                />
              ) : (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-600 text-sm">
            Select a skill to view it
          </div>
        )}
      </div>
    </div>
  )
}
