import { LayoutGrid, Plus } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { useUiStore } from '../store/uiStore'
import KanbanBoard from '../components/KanbanBoard'
import TaskDetailPanel from '../components/TaskDetailPanel'
import ScheduledTasksSection from '../components/ScheduledTasksSection'
import RecentOutputsSection from '../components/RecentOutputsSection'
import { Button } from '../components/ui/button'

export default function Board() {
  const { activeProject } = useProjectStore()
  const { selectedTaskId, openCreateTask } = useUiStore()
  const project = activeProject()

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
          <LayoutGrid className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-1">No project selected</h2>
          <p className="text-xs text-muted-foreground max-w-xs">
            Add a project using the tab bar above to start managing Claude sessions.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main board area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 h-10 border-b border-border shrink-0">
          <span className="text-sm font-medium text-foreground">{project.name}</span>
          <span className="text-xs text-muted-foreground/60 font-mono truncate hidden md:block">
            {project.path}
          </span>
          <div className="flex-1" />
          <Button size="sm" onClick={openCreateTask}>
            <Plus className="w-3.5 h-3.5" />
            New Goal
          </Button>
        </div>

        {/* Kanban columns */}
        <div className="flex-1 overflow-hidden">
          <KanbanBoard />
        </div>

        {/* Bottom sections */}
        <div className="border-t border-border px-4 py-3 max-h-[260px] overflow-y-auto bg-background/50">
          <ScheduledTasksSection />
          <RecentOutputsSection />
        </div>
      </div>

      {/* Task detail panel */}
      {selectedTaskId && <TaskDetailPanel />}
    </div>
  )
}
