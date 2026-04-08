import { create } from 'zustand'
import { Task, TaskStatus, Message, Output } from '../../../shared/types'
import api from '../lib/ipc'

interface TaskStore {
  tasks: Task[]
  messages: Record<string, Message[]>
  outputs: Record<string, Output[]>
  sessionStatuses: Record<string, string>
  loading: boolean

  loadTasks: (projectId: string) => Promise<void>
  createTask: (
    projectId: string,
    opts: { title: string; description?: string; depth: string; permission: string }
  ) => Promise<Task>
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>

  loadMessages: (taskId: string) => Promise<void>
  loadOutputs: (taskId: string) => Promise<void>

  spawnSession: (taskId: string) => Promise<void>
  sendMessage: (taskId: string, message: string) => Promise<void>
  terminateSession: (taskId: string) => Promise<void>

  // Called from IPC event listeners
  handleTaskStatusEvent: (taskId: string, status: string) => void
  handleSessionOutput: (payload: any) => void
  handleOutputCreated: (payload: any) => void

  getTasksByStatus: (status: TaskStatus) => Task[]
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  messages: {},
  outputs: {},
  sessionStatuses: {},
  loading: false,

  loadTasks: async (projectId) => {
    set({ loading: true })
    try {
      const tasks = await api.tasks.list(projectId)
      set({ tasks, loading: false })
    } catch (err) {
      console.error('Failed to load tasks:', err)
      set({ loading: false })
    }
  },

  createTask: async (projectId, opts) => {
    const task = await api.tasks.create(projectId, opts)
    set((s) => ({ tasks: [task, ...s.tasks] }))
    return task
  },

  updateTaskStatus: async (taskId, status) => {
    await api.tasks.updateStatus(taskId, status)
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, status } : t))
    }))
  },

  deleteTask: async (taskId) => {
    await api.tasks.delete(taskId)
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== taskId) }))
  },

  loadMessages: async (taskId) => {
    const messages = await api.messages.history(taskId)
    set((s) => ({ messages: { ...s.messages, [taskId]: messages } }))
  },

  loadOutputs: async (taskId) => {
    const outputs = await api.outputs.list(taskId)
    set((s) => ({ outputs: { ...s.outputs, [taskId]: outputs } }))
  },

  spawnSession: async (taskId) => {
    await api.sessions.spawn(taskId)
    set((s) => ({
      sessionStatuses: { ...s.sessionStatuses, [taskId]: 'spawning' }
    }))
  },

  sendMessage: async (taskId, message) => {
    await api.sessions.send(taskId, message)
  },

  terminateSession: async (taskId) => {
    await api.sessions.terminate(taskId)
    set((s) => ({
      sessionStatuses: { ...s.sessionStatuses, [taskId]: 'completed' }
    }))
  },

  handleTaskStatusEvent: (taskId, status) => {
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, status: status as TaskStatus } : t)),
      sessionStatuses: { ...s.sessionStatuses, [taskId]: status }
    }))
  },

  handleSessionOutput: (payload) => {
    if (payload.type === 'message' && payload.role === 'claude') {
      const newMsg: Message = {
        id: payload.messageId,
        taskId: payload.taskId,
        role: 'claude',
        content: payload.content,
        timestamp: new Date().toISOString()
      }
      set((s) => ({
        messages: {
          ...s.messages,
          [payload.taskId]: [...(s.messages[payload.taskId] ?? []), newMsg]
        }
      }))
    }
    if (payload.type === 'status') {
      set((s) => ({
        sessionStatuses: { ...s.sessionStatuses, [payload.taskId]: payload.status }
      }))
    }
  },

  handleOutputCreated: (payload) => {
    const newOutput: Output = {
      id: crypto.randomUUID(),
      taskId: payload.taskId,
      filePath: payload.filePath,
      fileName: payload.fileName,
      createdAt: new Date().toISOString()
    }
    set((s) => ({
      outputs: {
        ...s.outputs,
        [payload.taskId]: [newOutput, ...(s.outputs[payload.taskId] ?? [])]
      }
    }))
  },

  getTasksByStatus: (status) => get().tasks.filter((t) => t.status === status)
}))
