import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'

const api = {
  // ─── Projects ────────────────────────────────────────────────────────────────
  projects: {
    list: () => ipcRenderer.invoke(IPC.PROJECTS_LIST),
    create: (name: string, path: string) => ipcRenderer.invoke(IPC.PROJECTS_CREATE, name, path),
    remove: (id: string) => ipcRenderer.invoke(IPC.PROJECTS_REMOVE, id)
  },

  // ─── Tasks ────────────────────────────────────────────────────────────────────
  tasks: {
    list: (projectId: string) => ipcRenderer.invoke(IPC.TASKS_LIST, projectId),
    create: (projectId: string, opts: any) => ipcRenderer.invoke(IPC.TASKS_CREATE, projectId, opts),
    updateStatus: (taskId: string, status: string) =>
      ipcRenderer.invoke(IPC.TASKS_UPDATE_STATUS, taskId, status),
    delete: (taskId: string) => ipcRenderer.invoke(IPC.TASKS_DELETE, taskId)
  },

  // ─── Sessions ─────────────────────────────────────────────────────────────────
  sessions: {
    spawn: (taskId: string) => ipcRenderer.invoke(IPC.SESSIONS_SPAWN, taskId),
    send: (taskId: string, message: string) =>
      ipcRenderer.invoke(IPC.SESSIONS_SEND, taskId, message),
    terminate: (taskId: string) => ipcRenderer.invoke(IPC.SESSIONS_TERMINATE, taskId),
    status: (taskId: string) => ipcRenderer.invoke(IPC.SESSIONS_STATUS, taskId)
  },

  // ─── Messages ─────────────────────────────────────────────────────────────────
  messages: {
    history: (taskId: string) => ipcRenderer.invoke(IPC.MESSAGES_HISTORY, taskId),
    lastTwo: (taskId: string) => ipcRenderer.invoke(IPC.MESSAGES_LAST_TWO, taskId)
  },

  // ─── Outputs ──────────────────────────────────────────────────────────────────
  outputs: {
    list: (taskId: string) => ipcRenderer.invoke(IPC.OUTPUTS_LIST, taskId),
    readFile: (filePath: string) => ipcRenderer.invoke(IPC.OUTPUTS_READ, filePath),
    recent: (projectId: string, limit?: number) =>
      ipcRenderer.invoke(IPC.OUTPUTS_RECENT, projectId, limit)
  },

  // ─── Git ──────────────────────────────────────────────────────────────────────
  git: {
    status: (projectId: string) => ipcRenderer.invoke(IPC.GIT_STATUS, projectId),
    diff: (projectId: string, filePath?: string) =>
      ipcRenderer.invoke(IPC.GIT_DIFF, projectId, filePath),
    stage: (projectId: string, files: string[]) =>
      ipcRenderer.invoke(IPC.GIT_STAGE, projectId, files),
    unstage: (projectId: string, files: string[]) =>
      ipcRenderer.invoke(IPC.GIT_UNSTAGE, projectId, files),
    commit: (projectId: string, message: string) =>
      ipcRenderer.invoke(IPC.GIT_COMMIT, projectId, message),
    push: (projectId: string) => ipcRenderer.invoke(IPC.GIT_PUSH, projectId),
    pull: (projectId: string) => ipcRenderer.invoke(IPC.GIT_PULL, projectId),
    branches: (projectId: string) => ipcRenderer.invoke(IPC.GIT_BRANCHES, projectId),
    createBranch: (projectId: string, name: string) =>
      ipcRenderer.invoke(IPC.GIT_CREATE_BRANCH, projectId, name),
    checkout: (projectId: string, branch: string) =>
      ipcRenderer.invoke(IPC.GIT_CHECKOUT, projectId, branch)
  },

  // ─── GitHub ───────────────────────────────────────────────────────────────────
  github: {
    listPRs: (projectId: string) => ipcRenderer.invoke(IPC.GITHUB_LIST_PRS, projectId),
    createPR: (projectId: string, opts: any) =>
      ipcRenderer.invoke(IPC.GITHUB_CREATE_PR, projectId, opts),
    listIssues: (projectId: string) => ipcRenderer.invoke(IPC.GITHUB_LIST_ISSUES, projectId)
  },

  // ─── Memory ───────────────────────────────────────────────────────────────────
  memory: {
    list: (projectId: string, query?: string) =>
      ipcRenderer.invoke(IPC.MEMORY_LIST, projectId, query),
    create: (projectId: string, opts: any) =>
      ipcRenderer.invoke(IPC.MEMORY_CREATE, projectId, opts),
    update: (id: string, content: string) => ipcRenderer.invoke(IPC.MEMORY_UPDATE, id, content),
    delete: (id: string) => ipcRenderer.invoke(IPC.MEMORY_DELETE, id),
    search: (projectId: string, query: string) =>
      ipcRenderer.invoke(IPC.MEMORY_SEARCH, projectId, query),
    contextBlock: (projectId: string, taskDescription: string) =>
      ipcRenderer.invoke(IPC.MEMORY_CONTEXT_BLOCK, projectId, taskDescription),
    captureFromTask: (taskId: string) => ipcRenderer.invoke(IPC.MEMORY_CAPTURE_TASK, taskId)
  },

  // ─── Skills ───────────────────────────────────────────────────────────────────
  skills: {
    list: (projectPath?: string) => ipcRenderer.invoke(IPC.SKILLS_LIST, projectPath),
    read: (filePath: string) => ipcRenderer.invoke(IPC.SKILLS_READ, filePath),
    update: (filePath: string, content: string) =>
      ipcRenderer.invoke(IPC.SKILLS_UPDATE, filePath, content),
    create: (name: string, content: string, targetDir: string) =>
      ipcRenderer.invoke(IPC.SKILLS_CREATE, name, content, targetDir),
    fetchUrl: (url: string) => ipcRenderer.invoke(IPC.SKILLS_FETCH_URL, url)
  },

  // ─── Docs ─────────────────────────────────────────────────────────────────────
  docs: {
    list: (projectId: string) => ipcRenderer.invoke(IPC.DOCS_LIST, projectId),
    read: (filePath: string) => ipcRenderer.invoke(IPC.DOCS_READ, filePath),
    update: (filePath: string, content: string) =>
      ipcRenderer.invoke(IPC.DOCS_UPDATE, filePath, content)
  },

  // ─── Scheduled Tasks ──────────────────────────────────────────────────────────
  scheduled: {
    list: () => ipcRenderer.invoke(IPC.SCHEDULED_LIST),
    run: (id: string) => ipcRenderer.invoke(IPC.SCHEDULED_RUN, id),
    toggle: (id: string) => ipcRenderer.invoke(IPC.SCHEDULED_TOGGLE, id),
    delete: (id: string) => ipcRenderer.invoke(IPC.SCHEDULED_DELETE, id)
  },

  // ─── System ───────────────────────────────────────────────────────────────────
  system: {
    openDialog: (options: any) => ipcRenderer.invoke(IPC.SYSTEM_OPEN_DIALOG, options),
    openExternal: (url: string) => ipcRenderer.invoke(IPC.SYSTEM_OPEN_EXTERNAL, url)
  },

  // ─── Event subscriptions ──────────────────────────────────────────────────────
  on: (
    event: 'session-output' | 'task-status' | 'output-created' | 'git-changed',
    callback: (...args: any[]) => void
  ): (() => void) => {
    const channelMap: Record<string, string> = {
      'session-output': IPC.EVENT_SESSION_OUTPUT,
      'task-status': IPC.EVENT_TASK_STATUS,
      'output-created': IPC.EVENT_OUTPUT_CREATED,
      'git-changed': IPC.EVENT_GIT_CHANGED
    }
    const channel = channelMap[event]
    if (!channel) return () => {}

    const listener = (_e: any, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
