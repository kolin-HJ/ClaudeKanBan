import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Plus, Check } from 'lucide-react'
import { Skill, ProjectSkillConfig } from '../../../shared/types'
import { useProjectStore } from '../store/projectStore'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/utils'

const categoryColors: Record<string, string> = {
  'frontend': 'bg-blue-900/40 text-blue-300 border-blue-800',
  'backend': 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
  'devops': 'bg-amber-900/40 text-amber-300 border-amber-800',
  'database': 'bg-violet-900/40 text-violet-300 border-violet-800',
  'testing': 'bg-pink-900/40 text-pink-300 border-pink-800'
}

export default function Skills() {
  const { activeProject, activeProjectId } = useProjectStore()
  const project = activeProject()

  const [skills, setSkills] = useState<Skill[]>([])
  const [projectConfigs, setProjectConfigs] = useState<ProjectSkillConfig[]>([])
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
    if (activeProjectId) {
      const configs = await window.electronAPI.skills.projectList(activeProjectId)
      setProjectConfigs(configs)
    }
  }

  useEffect(() => {
    load()
  }, [project?.path, activeProjectId])

  const isSkillActive = (skillPath: string): boolean => {
    const config = projectConfigs.find((c) => c.skillPath === skillPath)
    // Default: active if no config exists
    return config ? config.active : true
  }

  const toggleSkill = async (skillPath: string) => {
    if (!activeProjectId) return
    const currentActive = isSkillActive(skillPath)
    await window.electronAPI.skills.toggle(activeProjectId, skillPath, !currentActive)
    load()
  }

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
          {filtered.map((skill) => {
            const active = isSkillActive(skill.filePath)
            return (
              <div
                key={skill.filePath}
                className={cn(
                  'flex items-center gap-2 p-2 rounded-lg transition-colors',
                  selected?.filePath === skill.filePath
                    ? 'bg-primary/10 border border-primary'
                    : 'hover:bg-accent border border-transparent'
                )}
              >
                {/* Active toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleSkill(skill.filePath)
                  }}
                  className={cn(
                    'w-4 h-4 rounded shrink-0 border transition-colors',
                    active ? 'bg-primary border-primary' : 'bg-muted border-border'
                  )}
                  title={active ? 'Deactivate for this project' : 'Activate for this project'}
                >
                  {active && (
                    <svg className="w-3 h-3 text-primary-foreground" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z" />
                    </svg>
                  )}
                </button>

                <button
                  onClick={() => handleSelect(skill)}
                  className={cn('flex-1 text-left min-w-0', !active ? 'opacity-50' : '')}
                >
                  <div className="text-xs font-medium text-foreground truncate">{skill.name}</div>
                  {skill.category && (
                    <Badge variant="secondary" className="mt-0.5 text-[10px]">
                      {skill.category}
                    </Badge>
                  )}
                </button>
              </div>
            )
          })}
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
