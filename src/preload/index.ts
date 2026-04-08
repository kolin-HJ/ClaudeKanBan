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
    captureFromTask: (taskId: string) => ipcRenderer.invoke(IPC.MEMORY_CAPTURE_TASK, taskId),
    consolidate: (projectId: string) => ipcRenderer.invoke(IPC.MEMORY_CONSOLIDATE, projectId),
    exportMemories: (projectId: string) => ipcRenderer.invoke(IPC.MEMORY_EXPORT, projectId),
    importMemories: (projectId: string, data: any[]) =>
      ipcRenderer.invoke(IPC.MEMORY_IMPORT, projectId, data),
    globalPatterns: () => ipcRenderer.invoke(IPC.MEMORY_GLOBAL_PATTERNS)
  },

  // ─── Skills ───────────────────────────────────────────────────────────────────
  skills: {
    list: (projectPath?: string) => ipcRenderer.invoke(IPC.SKILLS_LIST, projectPath),
    read: (filePath: string) => ipcRenderer.invoke(IPC.SKILLS_READ, filePath),
    update: (filePath: string, content: string) =>
      ipcRenderer.invoke(IPC.SKILLS_UPDATE, filePath, content),
    create: (name: string, content: string, targetDir: string) =>
      ipcRenderer.invoke(IPC.SKILLS_CREATE, name, content, targetDir),
    fetchUrl: (url: string) => ipcRenderer.invoke(IPC.SKILLS_FETCH_URL, url),
    projectList: (projectId: string) => ipcRenderer.invoke(IPC.SKILLS_PROJECT_LIST, projectId),
    toggle: (projectId: string, skillPath: string, active: boolean) =>
      ipcRenderer.invoke(IPC.SKILLS_TOGGLE, projectId, skillPath, active),
    setPriority: (projectId: string, skillPath: string, priority: number) =>
      ipcRenderer.invoke(IPC.SKILLS_SET_PRIORITY, projectId, skillPath, priority)
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

  // ─── Usage & Analytics ────────────────────────────────────────────────────────
  usage: {
    session: (sessionId: string) => ipcRenderer.invoke(IPC.USAGE_SESSION, sessionId),
    weekly: (projectId?: string) => ipcRenderer.invoke(IPC.USAGE_WEEKLY, projectId),
    project: (projectId: string) => ipcRenderer.invoke(IPC.USAGE_PROJECT, projectId),
    dailyBreakdown: (days?: number, projectId?: string) =>
      ipcRenderer.invoke(IPC.USAGE_DAILY_BREAKDOWN, days, projectId),
    tools: (projectId?: string, days?: number) =>
      ipcRenderer.invoke(IPC.USAGE_TOOLS, projectId, days),
    context: (sessionId: string) => ipcRenderer.invoke(IPC.USAGE_CONTEXT, sessionId),
    live: () => ipcRenderer.invoke(IPC.USAGE_LIVE)
  },

  // ─── Insights ─────────────────────────────────────────────────────────────────
  insights: {
    list: (projectId: string, limit?: number) =>
      ipcRenderer.invoke(IPC.INSIGHTS_LIST, projectId, limit),
    get: (id: string) => ipcRenderer.invoke(IPC.INSIGHTS_GET, id),
    promoteLearning: (projectId: string, learning: string) =>
      ipcRenderer.invoke(IPC.INSIGHTS_PROMOTE_LEARNING, projectId, learning)
  },

  // ─── Palace (MemPalace Architecture) ────────────────────────────────────────
  palace: {
    identityGet: (projectId: string) => ipcRenderer.invoke(IPC.PALACE_IDENTITY_GET, projectId),
    identitySet: (projectId: string, content: string) =>
      ipcRenderer.invoke(IPC.PALACE_IDENTITY_SET, projectId, content),
    rooms: (projectId: string) => ipcRenderer.invoke(IPC.PALACE_ROOMS, projectId),
    detectRooms: (projectId: string) => ipcRenderer.invoke(IPC.PALACE_DETECT_ROOMS, projectId),
    stats: (projectId: string) => ipcRenderer.invoke(IPC.PALACE_STATS, projectId),
    graph: (projectId?: string) => ipcRenderer.invoke(IPC.PALACE_GRAPH, projectId),
    traverse: (startRoom: string, maxHops?: number) =>
      ipcRenderer.invoke(IPC.PALACE_TRAVERSE, startRoom, maxHops),
    tunnels: (wingA?: string, wingB?: string) =>
      ipcRenderer.invoke(IPC.PALACE_TUNNELS, wingA, wingB),
    search: (projectId: string, query: string, opts?: any) =>
      ipcRenderer.invoke(IPC.PALACE_SEARCH, projectId, query, opts),
    duplicateCheck: (projectId: string, content: string, wing?: string, room?: string) =>
      ipcRenderer.invoke(IPC.PALACE_DUPLICATE_CHECK, projectId, content, wing, room)
  },

  // ─── Knowledge Graph ───────────────────────────────────────────────────────
  kg: {
    addEntity: (name: string, entityType: string, properties?: any) =>
      ipcRenderer.invoke(IPC.KG_ADD_ENTITY, name, entityType, properties),
    listEntities: (entityType?: string) =>
      ipcRenderer.invoke(IPC.KG_LIST_ENTITIES, entityType),
    addTriple: (subject: string, predicate: string, object: string, opts?: any) =>
      ipcRenderer.invoke(IPC.KG_ADD_TRIPLE, subject, predicate, object, opts),
    invalidate: (subject: string, predicate: string, object: string, ended?: string) =>
      ipcRenderer.invoke(IPC.KG_INVALIDATE, subject, predicate, object, ended),
    queryEntity: (name: string, opts?: any) =>
      ipcRenderer.invoke(IPC.KG_QUERY_ENTITY, name, opts),
    queryRelationship: (predicate: string, asOf?: string) =>
      ipcRenderer.invoke(IPC.KG_QUERY_RELATIONSHIP, predicate, asOf),
    timeline: (entityName: string, limit?: number) =>
      ipcRenderer.invoke(IPC.KG_TIMELINE, entityName, limit),
    stats: () => ipcRenderer.invoke(IPC.KG_STATS)
  },

  // ─── Agent Diary ───────────────────────────────────────────────────────────
  diary: {
    write: (opts: any) => ipcRenderer.invoke(IPC.DIARY_WRITE, opts),
    read: (projectId: string, agentName?: string, lastN?: number) =>
      ipcRenderer.invoke(IPC.DIARY_READ, projectId, agentName, lastN),
    readByTopic: (projectId: string, topic: string, lastN?: number) =>
      ipcRenderer.invoke(IPC.DIARY_READ_BY_TOPIC, projectId, topic, lastN)
  },

  // ─── Asana ─────────────────────────────────────────────────────────────────
  asana: {
    verify: () => ipcRenderer.invoke(IPC.ASANA_VERIFY),
    setToken: (token: string) => ipcRenderer.invoke(IPC.ASANA_SET_TOKEN, token),
    getToken: () => ipcRenderer.invoke(IPC.ASANA_GET_TOKEN),
    workspaces: () => ipcRenderer.invoke(IPC.ASANA_WORKSPACES),
    projects: (workspaceGid: string) => ipcRenderer.invoke(IPC.ASANA_PROJECTS, workspaceGid),
    sections: (projectGid: string) => ipcRenderer.invoke(IPC.ASANA_SECTIONS, projectGid),
    tasks: (projectGid: string) => ipcRenderer.invoke(IPC.ASANA_TASKS, projectGid),
    taskDetail: (taskGid: string) => ipcRenderer.invoke(IPC.ASANA_TASK_DETAIL, taskGid),
    completeTask: (taskGid: string, comment?: string) =>
      ipcRenderer.invoke(IPC.ASANA_COMPLETE_TASK, taskGid, comment),
    addComment: (taskGid: string, text: string) =>
      ipcRenderer.invoke(IPC.ASANA_ADD_COMMENT, taskGid, text)
  },

  // ─── Checkpoints ────────────────────────────────────────────────────────────
  checkpoints: {
    list: (sessionId: string) => ipcRenderer.invoke(IPC.CHECKPOINTS_LIST, sessionId),
    get: (checkpointId: string) => ipcRenderer.invoke(IPC.CHECKPOINTS_GET, checkpointId)
  },

  // ─── Security ──────────────────────────────────────────────────────────────
  security: {
    score: (sessionId: string) => ipcRenderer.invoke(IPC.SECURITY_SCORE, sessionId),
    projectScores: (projectId: string, limit?: number) =>
      ipcRenderer.invoke(IPC.SECURITY_PROJECT_SCORES, projectId, limit)
  },

  // ─── App Settings ─────────────────────────────────────────────────────────────
  settings: {
    get: (key: string) => ipcRenderer.invoke(IPC.SETTINGS_GET, key),
    set: (key: string, value: any) => ipcRenderer.invoke(IPC.SETTINGS_SET, key, value)
  },

  // ─── System ───────────────────────────────────────────────────────────────────
  system: {
    openDialog: (options: any) => ipcRenderer.invoke(IPC.SYSTEM_OPEN_DIALOG, options),
    openExternal: (url: string) => ipcRenderer.invoke(IPC.SYSTEM_OPEN_EXTERNAL, url),
    claudeCheck: () => ipcRenderer.invoke(IPC.SYSTEM_CLAUDE_CHECK),
    activeSessions: () => ipcRenderer.invoke(IPC.SYSTEM_ACTIVE_SESSIONS)
  },

  // ─── Event subscriptions ──────────────────────────────────────────────────────
  on: (
    event:
      | 'session-output'
      | 'task-status'
      | 'output-created'
      | 'git-changed'
      | 'usage-update'
      | 'session-health',
    callback: (...args: any[]) => void
  ): (() => void) => {
    const channelMap: Record<string, string> = {
      'session-output': IPC.EVENT_SESSION_OUTPUT,
      'task-status': IPC.EVENT_TASK_STATUS,
      'output-created': IPC.EVENT_OUTPUT_CREATED,
      'git-changed': IPC.EVENT_GIT_CHANGED,
      'usage-update': IPC.EVENT_USAGE_UPDATE,
      'session-health': IPC.EVENT_SESSION_HEALTH
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
