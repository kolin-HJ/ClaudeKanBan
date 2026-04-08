import { useEffect } from 'react'
import { useProjectStore } from './store/projectStore'
import { useTaskStore } from './store/taskStore'
import { useUiStore } from './store/uiStore'
import ProjectTabs from './components/ProjectTabs'
import Sidebar from './components/Sidebar'
import Board from './pages/Board'
import Skills from './pages/Skills'
import Docs from './pages/Docs'
import Memory from './pages/Memory'
import GitView from './pages/GitView'
import Outputs from './pages/Outputs'
import Settings from './pages/Settings'
import CreateTaskModal from './components/CreateTaskModal'
import OutputPreview from './components/OutputPreview'

export default function App() {
  const { loadProjects, activeProjectId } = useProjectStore()
  const { loadTasks, handleTaskStatusEvent, handleSessionOutput, handleOutputCreated } =
    useTaskStore()
  const { currentPage, createTaskOpen, outputPreviewPath } = useUiStore()

  // Bootstrap
  useEffect(() => {
    loadProjects()
  }, [])

  // Load tasks when project changes
  useEffect(() => {
    if (activeProjectId) {
      loadTasks(activeProjectId)
    }
  }, [activeProjectId])

  // Wire up IPC event listeners
  useEffect(() => {
    const offStatus = window.electronAPI.on('task-status', (payload) =>
      handleTaskStatusEvent(payload.taskId, payload.status)
    )
    const offOutput = window.electronAPI.on('session-output', (payload) =>
      handleSessionOutput(payload)
    )
    const offCreated = window.electronAPI.on('output-created', (payload) =>
      handleOutputCreated(payload)
    )
    return () => {
      offStatus()
      offOutput()
      offCreated()
    }
  }, [])

  const renderPage = () => {
    switch (currentPage) {
      case 'board':
        return <Board />
      case 'skills':
        return <Skills />
      case 'docs':
        return <Docs />
      case 'memory':
        return <Memory />
      case 'git':
        return <GitView />
      case 'outputs':
        return <Outputs />
      case 'settings':
        return <Settings />
      default:
        return <Board />
    }
  }

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden">
      {/* Title bar drag region — sits behind everything, height 32px matches overlay */}
      <div className="drag-region fixed top-0 left-0 right-0 h-8 z-50 pointer-events-none" />

      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Project tabs — positioned after the 32px title bar */}
        <ProjectTabs />

        {/* Page content */}
        <div className="flex-1 overflow-hidden">{renderPage()}</div>
      </div>

      {/* Modals & overlays */}
      {createTaskOpen && <CreateTaskModal />}
      {outputPreviewPath && <OutputPreview filePath={outputPreviewPath} />}
    </div>
  )
}
