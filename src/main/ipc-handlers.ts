import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from './db'
import { IPC, Project, Task, Message, Output } from '../shared/types'
import { ClaudeManager } from './claude-manager'
import { GitManager } from './git-manager'
import { GithubManager } from './github-manager'
import { MemoryManager } from './memory-manager'
import { SkillsManager } from './skills-manager'

const claudeManager = new ClaudeManager()
const gitManager = new GitManager()
const githubManager = new GithubManager()
const memoryManager = new MemoryManager()
const skillsManager = new SkillsManager()

export function registerIpcHandlers(): void {
  registerProjectHandlers()
  registerTaskHandlers()
  registerSessionHandlers()
  registerMessageHandlers()
  registerOutputHandlers()
  registerGitHandlers()
  registerGithubHandlers()
  registerMemoryHandlers()
  registerSkillsHandlers()
  registerDocsHandlers()
  registerScheduledHandlers()
  registerSystemHandlers()
}

// ─── Projects ────────────────────────────────────────────────────────────────

function registerProjectHandlers(): void {
  ipcMain.handle(IPC.PROJECTS_LIST, () => {
    const rows = getDb()
      .prepare('SELECT * FROM projects ORDER BY created_at DESC')
      .all() as any[]
    return rows.map(rowToProject)
  })

  ipcMain.handle(IPC.PROJECTS_CREATE, (_e, name: string, path: string) => {
    const id = uuidv4()
    getDb()
      .prepare('INSERT INTO projects (id, name, path) VALUES (?, ?, ?)')
      .run(id, name, path)

    // Try to detect github remote
    gitManager.getRemote(path).then((remote) => {
      if (remote) {
        getDb()
          .prepare('UPDATE projects SET github_remote = ? WHERE id = ?')
          .run(remote, id)
      }
    })

    return rowToProject(
      getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as any
    )
  })

  ipcMain.handle(IPC.PROJECTS_REMOVE, (_e, id: string) => {
    getDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
  })
}

function rowToProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    githubRemote: row.github_remote,
    createdAt: row.created_at
  }
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

