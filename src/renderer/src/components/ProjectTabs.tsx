import { useState, useEffect, useCallback, useRef } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useTaskStore } from '../store/taskStore'
import { useUiStore } from '../store/uiStore'

export default function ProjectTabs() {
  const { projects, activeProjectId, setActiveProject, removeProject, addProject } =
    useProjectStore()
  const { sessionStatuses } = useTaskStore()
  const { saveTabState, restoreTabState } = useUiStore()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPath, setNewPath] = useState('')
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    projectId: string
  } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // Get session status indicator for a project
  const getProjectStatus = (projectId: string): 'active' | 'waiting' | 'idle' => {
    const statuses = Object.entries(sessionStatuses)
    for (const [, status] of statuses) {
      // We track by taskId, but tasks belong to projects — check if any are running
      if (status === 'running' || status === 'spawning') return 'active'
      if (status === 'waiting-input') return 'waiting'
    }
    return 'idle'
  }

  const switchProject = (id: string) => {
    if (activeProjectId && activeProjectId !== id) {
      saveTabState(activeProjectId)
    }
    setActiveProject(id)
    restoreTabState(id)
  }

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

  const handleContextMenu = (e: React.MouseEvent, projectId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, projectId })
  }

  const closeOthers = (keepId: string) => {
    for (const p of projects) {
      if (p.id !== keepId) removeProject(p.id)
    }
    setContextMenu(null)
  }

  const closeToRight = (fromId: string) => {
    const idx = projects.findIndex((p) => p.id === fromId)
    for (let i = projects.length - 1; i > idx; i--) {
      removeProject(projects[i].id)
    }
    setContextMenu(null)
  }

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [contextMenu])

  // Keyboard shortcuts: Ctrl+Tab to cycle, Ctrl+W to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault()
        if (projects.length < 2) return
        const idx = projects.findIndex((p) => p.id === activeProjectId)
        const nextIdx = e.shiftKey
          ? (idx - 1 + projects.length) % projects.length
          : (idx + 1) % projects.length
        switchProject(projects[nextIdx].id)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault()
        if (activeProjectId) {
          removeProject(activeProjectId)
        }
      }
    },
    [projects, activeProjectId]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <>
      <div className="no-drag flex items-center bg-slate-950 border-b border-slate-800 h-9 px-2 gap-1 shrink-0 overflow-x-auto">
        {projects.map((p) => {
          const status = getProjectStatus(p.id)
          return (
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
              onClick={() => switchProject(p.id)}
              onContextMenu={(e) => handleContextMenu(e, p.id)}
            >
              {/* Session status indicator */}
              {status === 'active' && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
              )}
              {status === 'waiting' && (
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
              )}
              {status === 'idle' && (
                <span className="text-violet-400 text-xs shrink-0">◆</span>
              )}
              <span className="max-w-[120px] truncate">{p.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  removeProject(p.id)
                }}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-slate-400 hover:text-red-400 text-xs leading-none ml-0.5 transition-opacity"
              >
                x
              </button>
            </div>
          )
        })}

        {adding ? (
          <div className="flex items-center gap-1 shrink-0">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Project name"
              className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-sm text-slate-100 placeholder-slate-500 w-28 focus:outline-none focus:border-violet-500"
            />
            <button
              onClick={browseFolder}
              className="px-2 py-0.5 text-xs bg-slate-700 hover:bg-slate-600 rounded transition-colors"
            >
              Browse...
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

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-slate-800 border border-slate-700 rounded shadow-lg py-1 text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              removeProject(contextMenu.projectId)
              setContextMenu(null)
            }}
            className="w-full px-3 py-1.5 text-left text-slate-300 hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => closeOthers(contextMenu.projectId)}
            className="w-full px-3 py-1.5 text-left text-slate-300 hover:bg-slate-700 transition-colors"
          >
            Close Others
          </button>
          <button
            onClick={() => closeToRight(contextMenu.projectId)}
            className="w-full px-3 py-1.5 text-left text-slate-300 hover:bg-slate-700 transition-colors"
          >
            Close to the Right
          </button>
        </div>
      )}
    </>
  )
}
