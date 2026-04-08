import { create } from 'zustand'
import { Project } from '../../../shared/types'
import api from '../lib/ipc'

interface ProjectStore {
  projects: Project[]
  activeProjectId: string | null
  loading: boolean

  loadProjects: () => Promise<void>
  setActiveProject: (id: string) => void
  addProject: (name: string, path: string) => Promise<Project>
  removeProject: (id: string) => Promise<void>

  activeProject: () => Project | null
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  activeProjectId: null,
  loading: false,

  loadProjects: async () => {
    set({ loading: true })
    try {
      const projects = await api.projects.list()
      set({ projects, loading: false })
      if (projects.length > 0 && !get().activeProjectId) {
        set({ activeProjectId: projects[0].id })
      }
    } catch (err) {
      console.error('Failed to load projects:', err)
      set({ loading: false })
    }
  },

  setActiveProject: (id) => set({ activeProjectId: id }),

  addProject: async (name, path) => {
    const project = await api.projects.create(name, path)
    set((s) => ({ projects: [...s.projects, project], activeProjectId: project.id }))
    return project
  },

  removeProject: async (id) => {
    await api.projects.remove(id)
    set((s) => {
      const projects = s.projects.filter((p) => p.id !== id)
      const activeProjectId =
        s.activeProjectId === id ? (projects[0]?.id ?? null) : s.activeProjectId
      return { projects, activeProjectId }
    })
  },

  activeProject: () => {
    const { projects, activeProjectId } = get()
    return projects.find((p) => p.id === activeProjectId) ?? null
  }
}))
