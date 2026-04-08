import { useState } from 'react'
import { useProjectStore } from '../store/projectStore'

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
    <div className="no-drag flex items-center bg-slate-950 border-b border-slate-800 h-9 px-2 gap-1 shrink-0 overflow-x-auto">
      {projects.map((p) => (
        <div
          key={p.id}
          className={`
            flex items-center gap-1.5 px-3 py-1 rounded text-sm cursor-pointer select-none shrink-0
            transition-colors group
            ${
              activeProjectId === p.id
                ? 'bg-slate-800 text-slate-100'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }
          `}
          onClick={() => setActiveProject(p.id)}
        >
          <span className="text-violet-400 text-xs">◆</span>
          <span className="max-w-[120px] truncate">{p.name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              removeProject(p.id)
            }}
            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-slate-400 hover:text-red-400 text-xs leading-none ml-0.5 transition-opacity"
          >
            ×
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
            className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-sm text-slate-100 placeholder-slate-500 w-28 focus:outline-none focus:border-violet-500"
          />
          <button
            onClick={browseFolder}
            className="px-2 py-0.5 text-xs bg-slate-700 hover:bg-slate-600 rounded transition-colors"
          >
            Browse…
          </button>
          {newPath && (
            <span className="text-xs text-slate-500 max-w-[100px] truncate">{newPath}</span>
          )}
          <button
            onClick={handleAdd}
            className="px-2 py-0.5 text-xs bg-violet-600 hover:bg-violet-500 rounded transition-colors"
          >
            Add
          </button>
          <button
            onClick={() => setAdding(false)}
            className="px-2 py-0.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="shrink-0 px-2 py-0.5 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors"
        >
          + Add Project
        </button>
      )}
    </div>
  )
}
