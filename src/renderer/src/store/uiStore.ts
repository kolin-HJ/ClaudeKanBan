import { create } from 'zustand'

type Page = 'board' | 'skills' | 'docs' | 'memory' | 'git' | 'outputs' | 'settings'

interface UiStore {
  currentPage: Page
  selectedTaskId: string | null
  createTaskOpen: boolean
  outputPreviewPath: string | null

  setPage: (page: Page) => void
  selectTask: (taskId: string | null) => void
  openCreateTask: () => void
  closeCreateTask: () => void
  openOutputPreview: (filePath: string) => void
  closeOutputPreview: () => void
}

export const useUiStore = create<UiStore>((set) => ({
  currentPage: 'board',
  selectedTaskId: null,
  createTaskOpen: false,
  outputPreviewPath: null,

  setPage: (page) => set({ currentPage: page, selectedTaskId: null }),
  selectTask: (taskId) => set({ selectedTaskId: taskId }),
  openCreateTask: () => set({ createTaskOpen: true }),
  closeCreateTask: () => set({ createTaskOpen: false }),
  openOutputPreview: (filePath) => set({ outputPreviewPath: filePath }),
  closeOutputPreview: () => set({ outputPreviewPath: null })
}))
