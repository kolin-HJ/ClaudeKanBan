import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Plus, Check } from 'lucide-react'
import { Skill } from '../../../shared/types'
import { useProjectStore } from '../store/projectStore'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/utils'

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

  return (
    <div className="flex h-full overflow-hidden">
      {/* Skills list */}
      <div className="w-64 shrink-0 border-r border-border flex flex-col">
        <div className="px-3 py-2.5 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider flex-1">
              Skills
            </span>
            <Button size="sm" onClick={() => setCreating(true)} className="h-6 px-2 text-xs">
              <Plus className="w-3 h-3" />
              Add
            </Button>
          </div>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="h-7 text-xs"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {filtered.map((skill) => (
            <button
              key={skill.filePath}
              onClick={() => handleSelect(skill)}
              className={cn(
                'w-full text-left px-2.5 py-2 rounded-md transition-colors',
                selected?.filePath === skill.filePath
                  ? 'bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <div className="text-xs font-medium truncate">{skill.name}</div>
              {skill.category && (
                <Badge variant="muted" className="mt-0.5 text-[10px]">
                  {skill.category}
                </Badge>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="text-xs text-muted-foreground/40 text-center mt-8">
              {searchQuery ? 'No matching skills' : 'No skills found'}
            </div>
          )}
        </div>
      </div>

      {/* Skill detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {creating ? (
          <div className="p-6 max-w-md">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-4">
              Add Skill
            </h3>
            <div className="flex gap-1.5 mb-4">
              {(['blank', 'url'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFetchMode(mode)}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-md border transition-colors',
                    fetchMode === mode
                      ? 'border-primary/40 bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {mode === 'blank' ? 'Blank' : 'From GitHub URL'}
                </button>
              ))}
            </div>
            <div className="mb-3">
              <label className="text-xs text-muted-foreground block mb-1.5">Name</label>
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Skill name"
              />
            </div>
            {fetchMode === 'url' && (
              <div className="mb-3">
                <label className="text-xs text-muted-foreground block mb-1.5">GitHub URL</label>
                <Input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://github.com/..."
                />
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={fetchMode === 'url' ? handleFetchUrl : handleCreateBlank}>
                {fetchMode === 'url' ? 'Fetch & Create' : 'Create'}
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : selected ? (
          <>
            <div className="flex items-center gap-2 px-4 h-10 border-b border-border shrink-0">
              <span className="text-sm font-medium text-foreground flex-1 truncate">
                {selected.name}
              </span>
              <span className="text-xs text-muted-foreground/50 font-mono truncate max-w-[200px] hidden lg:block">
                {selected.filePath}
              </span>
              {editing ? (
                <>
                  <Button size="sm" onClick={handleSave} className="h-7">
                    <Check className="w-3 h-3" />
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)} className="h-7">
                    Cancel
                  </Button>
                </>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => { setEditContent(selected.content); setEditing(true) }} className="h-7">
                  Edit
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {editing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-full min-h-[400px] bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                />
              ) : (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground/40 text-sm">
            Select a skill to view it
          </div>
        )}
      </div>
    </div>
  )
}
