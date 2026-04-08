import { useEffect, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useTaskStore } from '../store/taskStore'
import { TaskDepth, TaskPermission } from '../../../shared/types'
import api from '../lib/ipc'

interface Props {
  onClose: () => void
}

interface AsanaWorkspace {
  gid: string
  name: string
}

interface AsanaProject {
  gid: string
  name: string
}

interface AsanaTask {
  gid: string
  name: string
  notes: string
  completed: boolean
  dueOn?: string
  assignee?: { name: string }
  memberships?: { section?: { name: string } }[]
  permalink_url?: string
}

export default function AsanaImportModal({ onClose }: Props) {
  const { activeProjectId } = useProjectStore()
  const { createTask, spawnSession } = useTaskStore()

  const [workspaces, setWorkspaces] = useState<AsanaWorkspace[]>([])
  const [projects, setProjects] = useState<AsanaProject[]>([])
  const [tasks, setTasks] = useState<AsanaTask[]>([])
  const [selectedWorkspace, setSelectedWorkspace] = useState('')
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())
  const [depth, setDepth] = useState<TaskDepth>('campaign')
  const [permission, setPermission] = useState<TaskPermission>('default')
  const [autoStart, setAutoStart] = useState(false)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'workspace' | 'project' | 'tasks'>('workspace')

  useEffect(() => {
    loadWorkspaces()
  }, [])

  const loadWorkspaces = async () => {
    setLoading(true)
    setError('')
    try {
      const ws = await api.asana.workspaces()
      setWorkspaces(ws)
      if (ws.length === 1) {
        setSelectedWorkspace(ws[0].gid)
        loadProjects(ws[0].gid)
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to load workspaces. Check your Asana token in Settings.')
    } finally {
      setLoading(false)
    }
  }

  const loadProjects = async (workspaceGid: string) => {
    setLoading(true)
    setError('')
    try {
      const projs = await api.asana.projects(workspaceGid)
      setProjects(projs)
      setStep('project')
    } catch (err: any) {
      setError(err.message ?? 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  const loadTasks = async (projectGid: string) => {
    setLoading(true)
    setError('')
    try {
      const tks = await api.asana.tasks(projectGid)
      setTasks(tks.filter((t: AsanaTask) => !t.completed))
      setStep('tasks')
    } catch (err: any) {
      setError(err.message ?? 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  const toggleTask = (gid: string) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(gid)) next.delete(gid)
      else next.add(gid)
      return next
    })
  }

  const selectAll = () => {
    if (selectedTasks.size === tasks.length) {
      setSelectedTasks(new Set())
    } else {
      setSelectedTasks(new Set(tasks.map((t) => t.gid)))
    }
  }

  const handleImport = async () => {
    if (!activeProjectId || selectedTasks.size === 0) return
    setImporting(true)

    const tasksToImport = tasks.filter((t) => selectedTasks.has(t.gid))
    let importedCount = 0

    for (const asanaTask of tasksToImport) {
      try {
        const description = asanaTask.notes
          ? `${asanaTask.notes}\n\n---\nImported from Asana: ${asanaTask.permalink_url ?? asanaTask.gid}`
          : `Imported from Asana: ${asanaTask.permalink_url ?? asanaTask.gid}`

        const task = await createTask(activeProjectId, {
          title: asanaTask.name,
          description,
          depth,
          permission,
          asanaGid: asanaTask.gid,
          asanaPermalink: asanaTask.permalink_url
        })

        if (autoStart) {
          try {
            await spawnSession(task.id)
          } catch {
            // Session start failure shouldn't block import
          }
        }

        importedCount++
      } catch {
        // Skip failed imports
      }
    }

    setImporting(false)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-[600px] max-w-full mx-4 shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">Import from Asana</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors text-lg"
          >
            x
          </button>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded px-3 py-2 text-xs text-red-300 mb-4">
            {error}
          </div>
        )}

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-4 text-xs text-slate-500">
          <span className={step === 'workspace' ? 'text-violet-400 font-medium' : ''}>
            Workspace
          </span>
          <span>-&gt;</span>
          <span className={step === 'project' ? 'text-violet-400 font-medium' : ''}>
            Project
          </span>
          <span>-&gt;</span>
          <span className={step === 'tasks' ? 'text-violet-400 font-medium' : ''}>
            Select Tasks
          </span>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Step 1: Workspace selection */}
          {step === 'workspace' && (
            <div className="space-y-1">
              {loading ? (
                <p className="text-sm text-slate-500">Loading workspaces...</p>
              ) : (
                workspaces.map((ws) => (
                  <button
                    key={ws.gid}
                    onClick={() => {
                      setSelectedWorkspace(ws.gid)
                      loadProjects(ws.gid)
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-200 transition-colors"
                  >
                    {ws.name}
                  </button>
                ))
              )}
            </div>
          )}

          {/* Step 2: Project selection */}
          {step === 'project' && (
            <div className="space-y-1">
              <button
                onClick={() => setStep('workspace')}
                className="text-xs text-slate-500 hover:text-slate-300 mb-2"
              >
                &lt;- Back to workspaces
              </button>
              {loading ? (
                <p className="text-sm text-slate-500">Loading projects...</p>
              ) : (
                projects.map((proj) => (
                  <button
                    key={proj.gid}
                    onClick={() => {
                      setSelectedProject(proj.gid)
                      loadTasks(proj.gid)
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-200 transition-colors"
                  >
                    {proj.name}
                  </button>
                ))
              )}
            </div>
          )}

          {/* Step 3: Task selection */}
          {step === 'tasks' && (
            <div>
              <button
                onClick={() => setStep('project')}
                className="text-xs text-slate-500 hover:text-slate-300 mb-2"
              >
                &lt;- Back to projects
              </button>

              {loading ? (
                <p className="text-sm text-slate-500">Loading tasks...</p>
              ) : tasks.length === 0 ? (
                <p className="text-sm text-slate-500">No incomplete tasks in this project.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={selectAll}
                      className="text-xs text-violet-400 hover:text-violet-300"
                    >
                      {selectedTasks.size === tasks.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <span className="text-xs text-slate-500">
                      {selectedTasks.size} of {tasks.length} selected
                    </span>
                  </div>

                  <div className="space-y-1 max-h-[250px] overflow-y-auto">
                    {tasks.map((task) => (
                      <label
                        key={task.gid}
                        className={`flex items-start gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                          selectedTasks.has(task.gid)
                            ? 'bg-violet-900/30 border border-violet-700'
                            : 'bg-slate-700 border border-transparent hover:bg-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTasks.has(task.gid)}
                          onChange={() => toggleTask(task.gid)}
                          className="w-4 h-4 mt-0.5 rounded accent-violet-500 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-slate-200">{task.name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {task.dueOn && (
                              <span className="text-xs text-slate-500">Due: {task.dueOn}</span>
                            )}
                            {task.assignee?.name && (
                              <span className="text-xs text-slate-500">
                                {task.assignee.name}
                              </span>
                            )}
                            {task.memberships?.[0]?.section?.name && (
                              <span className="text-xs px-1.5 py-0.5 bg-slate-600 rounded text-slate-400">
                                {task.memberships[0].section.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Import options */}
                  <div className="mt-4 pt-4 border-t border-slate-700 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Depth</label>
                        <select
                          value={depth}
                          onChange={(e) => setDepth(e.target.value as TaskDepth)}
                          className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-violet-500"
                        >
                          <option value="quick">Quick</option>
                          <option value="campaign">Campaign</option>
                          <option value="deep-build">Deep Build</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Permission</label>
                        <select
                          value={permission}
                          onChange={(e) => setPermission(e.target.value as TaskPermission)}
                          className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-violet-500"
                        >
                          <option value="default">Default</option>
                          <option value="full-auto">Full Auto</option>
                        </select>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoStart}
                        onChange={(e) => setAutoStart(e.target.checked)}
                        className="w-4 h-4 rounded accent-violet-500"
                      />
                      <span className="text-sm text-slate-300">
                        Start Claude sessions immediately
                      </span>
                    </label>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'tasks' && tasks.length > 0 && (
          <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-slate-700">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={selectedTasks.size === 0 || importing}
              className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg transition-colors font-medium"
            >
              {importing
                ? 'Importing...'
                : `Import ${selectedTasks.size} Task${selectedTasks.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
