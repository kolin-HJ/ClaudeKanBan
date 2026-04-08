// Type declarations for the contextBridge-injected Electron API
// This mirrors the structure exposed in src/preload/index.ts

interface ElectronAPI {
  projects: {
    list(): Promise<any[]>
    create(name: string, path: string): Promise<any>
    remove(id: string): Promise<void>
  }
  tasks: {
    list(projectId: string): Promise<any[]>
    create(projectId: string, opts: any): Promise<any>
    updateStatus(taskId: string, status: string): Promise<void>
    delete(taskId: string): Promise<void>
  }
  sessions: {
    spawn(taskId: string): Promise<void>
    send(taskId: string, message: string): Promise<void>
    terminate(taskId: string): Promise<void>
    status(taskId: string): Promise<string>
  }
  messages: {
    history(taskId: string): Promise<any[]>
    lastTwo(taskId: string): Promise<any[]>
  }
  outputs: {
    list(taskId: string): Promise<any[]>
    readFile(filePath: string): Promise<string | null>
    recent(projectId: string, limit?: number): Promise<any[]>
  }
  git: {
    status(projectId: string): Promise<any>
    diff(projectId: string, filePath?: string): Promise<string>
    stage(projectId: string, files: string[]): Promise<void>
    unstage(projectId: string, files: string[]): Promise<void>
    commit(projectId: string, message: string): Promise<void>
    push(projectId: string): Promise<void>
    pull(projectId: string): Promise<void>
    branches(projectId: string): Promise<any[]>
    createBranch(projectId: string, name: string): Promise<void>
    checkout(projectId: string, branch: string): Promise<void>
  }
  github: {
    listPRs(projectId: string): Promise<any[]>
    createPR(projectId: string, opts: any): Promise<any>
    listIssues(projectId: string): Promise<any[]>
  }
  memory: {
    list(projectId: string, query?: string): Promise<any[]>
    create(projectId: string, opts: any): Promise<any>
    update(id: string, content: string): Promise<void>
    delete(id: string): Promise<void>
    search(projectId: string, query: string): Promise<any[]>
    contextBlock(projectId: string, taskDescription: string): Promise<string>
    captureFromTask(taskId: string): Promise<any[]>
    consolidate(projectId: string): Promise<any>
    exportMemories(projectId: string): Promise<any[]>
    importMemories(projectId: string, data: any[]): Promise<void>
    globalPatterns(): Promise<any[]>
  }
  skills: {
    list(projectPath?: string): Promise<any[]>
    read(filePath: string): Promise<string>
    update(filePath: string, content: string): Promise<void>
    create(name: string, content: string, targetDir: string): Promise<any>
    fetchUrl(url: string): Promise<string>
    projectList(projectId: string): Promise<any[]>
    toggle(projectId: string, skillPath: string, active: boolean): Promise<void>
    setPriority(projectId: string, skillPath: string, priority: number): Promise<void>
  }
  docs: {
    list(projectId: string): Promise<{ name: string; path: string }[]>
    read(filePath: string): Promise<string>
    update(filePath: string, content: string): Promise<void>
  }
  scheduled: {
    list(): Promise<any[]>
    run(id: string): Promise<any>
    toggle(id: string): Promise<void>
    delete(id: string): Promise<void>
  }
  usage: {
    session(sessionId: string): Promise<any>
    weekly(projectId?: string): Promise<any>
    project(projectId: string): Promise<any>
    dailyBreakdown(days?: number, projectId?: string): Promise<any[]>
    tools(projectId?: string, days?: number): Promise<any[]>
    context(sessionId: string): Promise<any[]>
    live(): Promise<any[]>
  }
  insights: {
    list(projectId: string, limit?: number): Promise<any[]>
    get(id: string): Promise<any>
    promoteLearning(projectId: string, learning: string): Promise<void>
  }
  settings: {
    get(key: string): Promise<any>
    set(key: string, value: any): Promise<void>
  }
  system: {
    openDialog(options: any): Promise<any>
    openExternal(url: string): Promise<void>
    claudeCheck(): Promise<{ available: boolean; version?: string; error?: string }>
    activeSessions(): Promise<any[]>
  }
  on(
    event:
      | 'session-output'
      | 'task-status'
      | 'output-created'
      | 'git-changed'
      | 'usage-update'
      | 'session-health',
    callback: (...args: any[]) => void
  ): () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
