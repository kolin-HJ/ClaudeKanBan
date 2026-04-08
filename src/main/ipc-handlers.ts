import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from './db'
import { IPC, Project, Task, Message, Output } from '../shared/types'
import { ClaudeManager } from './claude-manager'
import { GitManager } from './git-manager'
import { GithubManager } from './github-manager'
import { MemoryManager } from './memory-manager'
import { SkillsManager } from './skills-manager'
import { InsightsManager } from './insights-manager'
import { AsanaManager } from './asana-manager'
import { KnowledgeGraph } from './knowledge-graph'
import { DiaryManager } from './diary-manager'
import * as palaceGraph from './palace-graph'
import { detectRooms } from './room-detector'

const claudeManager = new ClaudeManager()
const gitManager = new GitManager()
const githubManager = new GithubManager()
const memoryManager = new MemoryManager()
const skillsManager = new SkillsManager()
const insightsManager = new InsightsManager(memoryManager, knowledgeGraph, diaryManager)
const asanaManager = new AsanaManager()
const knowledgeGraph = new KnowledgeGraph()
const diaryManager = new DiaryManager()

// Wire up insight generation callback so ClaudeManager triggers it on session end
claudeManager.setInsightCallback((sessionId: string) => {
  insightsManager.generateInsight(sessionId)
})

