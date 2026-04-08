import { useProjectStore } from '../store/projectStore'
import { useUiStore } from '../store/uiStore'
import KanbanBoard from '../components/KanbanBoard'
import TaskDetailPanel from '../components/TaskDetailPanel'
import ScheduledTasksSection from '../components/ScheduledTasksSection'
import RecentOutputsSection from '../components/RecentOutputsSection'

export default function Board() {
  const { activeProject } = useProjectStore()
  const { selectedTaskId, openCreateTask } = useUiStore()
  const project = activeProject()

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="text-4xl mb-4">◆</div>
        <h2 className="text-xl font-semibold text-slate-200 mb-2">Welcome to ClaudeKanBan</h2>
        <p className="text-slate-500 mb-6 max-w-sm">
          Add a project to start managing your Claude Code sessions as goals on a Kanban board.
        </p>
        <p className="text-slate-600 text-sm">
          Click <span className="text-slate-400">+ Add Project</span> in the tab bar above.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main board area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-800">
          <h1 className="text-sm font-semibold text-slate-200 truncate">{project.name}</h1>
          <span className="text-xs text-slate-600">{project.path}</span>
          <div className="flex-1" />
          <button
            onClick={openCreateTask}
            className="px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors font-medium"
          >
            + New Goal
          </button>
        </div>

        {/* Kanban columns */}
        <div className="flex-1 overflow-hidden">
          <KanbanBoard />
        </div>

        {/* Bottom sections */}
        <div className="border-t border-slate-800 px-4 py-3 max-h-[300px] overflow-y-auto bg-slate-900/50">
          <ScheduledTasksSection />
          <RecentOutputsSection />
        </div>
      </div>

      {/* Task detail panel */}
      {selectedTaskId && <TaskDetailPanel />}
    </div>
  )
}
