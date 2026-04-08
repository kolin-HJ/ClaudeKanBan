import { create } from 'zustand'

export type Page = 'board' | 'skills' | 'docs' | 'memory' | 'git' | 'outputs' | 'usage' | 'settings'

interface TabState {
  currentPage: Page
  selectedTaskId: string | null
}

interface UiStore {
  currentPage: Page
  selectedTaskId: string | null
  createTaskOpen: boolean
  outputPreviewPath: string | null
  tabStates: Record<string, TabState>

  setPage: (page: Page) => void
  selectTask: (taskId: string | null) => void
  openCreateTask: () => void
  closeCreateTask: () => void
  openOutputPreview: (filePath: string) => void
  closeOutputPreview: () => void
  saveTabState: (projectId: string) => void
  restoreTabState: (projectId: string) => void
}

export const useUiStore = create<UiStore>((set, get) => ({
  currentPage: 'board',
  selectedTaskId: null,
  createTaskOpen: false,
  outputPreviewPath: null,
  tabStates: {},

  setPage: (page) => set({ currentPage: page, selectedTaskId: null }),
  selectTask: (taskId) => set({ selectedTaskId: taskId }),
  openCreateTask: () => set({ createTaskOpen: true }),
  closeCreateTask: () => set({ createTaskOpen: false }),
  openOutputPreview: (filePath) => set({ outputPreviewPath: filePath }),
  closeOutputPreview: () => set({ outputPreviewPath: null }),

  saveTabState: (projectId) => {
    const { currentPage, selectedTaskId, tabStates } = get()
    set({
      tabStates: {
        ...tabStates,
        [projectId]: { currentPage, selectedTaskId }
      }
    })
  },

  restoreTabState: (projectId) => {
    const { tabStates } = get()
    const saved = tabStates[projectId]
    if (saved) {
      set({ currentPage: saved.currentPage, selectedTaskId: saved.selectedTaskId })
    } else {
      set({ currentPage: 'board', selectedTaskId: null })
    }
  }
}))