export { claudeManager }

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
  registerUsageHandlers()
  registerInsightsHandlers()
  registerPalaceHandlers()
  registerKnowledgeGraphHandlers()
  registerDiaryHandlers()
  registerCheckpointHandlers()
  registerSecurityHandlers()
  registerAsanaHandlers()
  registerSettingsHandlers()
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
    (_e, projectId: string, opts: { title: string; description?: string; depth: string; permission: string; asanaGid?: string; asanaPermalink?: string }) => {
      const id = uuidv4()
      getDb()
        .prepare(
          `INSERT INTO tasks (id, project_id, title, description, status, depth, permission, asana_gid, asana_permalink)
           VALUES (?, ?, ?, ?, 'in-progress', ?, ?, ?, ?)`
        )
        .run(id, projectId, opts.title, opts.description ?? null, opts.depth, opts.permission, opts.asanaGid ?? null, opts.asanaPermalink ?? null)
      return rowToTask(getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any)
    }
  )

  ipcMain.handle(IPC.TASKS_UPDATE_STATUS, (_e, taskId: string, status: string) => {
    getDb()
      .prepare(`UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(status, taskId)

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
    updatedAt: row.updated_at,
    asanaGid: row.asana_gid,
    asanaPermalink: row.asana_permalink
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

    // Verify project path exists
    const { existsSync } = require('fs')
    if (!existsSync(project.path)) {
      throw new Error(`Project directory not found: ${project.path}`)
    }

    // Build memory context block for this task
    const memoryContext = await memoryManager.generateContextBlock(task.project_id, task.title)

    // Build skills context from active project skills
    let skillsContext = ''
    try {
      const activeSkills = getDb()
        .prepare(
          `SELECT skill_path FROM project_skills
           WHERE project_id = ? AND active = 1
           ORDER BY priority ASC`
        )
        .all(task.project_id) as { skill_path: string }[]

      if (activeSkills.length > 0) {
        const skillContents: string[] = []
        for (const { skill_path } of activeSkills) {
          try {
            const content = await skillsManager.read(skill_path)
            if (content) skillContents.push(content)
          } catch {
            // skip unreadable skills
          }
        }
        if (skillContents.length > 0) {
          skillsContext = '# Active Skills\n\n' + skillContents.join('\n\n---\n\n')
        }
      }
    } catch {
      // ignore skills errors
    }

    // Check if worktree isolation is enabled
    let useWorktree = false
    try {
      const worktreeSetting = getDb()
        .prepare("SELECT value FROM app_settings WHERE key = 'useWorktreeIsolation'")
        .get() as any
      useWorktree = worktreeSetting?.value === 'true'
    } catch {
      // ignore
    }

    await claudeManager.spawn({
      taskId,
      projectPath: project.path,
      projectId: task.project_id,
      goal: task.title + (task.description ? `\n\n${task.description}` : ''),
      depth: task.depth,
      permission: task.permission,
      memoryContext,
      skillsContext,
      useWorktree
    })
  })

  ipcMain.handle(IPC.SESSIONS_SEND, async (_e, taskId: string, message: string) => {
    const msgId = uuidv4()
    getDb()
      .prepare('INSERT INTO messages (id, task_id, role, content) VALUES (?, ?, ?, ?)')
      .run(msgId, taskId, 'user', message)

    await claudeManager.send(taskId, message)

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

  ipcMain.handle(IPC.MEMORY_CONSOLIDATE, (_e, projectId: string) => {
    return memoryManager.consolidate(projectId)
  })

  ipcMain.handle(IPC.MEMORY_EXPORT, (_e, projectId: string) => {
    return memoryManager.exportMemories(projectId)
  })

  ipcMain.handle(IPC.MEMORY_IMPORT, (_e, projectId: string, data: any[]) => {
    return memoryManager.importMemories(projectId, data)
  })

  ipcMain.handle(IPC.MEMORY_GLOBAL_PATTERNS, () => {
    return memoryManager.getGlobalPatterns()
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

  // Per-project skill configuration
  ipcMain.handle(IPC.SKILLS_PROJECT_LIST, (_e, projectId: string) => {
    const rows = getDb()
      .prepare(
        `SELECT * FROM project_skills WHERE project_id = ? ORDER BY priority ASC`
      )
      .all(projectId) as any[]
    return rows.map((r: any) => ({
      id: r.id,
      projectId: r.project_id,
      skillPath: r.skill_path,
      active: r.active === 1,
      priority: r.priority
    }))
  })

  ipcMain.handle(
    IPC.SKILLS_TOGGLE,
    (_e, projectId: string, skillPath: string, active: boolean) => {
      const existing = getDb()
        .prepare('SELECT id FROM project_skills WHERE project_id = ? AND skill_path = ?')
        .get(projectId, skillPath) as any

      if (existing) {
        getDb()
          .prepare('UPDATE project_skills SET active = ? WHERE id = ?')
          .run(active ? 1 : 0, existing.id)
      } else {
        const id = uuidv4()
        getDb()
          .prepare(
            'INSERT INTO project_skills (id, project_id, skill_path, active) VALUES (?, ?, ?, ?)'
          )
          .run(id, projectId, skillPath, active ? 1 : 0)
      }
    }
  )

  ipcMain.handle(
    IPC.SKILLS_SET_PRIORITY,
    (_e, projectId: string, skillPath: string, priority: number) => {
      getDb()
        .prepare(
          'UPDATE project_skills SET priority = ? WHERE project_id = ? AND skill_path = ?'
        )
        .run(priority, projectId, skillPath)
    }
  )
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
    const { writeFileSync, mkdirSync } = require('fs')
    const { dirname } = require('path')
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

// ─── Usage & Analytics ───────────────────────────────────────────────────────

function registerUsageHandlers(): void {
  ipcMain.handle(IPC.USAGE_SESSION, (_e, sessionId: string) => {
    const row = getDb()
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(sessionId) as any
    if (!row) return null
    return rowToSession(row)
  })

  ipcMain.handle(IPC.USAGE_WEEKLY, (_e, projectId?: string) => {
    const query = projectId
      ? `SELECT
           COALESCE(SUM(input_tokens), 0) as total_input,
           COALESCE(SUM(output_tokens), 0) as total_output,
           COALESCE(SUM(total_cost_usd), 0) as total_cost,
           COUNT(*) as session_count,
           COALESCE(SUM(duration_secs), 0) as total_duration
         FROM sessions
         WHERE project_id = ? AND started_at >= datetime('now', '-7 days')`
      : `SELECT
           COALESCE(SUM(input_tokens), 0) as total_input,
           COALESCE(SUM(output_tokens), 0) as total_output,
           COALESCE(SUM(total_cost_usd), 0) as total_cost,
           COUNT(*) as session_count,
           COALESCE(SUM(duration_secs), 0) as total_duration
         FROM sessions
         WHERE started_at >= datetime('now', '-7 days')`

    const row = (
      projectId
        ? getDb().prepare(query).get(projectId)
        : getDb().prepare(query).get()
    ) as any

    return {
      totalInputTokens: row.total_input,
      totalOutputTokens: row.total_output,
      totalCostUsd: row.total_cost,
      sessionCount: row.session_count,
      totalDurationSecs: row.total_duration
    }
  })

  ipcMain.handle(IPC.USAGE_PROJECT, (_e, projectId: string) => {
    const row = getDb()
      .prepare(
        `SELECT
           COALESCE(SUM(input_tokens), 0) as total_input,
           COALESCE(SUM(output_tokens), 0) as total_output,
           COALESCE(SUM(total_cost_usd), 0) as total_cost,
           COUNT(*) as session_count,
           COALESCE(SUM(duration_secs), 0) as total_duration
         FROM sessions
         WHERE project_id = ?`
      )
      .get(projectId) as any
    return {
      totalInputTokens: row.total_input,
      totalOutputTokens: row.total_output,
      totalCostUsd: row.total_cost,
      sessionCount: row.session_count,
      totalDurationSecs: row.total_duration
    }
  })

  ipcMain.handle(IPC.USAGE_DAILY_BREAKDOWN, (_e, days = 7, projectId?: string) => {
    const query = projectId
      ? `SELECT
           date(started_at) as day,
           COALESCE(SUM(input_tokens), 0) as input_tokens,
           COALESCE(SUM(output_tokens), 0) as output_tokens,
           COALESCE(SUM(total_cost_usd), 0) as cost,
           COUNT(*) as sessions
         FROM sessions
         WHERE project_id = ? AND started_at >= datetime('now', '-' || ? || ' days')
         GROUP BY date(started_at)
         ORDER BY day ASC`
      : `SELECT
           date(started_at) as day,
           COALESCE(SUM(input_tokens), 0) as input_tokens,
           COALESCE(SUM(output_tokens), 0) as output_tokens,
           COALESCE(SUM(total_cost_usd), 0) as cost,
           COUNT(*) as sessions
         FROM sessions
         WHERE started_at >= datetime('now', '-' || ? || ' days')
         GROUP BY date(started_at)
         ORDER BY day ASC`

    return projectId
      ? getDb().prepare(query).all(projectId, days)
      : getDb().prepare(query).all(days)
  })

  ipcMain.handle(IPC.USAGE_TOOLS, (_e, projectId?: string, days = 7) => {
    const query = projectId
      ? `SELECT tu.tool_name, COUNT(*) as count
         FROM tool_usage tu
         JOIN sessions s ON s.id = tu.session_id
         WHERE s.project_id = ? AND tu.timestamp >= datetime('now', '-' || ? || ' days')
         GROUP BY tu.tool_name
         ORDER BY count DESC`
      : `SELECT tu.tool_name, COUNT(*) as count
         FROM tool_usage tu
         WHERE tu.timestamp >= datetime('now', '-' || ? || ' days')
         GROUP BY tu.tool_name
         ORDER BY count DESC`

    const rows = projectId
      ? getDb().prepare(query).all(projectId, days)
      : getDb().prepare(query).all(days)
    return (rows as any[]).map((r) => ({ toolName: r.tool_name, count: r.count }))
  })

  ipcMain.handle(IPC.USAGE_CONTEXT, (_e, sessionId: string) => {
    const rows = getDb()
      .prepare('SELECT * FROM context_events WHERE session_id = ? ORDER BY timestamp')
      .all(sessionId) as any[]
    return rows.map((r: any) => ({
      id: r.id,
      sessionId: r.session_id,
      eventType: r.event_type,
      target: r.target,
      timestamp: r.timestamp
    }))
  })

  ipcMain.handle(IPC.USAGE_LIVE, () => {
    return claudeManager.getAllLiveUsage()
  })
}

function rowToSession(row: any) {
  return {
    id: row.id,
    taskId: row.task_id,
    projectId: row.project_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    totalCostUsd: row.total_cost_usd,
    durationSecs: row.duration_secs
  }
}

// ─── Insights ────────────────────────────────────────────────────────────────

function registerInsightsHandlers(): void {
  ipcMain.handle(IPC.INSIGHTS_LIST, (_e, projectId: string, limit?: number) => {
    return insightsManager.list(projectId, limit)
  })

  ipcMain.handle(IPC.INSIGHTS_GET, (_e, id: string) => {
    return insightsManager.get(id)
  })

  ipcMain.handle(IPC.INSIGHTS_PROMOTE_LEARNING, (_e, projectId: string, learning: string) => {
    return insightsManager.promoteLearning(projectId, learning)
  })
}

// ─── Palace (MemPalace Architecture) ──────────────────────────────────────────

function registerPalaceHandlers(): void {
  ipcMain.handle(IPC.PALACE_IDENTITY_GET, (_e, projectId: string) => {
    return memoryManager.getIdentity(projectId)
  })

  ipcMain.handle(IPC.PALACE_IDENTITY_SET, (_e, projectId: string, content: string) => {
    memoryManager.setIdentity(projectId, content)
  })

  ipcMain.handle(IPC.PALACE_ROOMS, (_e, projectId: string) => {
    return memoryManager.palaceStats(projectId).byRoom
  })

  ipcMain.handle(IPC.PALACE_DETECT_ROOMS, (_e, projectId: string) => {
    const project = getDb().prepare('SELECT path FROM projects WHERE id = ?').get(projectId) as any
    if (!project) return []
    return detectRooms(project.path)
  })

  ipcMain.handle(IPC.PALACE_STATS, (_e, projectId: string) => {
    return memoryManager.palaceStats(projectId)
  })

  ipcMain.handle(IPC.PALACE_GRAPH, (_e, projectId?: string) => {
    return palaceGraph.buildGraph(projectId)
  })

  ipcMain.handle(IPC.PALACE_TRAVERSE, (_e, startRoom: string, maxHops?: number) => {
    return palaceGraph.traverse(startRoom, maxHops)
  })

  ipcMain.handle(IPC.PALACE_TUNNELS, (_e, wingA?: string, wingB?: string) => {
    return palaceGraph.findTunnels(wingA, wingB)
  })

  ipcMain.handle(
    IPC.PALACE_SEARCH,
    (_e, projectId: string, query: string, opts?: { wing?: string; room?: string; hall?: string }) => {
      return memoryManager.searchPalace(projectId, query, opts)
    }
  )

  ipcMain.handle(
    IPC.PALACE_DUPLICATE_CHECK,
    (_e, projectId: string, content: string, wing?: string, room?: string) => {
      return memoryManager.checkDuplicate(projectId, content, wing, room)
    }
  )
}

// ─── Knowledge Graph ──────────────────────────────────────────────────────────

function registerKnowledgeGraphHandlers(): void {
  ipcMain.handle(IPC.KG_ADD_ENTITY, (_e, name: string, entityType: string, properties?: any) => {
    return knowledgeGraph.addEntity(name, entityType, properties)
  })

  ipcMain.handle(IPC.KG_LIST_ENTITIES, (_e, entityType?: string) => {
    return knowledgeGraph.listEntities(entityType)
  })

  ipcMain.handle(
    IPC.KG_ADD_TRIPLE,
    (_e, subject: string, predicate: string, object: string, opts?: any) => {
      return knowledgeGraph.addTriple(subject, predicate, object, opts)
    }
  )

  ipcMain.handle(
    IPC.KG_INVALIDATE,
    (_e, subject: string, predicate: string, object: string, ended?: string) => {
      knowledgeGraph.invalidate(subject, predicate, object, ended)
    }
  )

  ipcMain.handle(IPC.KG_QUERY_ENTITY, (_e, name: string, opts?: any) => {
    return knowledgeGraph.queryEntity(name, opts)
  })

  ipcMain.handle(IPC.KG_QUERY_RELATIONSHIP, (_e, predicate: string, asOf?: string) => {
    return knowledgeGraph.queryRelationship(predicate, asOf)
  })

  ipcMain.handle(IPC.KG_TIMELINE, (_e, entityName: string, limit?: number) => {
    return knowledgeGraph.timeline(entityName, limit)
  })

  ipcMain.handle(IPC.KG_STATS, () => {
    return knowledgeGraph.stats()
  })
}

// ─── Agent Diary ──────────────────────────────────────────────────────────────

function registerDiaryHandlers(): void {
  ipcMain.handle(IPC.DIARY_WRITE, (_e, opts: any) => {
    return diaryManager.write(opts)
  })

  ipcMain.handle(IPC.DIARY_READ, (_e, projectId: string, agentName?: string, lastN?: number) => {
    return diaryManager.read(projectId, agentName, lastN)
  })

  ipcMain.handle(
    IPC.DIARY_READ_BY_TOPIC,
    (_e, projectId: string, topic: string, lastN?: number) => {
      return diaryManager.readByTopic(projectId, topic, lastN)
    }
  )
}

// ─── Checkpoints ──────────────────────────────────────────────────────────────

function registerCheckpointHandlers(): void {
  ipcMain.handle(IPC.CHECKPOINTS_LIST, (_e, sessionId: string) => {
    const rows = getDb()
      .prepare('SELECT * FROM session_checkpoints WHERE session_id = ? ORDER BY created_at ASC')
      .all(sessionId) as any[]
    return rows.map((r: any) => ({
      id: r.id,
      sessionId: r.session_id,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      toolsUsedJson: r.tools_used_json,
      filesCreatedJson: r.files_created_json,
      filesReadJson: r.files_read_json,
      securityFlagsJson: r.security_flags_json,
      createdAt: r.created_at
    }))
  })

  ipcMain.handle(IPC.CHECKPOINTS_GET, (_e, checkpointId: string) => {
    const row = getDb()
      .prepare('SELECT * FROM session_checkpoints WHERE id = ?')
      .get(checkpointId) as any
    if (!row) return null
    return {
      id: row.id,
      sessionId: row.session_id,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      toolsUsedJson: row.tools_used_json,
      filesCreatedJson: row.files_created_json,
      filesReadJson: row.files_read_json,
      securityFlagsJson: row.security_flags_json,
      createdAt: row.created_at
    }
  })
}

// ─── Security ─────────────────────────────────────────────────────────────────

function registerSecurityHandlers(): void {
  ipcMain.handle(IPC.SECURITY_SCORE, (_e, sessionId: string) => {
    const row = getDb()
      .prepare('SELECT * FROM security_scores WHERE session_id = ?')
      .get(sessionId) as any
    if (!row) return null
    return {
      id: row.id,
      sessionId: row.session_id,
      projectId: row.project_id,
      score: row.score,
      flagsJson: row.flags_json,
      dangerousToolCount: row.dangerous_tool_count,
      createdAt: row.created_at
    }
  })

  ipcMain.handle(IPC.SECURITY_PROJECT_SCORES, (_e, projectId: string, limit = 20) => {
    const rows = getDb()
      .prepare(
        `SELECT ss.*, s.task_id, t.title as task_title
         FROM security_scores ss
         JOIN sessions s ON s.id = ss.session_id
         JOIN tasks t ON t.id = s.task_id
         WHERE ss.project_id = ?
         ORDER BY ss.created_at DESC LIMIT ?`
      )
      .all(projectId, limit) as any[]
    return rows.map((r: any) => ({
      id: r.id,
      sessionId: r.session_id,
      projectId: r.project_id,
      score: r.score,
      flagsJson: r.flags_json,
      dangerousToolCount: r.dangerous_tool_count,
      createdAt: r.created_at,
      taskTitle: r.task_title
    }))
  })
}

// ─── Asana ────────────────────────────────────────────────────────────────────

function registerAsanaHandlers(): void {
  ipcMain.handle(IPC.ASANA_VERIFY, async () => {
    return asanaManager.verifyConnection()
  })

  ipcMain.handle(IPC.ASANA_SET_TOKEN, (_e, token: string) => {
    asanaManager.setToken(token)
  })

  ipcMain.handle(IPC.ASANA_GET_TOKEN, () => {
    return asanaManager.getToken() ? '••••••••' : null
  })

  ipcMain.handle(IPC.ASANA_WORKSPACES, async () => {
    return asanaManager.listWorkspaces()
  })

  ipcMain.handle(IPC.ASANA_PROJECTS, async (_e, workspaceGid: string) => {
    return asanaManager.listProjects(workspaceGid)
  })

  ipcMain.handle(IPC.ASANA_SECTIONS, async (_e, projectGid: string) => {
    return asanaManager.listSections(projectGid)
  })

  ipcMain.handle(IPC.ASANA_TASKS, async (_e, projectGid: string) => {
    return asanaManager.listTasks(projectGid)
  })

  ipcMain.handle(IPC.ASANA_TASK_DETAIL, async (_e, taskGid: string) => {
    return asanaManager.getTask(taskGid)
  })

  ipcMain.handle(IPC.ASANA_COMPLETE_TASK, async (_e, taskGid: string, comment?: string) => {
    if (comment) {
      await asanaManager.addComment(taskGid, comment)
    }
    await asanaManager.completeTask(taskGid)
  })

  ipcMain.handle(IPC.ASANA_ADD_COMMENT, async (_e, taskGid: string, text: string) => {
    await asanaManager.addComment(taskGid, text)
  })
}

// ─── App Settings ─────────────────────────────────────────────────────────────

function registerSettingsHandlers(): void {
  ipcMain.handle(IPC.SETTINGS_GET, (_e, key: string) => {
    const row = getDb()
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(key) as any
    if (!row) return null
    try {
      return JSON.parse(row.value)
    } catch {
      return row.value
    }
  })

  ipcMain.handle(IPC.SETTINGS_SET, (_e, key: string, value: any) => {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    getDb()
      .prepare(
        'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)'
      )
      .run(key, serialized)
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

  ipcMain.handle(IPC.SYSTEM_CLAUDE_CHECK, () => {
    return ClaudeManager.checkClaudeCli()
  })

  ipcMain.handle(IPC.SYSTEM_ACTIVE_SESSIONS, () => {
    return claudeManager.getActiveSessions()
  })
}