function registerTaskHandlers(): void {
  ipcMain.handle(IPC.TASKS_LIST, (_e, projectId: string) => {
    const rows = getDb()
      .prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC')
      .all(projectId) as any[]
    return rows.map(rowToTask)
  })

  ipcMain.handle(
    IPC.TASKS_CREATE,
    (_e, projectId: string, opts: { title: string; description?: string; depth: string; permission: string }) => {
      const id = uuidv4()
      getDb()
        .prepare(
          `INSERT INTO tasks (id, project_id, title, description, status, depth, permission)
           VALUES (?, ?, ?, ?, 'in-progress', ?, ?)`
        )
        .run(id, projectId, opts.title, opts.description ?? null, opts.depth, opts.permission)
      return rowToTask(getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any)
    }
  )

  ipcMain.handle(IPC.TASKS_UPDATE_STATUS, (_e, taskId: string, status: string) => {
    getDb()
      .prepare(`UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(status, taskId)

    // Notify renderer
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IPC.EVENT_TASK_STATUS, { taskId, status })
    })
  })

  ipcMain.handle(IPC.TASKS_DELETE, (_e, taskId: string) => {
    claudeManager.terminate(taskId)
    getDb().prepare('DELETE FROM tasks WHERE id = ?').run(taskId)
  })
}

function rowToTask(row: any): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    depth: row.depth,
    permission: row.permission,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

function registerSessionHandlers(): void {
  ipcMain.handle(IPC.SESSIONS_SPAWN, async (_e, taskId: string) => {
    const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any
    if (!task) throw new Error('Task not found')
    const project = getDb()
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(task.project_id) as any
    if (!project) throw new Error('Project not found')

    // Build memory context block for this task
    const memoryContext = await memoryManager.generateContextBlock(task.project_id, task.title)

    await claudeManager.spawn({
      taskId,
      projectPath: project.path,
      goal: task.title + (task.description ? `\n\n${task.description}` : ''),
      depth: task.depth,
      permission: task.permission,
      memoryContext
    })
  })

  ipcMain.handle(IPC.SESSIONS_SEND, async (_e, taskId: string, message: string) => {
    // Save user message to DB
    const msgId = uuidv4()
    getDb()
      .prepare('INSERT INTO messages (id, task_id, role, content) VALUES (?, ?, ?, ?)')
      .run(msgId, taskId, 'user', message)

    await claudeManager.send(taskId, message)

    // Move task to in-progress
    getDb()
      .prepare(`UPDATE tasks SET status = 'in-progress', updated_at = datetime('now') WHERE id = ?`)
      .run(taskId)
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IPC.EVENT_TASK_STATUS, { taskId, status: 'in-progress' })
    })
  })

  ipcMain.handle(IPC.SESSIONS_TERMINATE, (_e, taskId: string) => {
    claudeManager.terminate(taskId)
  })

  ipcMain.handle(IPC.SESSIONS_STATUS, (_e, taskId: string) => {
    return claudeManager.getStatus(taskId)
  })
}

// ─── Messages ─────────────────────────────────────────────────────────────────

function registerMessageHandlers(): void {
  ipcMain.handle(IPC.MESSAGES_HISTORY, (_e, taskId: string) => {
    const rows = getDb()
      .prepare('SELECT * FROM messages WHERE task_id = ? ORDER BY timestamp ASC')
      .all(taskId) as any[]
    return rows.map(rowToMessage)
  })

  ipcMain.handle(IPC.MESSAGES_LAST_TWO, (_e, taskId: string) => {
    const rows = getDb()
      .prepare(
        'SELECT * FROM messages WHERE task_id = ? ORDER BY timestamp DESC LIMIT 2'
      )
      .all(taskId) as any[]
    return rows.reverse().map(rowToMessage)
  })
}

function rowToMessage(row: any): Message {
  return {
    id: row.id,
    taskId: row.task_id,
    role: row.role,
    content: row.content,
    timestamp: row.timestamp
  }
}

// ─── Outputs ──────────────────────────────────────────────────────────────────

function registerOutputHandlers(): void {
  ipcMain.handle(IPC.OUTPUTS_LIST, (_e, taskId: string) => {
    const rows = getDb()
      .prepare('SELECT * FROM outputs WHERE task_id = ? ORDER BY created_at DESC')
      .all(taskId) as any[]
    return rows.map(rowToOutput)
  })

  ipcMain.handle(IPC.OUTPUTS_READ, (_e, filePath: string) => {
    const { readFileSync } = require('fs')
    try {
      return readFileSync(filePath, 'utf-8')
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.OUTPUTS_RECENT, (_e, projectId: string, limit = 20) => {
    const rows = getDb()
      .prepare(
        `SELECT o.*, t.title as task_title FROM outputs o
         JOIN tasks t ON t.id = o.task_id
         WHERE t.project_id = ?
         ORDER BY o.created_at DESC
         LIMIT ?`
      )
      .all(projectId, limit) as any[]
    return rows.map((row) => ({ ...rowToOutput(row), taskTitle: row.task_title }))
  })
}

function rowToOutput(row: any): Output {
  return {
    id: row.id,
    taskId: row.task_id,
    filePath: row.file_path,
    fileName: row.file_name,
    previewText: row.preview_text,
    createdAt: row.created_at
  }
}

// ─── Git ──────────────────────────────────────────────────────────────────────

function registerGitHandlers(): void {
  ipcMain.handle(IPC.GIT_STATUS, async (_e, projectId: string) => {
    const project = getDb().prepare('SELECT path FROM projects WHERE id = ?').get(projectId) as any
    if (!project) return null
    return gitManager.status(project.path)
  })

  ipcMain.handle(IPC.GIT_DIFF, async (_e, projectId: string, filePath: string) => {
    const project = getDb().prepare('SELECT path FROM projects WHERE id = ?').get(projectId) as any
    if (!project) return ''
    return gitManager.diff(project.path, filePath)
  })

  ipcMain.handle(IPC.GIT_STAGE, async (_e, projectId: string, files: string[]) => {
    const project = getDb().prepare('SELECT path FROM projects WHERE id = ?').get(projectId) as any
    if (!project) return
    return gitManager.stage(project.path, files)
  })

  ipcMain.handle(IPC.GIT_UNSTAGE, async (_e, projectId: string, files: string[]) => {
    const project = getDb().prepare('SELECT path FROM projects WHERE id = ?').get(projectId) as any
    if (!project) return
    return gitManager.unstage(project.path, files)
  })

  ipcMain.handle(IPC.GIT_COMMIT, async (_e, projectId: string, message: string) => {
    const project = getDb().prepare('SELECT path FROM projects WHERE id = ?').get(projectId) as any
    if (!project) return
    return gitManager.commit(project.path, message)
  })

  ipcMain.handle(IPC.GIT_PUSH, async (_e, projectId: string) => {
    const project = getDb().prepare('SELECT path FROM projects WHERE id = ?').get(projectId) as any
    if (!project) return
    return gitManager.push(project.path)
  })

  ipcMain.handle(IPC.GIT_PULL, async (_e, projectId: string) => {
    const project = getDb().prepare('SELECT path FROM projects WHERE id = ?').get(projectId) as any
    if (!project) return
    return gitManager.pull(project.path)
  })

  ipcMain.handle(IPC.GIT_BRANCHES, async (_e, projectId: string) => {
    const project = getDb().prepare('SELECT path FROM projects WHERE id = ?').get(projectId) as any
    if (!project) return []
    return gitManager.branches(project.path)
  })

  ipcMain.handle(IPC.GIT_CREATE_BRANCH, async (_e, projectId: string, name: string) => {
    const project = getDb().prepare('SELECT path FROM projects WHERE id = ?').get(projectId) as any
    if (!project) return
    return gitManager.createBranch(project.path, name)
  })

  ipcMain.handle(IPC.GIT_CHECKOUT, async (_e, projectId: string, branch: string) => {
    const project = getDb().prepare('SELECT path FROM projects WHERE id = ?').get(projectId) as any
    if (!project) return
    return gitManager.checkout(project.path, branch)
  })
}

// ─── GitHub ───────────────────────────────────────────────────────────────────

function registerGithubHandlers(): void {
  ipcMain.handle(IPC.GITHUB_LIST_PRS, async (_e, projectId: string) => {
    const project = getDb()
      .prepare('SELECT github_remote FROM projects WHERE id = ?')
      .get(projectId) as any
    if (!project?.github_remote) return []
    return githubManager.listPRs(project.github_remote)
  })

  ipcMain.handle(IPC.GITHUB_CREATE_PR, async (_e, projectId: string, opts: any) => {
    const project = getDb()
      .prepare('SELECT github_remote FROM projects WHERE id = ?')
      .get(projectId) as any
    if (!project?.github_remote) throw new Error('No GitHub remote configured')
    return githubManager.createPR(project.github_remote, opts)
  })

  ipcMain.handle(IPC.GITHUB_LIST_ISSUES, async (_e, projectId: string) => {
    const project = getDb()
      .prepare('SELECT github_remote FROM projects WHERE id = ?')
      .get(projectId) as any
    if (!project?.github_remote) return []
    return githubManager.listIssues(project.github_remote)
  })
}

// ─── Memory ───────────────────────────────────────────────────────────────────

function registerMemoryHandlers(): void {
  ipcMain.handle(IPC.MEMORY_LIST, (_e, projectId: string, query?: string) => {
    return memoryManager.list(projectId, query)
  })

  ipcMain.handle(IPC.MEMORY_CREATE, (_e, projectId: string, opts: any) => {
    return memoryManager.create(projectId, opts)
  })

  ipcMain.handle(IPC.MEMORY_UPDATE, (_e, id: string, content: string) => {
    return memoryManager.update(id, content)
  })

  ipcMain.handle(IPC.MEMORY_DELETE, (_e, id: string) => {
    return memoryManager.delete(id)
  })

  ipcMain.handle(IPC.MEMORY_SEARCH, (_e, projectId: string, query: string) => {
    return memoryManager.search(projectId, query)
  })

  ipcMain.handle(IPC.MEMORY_CONTEXT_BLOCK, (_e, projectId: string, taskDescription: string) => {
    return memoryManager.generateContextBlock(projectId, taskDescription)
  })

  ipcMain.handle(IPC.MEMORY_CAPTURE_TASK, (_e, taskId: string) => {
    return memoryManager.captureFromTask(taskId)
  })
}

// ─── Skills ───────────────────────────────────────────────────────────────────

function registerSkillsHandlers(): void {
  ipcMain.handle(IPC.SKILLS_LIST, async (_e, projectPath?: string) => {
    return skillsManager.list(projectPath)
  })

  ipcMain.handle(IPC.SKILLS_READ, async (_e, filePath: string) => {
    return skillsManager.read(filePath)
  })

  ipcMain.handle(IPC.SKILLS_UPDATE, async (_e, filePath: string, content: string) => {
    return skillsManager.update(filePath, content)
  })

  ipcMain.handle(IPC.SKILLS_CREATE, async (_e, name: string, content: string, targetDir: string) => {
    return skillsManager.create(name, content, targetDir)
  })

  ipcMain.handle(IPC.SKILLS_FETCH_URL, async (_e, url: string) => {
    return skillsManager.fetchFromUrl(url)
  })
}

// ─── Docs ─────────────────────────────────────────────────────────────────────

function registerDocsHandlers(): void {
  ipcMain.handle(IPC.DOCS_LIST, (_e, projectId: string) => {
    const project = getDb().prepare('SELECT path FROM projects WHERE id = ?').get(projectId) as any
    if (!project) return []
    return getDocFiles(project.path)
  })

  ipcMain.handle(IPC.DOCS_READ, (_e, filePath: string) => {
    const { readFileSync, existsSync } = require('fs')
    if (!existsSync(filePath)) return ''
    return readFileSync(filePath, 'utf-8')
  })

  ipcMain.handle(IPC.DOCS_UPDATE, (_e, filePath: string, content: string) => {
    const { writeFileSync, mkdirSync, dirname } = require('fs')
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, content, 'utf-8')
  })
}

function getDocFiles(projectPath: string): { name: string; path: string }[] {
  const { existsSync } = require('fs')
  const { join } = require('path')

  const candidates = [
    { name: 'CLAUDE.md', path: join(projectPath, 'CLAUDE.md') },
    { name: 'README.md', path: join(projectPath, 'README.md') },
    { name: 'Brand Voice', path: join(projectPath, '.claude', 'brand.md') },
    { name: 'Project Context', path: join(projectPath, '.claude', 'context.md') },
    { name: 'Memories', path: join(projectPath, '.claude', 'memories.md') }
  ]

  return candidates.filter((c) => existsSync(c.path))
}

// ─── Scheduled Tasks ──────────────────────────────────────────────────────────

function registerScheduledHandlers(): void {
  const { readFileSync, writeFileSync, existsSync } = require('fs')
  const { join } = require('path')
  const os = require('os')

  const getSettingsPath = () => join(os.homedir(), '.claude', 'settings.json')

  const readSettings = () => {
    const p = getSettingsPath()
    if (!existsSync(p)) return {}
    try {
      return JSON.parse(readFileSync(p, 'utf-8'))
    } catch {
      return {}
    }
  }

  ipcMain.handle(IPC.SCHEDULED_LIST, () => {
    const settings = readSettings()
    const hooks: any[] = settings?.hooks?.PostSessionEnd ?? []
    return hooks
      .filter((h: any) => h.schedule)
      .map((h: any) => ({
        id: h.id ?? h.name,
        name: h.name ?? h.id,
        schedule: h.schedule,
        command: h.command ?? '',
        active: h.active !== false,
        lastRun: h.lastRun,
        lastStatus: h.lastStatus,
        lastOutputFile: h.lastOutputFile
      }))
  })

  ipcMain.handle(IPC.SCHEDULED_TOGGLE, (_e, id: string) => {
    const settings = readSettings()
    const hooks: any[] = settings?.hooks?.PostSessionEnd ?? []
    const hook = hooks.find((h: any) => (h.id ?? h.name) === id)
    if (hook) {
      hook.active = !hook.active
      writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2))
    }
  })

  ipcMain.handle(IPC.SCHEDULED_DELETE, (_e, id: string) => {
    const settings = readSettings()
    if (settings?.hooks?.PostSessionEnd) {
      settings.hooks.PostSessionEnd = settings.hooks.PostSessionEnd.filter(
        (h: any) => (h.id ?? h.name) !== id
      )
      writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2))
    }
  })

  ipcMain.handle(IPC.SCHEDULED_RUN, async (_e, id: string) => {
    const settings = readSettings()
    const hooks: any[] = settings?.hooks?.PostSessionEnd ?? []
    const hook = hooks.find((h: any) => (h.id ?? h.name) === id)
    if (!hook?.command) throw new Error('Hook not found or no command')

    const { exec } = require('child_process')
    const { promisify } = require('util')
    const execAsync = promisify(exec)
    try {
      await execAsync(hook.command)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}

// ─── System ───────────────────────────────────────────────────────────────────

function registerSystemHandlers(): void {
  ipcMain.handle(IPC.SYSTEM_OPEN_DIALOG, async (_e, options: any) => {
    const result = await dialog.showOpenDialog(options)
    return result
  })

  ipcMain.handle(IPC.SYSTEM_OPEN_EXTERNAL, (_e, url: string) => {
    shell.openExternal(url)
  })
}
