import { useEffect, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useTaskStore } from '../store/taskStore'
import { Button } from '../components/ui/button'
import KanbanBoard from '../components/KanbanBoard'
import TaskDetailPanel from '../components/TaskDetailPanel'
import ProjectTabs from '../components/ProjectTabs'
import RecentOutputsSection from '../components/RecentOutputsSection'
import ScheduledTasksSection from '../components/ScheduledTasksSection'
import CreateTaskModal from '../components/CreateTaskModal'
import { Plus } from 'lucide-react'
import { useUiStore } from '../store/uiStore'

export default function Board() {
  const { activeProjectId, activeProject } = useProjectStore()
  const { loadTasks } = useTaskStore()
  const { openCreateTask, selectedTaskId } = useUiStore()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const project = activeProject()

  useEffect(() => {
    if (activeProjectId) {
      loadTasks(activeProjectId)
    }
  }, [activeProjectId, loadTasks])

  if (!activeProjectId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <p className="text-sm mb-4">No project selected</p>
          <p className="text-xs text-muted-foreground/60">Create or select a project to get started</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Project tabs */}
      <ProjectTabs />

      {/* Main content */}
      <div className="flex-1 flex gap-4 overflow-hidden p-4">
        {/* Left: Kanban board */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-sm font-semibold text-foreground">{project?.name}</h1>
            <Button
              onClick={() => setShowCreateModal(true)}
              size="sm"
              className="h-7 text-xs gap-1.5"
            >
              <Plus className="w-3 h-3" />
              New Goal
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <KanbanBoard />
          </div>
        </div>

        {/* Right: Detail panel + sidebar */}
        <div className="w-80 flex flex-col border-l border-border">
          {selectedTaskId ? (
            <TaskDetailPanel taskId={selectedTaskId} />
          ) : (
            <div className="flex-1 overflow-y-auto p-4">
              <RecentOutputsSection />
              <ScheduledTasksSection />
            </div>
          )}
        </div>
      </div>

      {/* Create task modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <CreateTaskModal />
        </div>
      )}
    </div>
  )
}
