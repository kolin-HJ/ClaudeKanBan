import { useState } from 'react'
import { Plus, X, FolderOpen } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { cn } from '../lib/utils'

export default function ProjectTabs() {
  const { projects, activeProjectId, setActiveProject, removeProject, addProject } =
    useProjectStore()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPath, setNewPath] = useState('')

  const browseFolder = async () => {
    const result = await window.electronAPI.system.openDialog({
      properties: ['openDirectory'],
      title: 'Select Project Directory'
    })
    if (!result.canceled && result.filePaths[0]) {
      const path = result.filePaths[0]
      const name = path.split(/[/\\]/).pop() ?? path
      setNewPath(path)
      setNewName(name)
    }
  }

  const handleAdd = async () => {
    if (!newName.trim() || !newPath.trim()) return
    await addProject(newName.trim(), newPath.trim())
    setAdding(false)
    setNewName('')
    setNewPath('')
  }

  return (
    <div className="no-drag flex items-center bg-[hsl(0,0%,5%)] border-b border-border h-9 px-2 gap-0.5 shrink-0 overflow-x-auto">
      {projects.map((p) => (
        <div
          key={p.id}
          className={cn(
            'flex items-center gap-1.5 px-2.5 h-7 rounded text-xs cursor-pointer select-none shrink-0 transition-colors group',
            activeProjectId === p.id
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
          )}
          onClick={() => setActiveProject(p.id)}
        >
          <span className="max-w-[120px] truncate font-medium">{p.name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              removeProject(p.id)
            }}
            className="opacity-0 group-hover:opacity-50 hover:!opacity-100 text-muted-foreground hover:text-destructive transition-opacity ml-0.5 rounded"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}

      {adding ? (
        <div className="flex items-center gap-1 shrink-0">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name"
            className="bg-input border border-border rounded px-2 py-0.5 text-xs text-foreground placeholder:text-muted-foreground w-28 focus:outline-none focus:ring-1 focus:ring-ring"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button
            onClick={browseFolder}
            className="flex items-center gap-1 px-2 h-6 text-xs bg-secondary hover:bg-accent text-secondary-foreground rounded transition-colors"
          >
            <FolderOpen className="w-3 h-3" />
            Browse
          </button>
          {newPath && (
            <span className="text-xs text-muted-foreground max-w-[100px] truncate">{newPath}</span>
          )}
          <button
            onClick={handleAdd}
            className="px-2 h-6 text-xs bg-primary hover:bg-primary/85 text-primary-foreground rounded transition-colors"
          >
            Add
          </button>
          <button
            onClick={() => setAdding(false)}
            className="px-2 h-6 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="shrink-0 flex items-center gap-1 px-2 h-6 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Project
        </button>
      )}
    </div>
  )
}
