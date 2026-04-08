import { spawn, ChildProcess, execSync } from 'child_process'
import { BrowserWindow, Notification } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from './db'
import { IPC, SessionStatus } from '../shared/types'

// Pricing per million tokens (Sonnet 4 defaults, configurable via settings)
const DEFAULT_PRICING = {
  inputPerMillion: 3.0,
  outputPerMillion: 15.0,
  cacheReadPerMillion: 0.3,
  cacheWritePerMillion: 3.75
}

// Security-sensitive tool patterns
const DANGEROUS_TOOLS = new Set(['Bash', 'bash'])
const SECRET_PATTERNS = [
  /(?:api[_-]?key|token|secret|password|credential|auth)[\s=:]+['"]\S{8,}/gi,
  /ghp_[A-Za-z0-9]{36}/g,
  /sk-[A-Za-z0-9]{32,}/g,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g,
  /AWS[A-Z0-9]{16,}/g
]

interface SessionState {
  process: ChildProcess
  status: SessionStatus
  taskId: string
  projectId: string
  buffer: string
  worktreePath?: string
  worktreeBranch?: string
  // Usage tracking
  sessionDbId: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  toolsUsed: string[]
  filesCreated: string[]
  filesRead: string[]
  startedAt: number
  // Security tracking
  securityFlags: string[]
  dangerousToolCount: number
  // Checkpointing
  checkpoints: { id: string; tokens: number; timestamp: number }[]
}

interface SpawnOptions {
  taskId: string
  projectPath: string
  projectId: string
  goal: string
  depth: string
  permission: string
  memoryContext?: string
  skillsContext?: string
  envOverrides?: Record<string, string>
  useWorktree?: boolean
}

// Callback type for generating insights after session finalization
type InsightCallback = (sessionId: string) => void

export class ClaudeManager {
  private sessions = new Map<string, SessionState>()
  private locks = new Set<string>()
  private maxConcurrentSessions = 10
  private shuttingDown = false
  private onSessionComplete: InsightCallback | null = null

  setInsightCallback(cb: InsightCallback): void {
    this.onSessionComplete = cb
  }

  async spawn(opts: SpawnOptions): Promise<void> {
    if (this.shuttingDown) {
      throw new Error('Application is shutting down')
    }

    if (this.locks.has(opts.taskId)) {
      throw new Error(`Operation in progress for task ${opts.taskId}`)
    }

    if (this.sessions.has(opts.taskId)) {
      throw new Error(`Session already running for task ${opts.taskId}`)
    }

    if (this.sessions.size >= this.maxConcurrentSessions) {
      throw new Error(`Max concurrent sessions (${this.maxConcurrentSessions}) reached`)
    }

    this.locks.add(opts.taskId)

    try {
      // Use interactive mode (NO --print) so the process stays alive for multi-turn conversations.
      // --print makes Claude process one prompt and exit, breaking follow-up messages.
      const args = ['--output-format', 'stream-json', '--verbose']

      if (opts.permission === 'full-auto') {
        args.push('--dangerously-skip-permissions')
      }

      // Build the initial prompt with optional memory and skills context
      let prompt = opts.goal
      if (opts.skillsContext) {
        prompt = `${opts.skillsContext}\n\n---\n\n${prompt}`
      }
      if (opts.memoryContext) {
        prompt = `${opts.memoryContext}\n\n---\n\n${prompt}`
      }

      // Add depth-specific instructions
      if (opts.depth === 'campaign') {
        prompt +=
          '\n\nThis is a multi-step campaign task. Please break it into clear phases and work through them systematically.'
      } else if (opts.depth === 'deep-build') {
        prompt +=
          '\n\nThis is a deep build task. Please start by creating a detailed plan with numbered phases, then execute each phase. Label each phase clearly in your responses.'
      }

      // Create session record in DB
      const sessionDbId = uuidv4()
      getDb()
        .prepare(
          `INSERT INTO sessions (id, task_id, project_id, status) VALUES (?, ?, ?, 'running')`
        )
        .run(sessionDbId, opts.taskId, opts.projectId)

      const env = { ...process.env, ...(opts.envOverrides ?? {}) }

      // Set up git worktree isolation if requested
      let workingDir = opts.projectPath
      let worktreePath: string | undefined
      let worktreeBranch: string | undefined

      if (opts.useWorktree) {
        try {
          worktreeBranch = `task/${opts.taskId.slice(0, 8)}`
          worktreePath = `${opts.projectPath}/.worktrees/${worktreeBranch}`
          execSync(`git worktree add "${worktreePath}" -b "${worktreeBranch}" 2>/dev/null || git worktree add "${worktreePath}" "${worktreeBranch}"`, {
            cwd: opts.projectPath,
            timeout: 10000
          })
          workingDir = worktreePath
        } catch {
          // Fall back to main project dir if worktree creation fails
          worktreePath = undefined
          worktreeBranch = undefined
        }
      }

      const proc = spawn('claude', args, {
        cwd: workingDir,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env
      })

      // Send the initial prompt via stdin (instead of as positional arg with --print)
      proc.stdin?.write(prompt + '\n')

      const state: SessionState = {
        process: proc,
        status: 'spawning',
        taskId: opts.taskId,
        projectId: opts.projectId,
        buffer: '',
        worktreePath,
        worktreeBranch,
        sessionDbId,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        toolsUsed: [],
        filesCreated: [],
        filesRead: [],
        startedAt: Date.now(),
        securityFlags: [],
        dangerousToolCount: 0,
        checkpoints: []
      }
      this.sessions.set(opts.taskId, state)

      this.broadcast(IPC.EVENT_SESSION_OUTPUT, {
        taskId: opts.taskId,
        type: 'status',
        status: 'spawning'
      })

      proc.stdout?.on('data', (chunk: Buffer) => {
        state.buffer += chunk.toString()
        // Buffer overflow protection: cap at 10MB
        if (state.buffer.length > 10 * 1024 * 1024) {
          state.buffer = state.buffer.slice(-1024 * 1024)
        }
        this.processBuffer(state)
      })

      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        this.broadcast(IPC.EVENT_SESSION_OUTPUT, {
          taskId: opts.taskId,
          type: 'stderr',
          text
        })
      })

      proc.on('exit', (code) => {
        const finalStatus = code === 0 ? 'completed' : 'error'
        state.status = finalStatus as SessionStatus
        this.finalizeSession(state, finalStatus)
        this.broadcast(IPC.EVENT_SESSION_OUTPUT, {
          taskId: opts.taskId,
          type: 'status',
          status: state.status
        })
        this.sessions.delete(opts.taskId)
        this.locks.delete(opts.taskId)
      })

      proc.on('error', (err) => {
        state.status = 'error'
        const errorMsg =
          err.message.includes('ENOENT')
            ? 'Claude CLI not found. Make sure "claude" is installed and in your PATH.'
            : err.message
        this.finalizeSession(state, 'error')
        this.broadcast(IPC.EVENT_SESSION_OUTPUT, {
          taskId: opts.taskId,
          type: 'error',
          text: errorMsg
        })
        this.sessions.delete(opts.taskId)
        this.locks.delete(opts.taskId)
      })
    } catch (err) {
      // Explicitly clean up lock if spawn setup fails before process events are wired
      this.locks.delete(opts.taskId)
      this.sessions.delete(opts.taskId)
      throw err
    }
  }

  private finalizeSession(state: SessionState, status: string): void {
    const durationSecs = Math.round((Date.now() - state.startedAt) / 1000)
    const cost = this.calculateCost(state)

    try {
      getDb()
        .prepare(
          `UPDATE sessions SET
            ended_at = datetime('now'),
            status = ?,
            input_tokens = ?,
            output_tokens = ?,
            cache_read_tokens = ?,
            cache_write_tokens = ?,
            total_cost_usd = ?,
            duration_secs = ?
          WHERE id = ?`
        )
        .run(
          status,
          state.inputTokens,
          state.outputTokens,
          state.cacheReadTokens,
          state.cacheWriteTokens,
          cost,
          durationSecs,
          state.sessionDbId
        )
    } catch {
      // DB write failure shouldn't crash the app
    }

    // Save final checkpoint
    this.saveCheckpoint(state)

    // Save security posture score
    this.saveSecurityScore(state)

    // Send OS notification
    this.sendNotification(state, status, cost, durationSecs)

    // Check for cost anomaly
    this.checkCostAnomaly(state, cost)

    // Broadcast final usage update
    this.broadcast(IPC.EVENT_USAGE_UPDATE, {
      taskId: state.taskId,
      sessionId: state.sessionDbId,
      inputTokens: state.inputTokens,
      outputTokens: state.outputTokens,
      cacheReadTokens: state.cacheReadTokens,
      cacheWriteTokens: state.cacheWriteTokens,
      estimatedCostUsd: cost,
      toolsUsed: state.toolsUsed,
      filesCreated: state.filesCreated,
      filesRead: state.filesRead,
      durationSecs,
      final: true
    })

    // Generate session insights (async, fire-and-forget)
    if (this.onSessionComplete) {
      try {
        this.onSessionComplete(state.sessionDbId)
      } catch {
        // Insight generation failure shouldn't crash the app
      }
    }
  }

  private calculateCost(state: SessionState): number {
    const p = DEFAULT_PRICING
    return (
      (state.inputTokens / 1_000_000) * p.inputPerMillion +
      (state.outputTokens / 1_000_000) * p.outputPerMillion +
      (state.cacheReadTokens / 1_000_000) * p.cacheReadPerMillion +
      (state.cacheWriteTokens / 1_000_000) * p.cacheWritePerMillion
    )
  }

  private processBuffer(state: SessionState): void {
    const lines = state.buffer.split('\n')
    state.buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line)
        this.handleStreamEvent(state, event)
      } catch {
        this.broadcast(IPC.EVENT_SESSION_OUTPUT, {
          taskId: state.taskId,
          type: 'text',
          text: line
        })
      }
    }
  }

  private handleStreamEvent(state: SessionState, event: any): void {
    if (event.type === 'system' && event.subtype === 'init') {
      state.status = 'running'
      this.broadcast(IPC.EVENT_SESSION_OUTPUT, {
        taskId: state.taskId,
        type: 'status',
        status: 'running'
      })
      return
    }

    if (event.type === 'assistant') {
      state.status = 'running'

      // Extract usage data from assistant messages
      const usage = event.message?.usage
      if (usage) {
        state.inputTokens += usage.input_tokens ?? 0
        state.outputTokens += usage.output_tokens ?? 0
        state.cacheReadTokens += usage.cache_read_input_tokens ?? usage.cache_read_tokens ?? 0
        state.cacheWriteTokens +=
          usage.cache_creation_input_tokens ?? usage.cache_write_tokens ?? 0

        // Broadcast live usage update
        this.broadcast(IPC.EVENT_USAGE_UPDATE, {
          taskId: state.taskId,
          sessionId: state.sessionDbId,
          inputTokens: state.inputTokens,
          outputTokens: state.outputTokens,
          cacheReadTokens: state.cacheReadTokens,
          cacheWriteTokens: state.cacheWriteTokens,
          estimatedCostUsd: this.calculateCost(state),
          toolsUsed: state.toolsUsed,
          filesCreated: state.filesCreated,
          filesRead: state.filesRead,
          startedAt: state.startedAt,
          final: false
        })
      }

      const content = this.extractTextContent(event.message?.content)
      if (content) {
        const msgId = uuidv4()
        getDb()
          .prepare('INSERT INTO messages (id, task_id, role, content) VALUES (?, ?, ?, ?)')
          .run(msgId, state.taskId, 'claude', content)

        getDb()
          .prepare(
            `UPDATE tasks SET status = 'your-turn', updated_at = datetime('now') WHERE id = ?`
          )
          .run(state.taskId)

        this.broadcast(IPC.EVENT_SESSION_OUTPUT, {
          taskId: state.taskId,
          type: 'message',
          role: 'claude',
          content,
          messageId: msgId
        })
        this.broadcast(IPC.EVENT_TASK_STATUS, { taskId: state.taskId, status: 'your-turn' })
      }

      // Track tool usage
      const toolUse = this.extractToolUse(event.message?.content)
      for (const tool of toolUse) {
        // Record in DB
        try {
          getDb()
            .prepare('INSERT INTO tool_usage (id, session_id, tool_name, input_json) VALUES (?, ?, ?, ?)')
            .run(uuidv4(), state.sessionDbId, tool.name, JSON.stringify(tool.input))
        } catch {
          // ignore
        }

        if (!state.toolsUsed.includes(tool.name)) {
          state.toolsUsed.push(tool.name)
        }

        this.broadcast(IPC.EVENT_SESSION_OUTPUT, {
          taskId: state.taskId,
          type: 'tool_use',
          toolName: tool.name,
          toolInput: tool.input
        })

        // Track context events (file reads, searches, etc.)
        this.trackContextEvent(state, tool)

        // Security: track dangerous tool usage
        if (DANGEROUS_TOOLS.has(tool.name)) {
          state.dangerousToolCount++
          const cmd = tool.input?.command ?? ''
          if (/rm\s+-rf|sudo|chmod\s+777|curl.*\|.*sh/i.test(cmd)) {
            state.securityFlags.push(`Dangerous bash: ${cmd.slice(0, 100)}`)
          }
        }

        // Security: scan tool inputs for secrets
        const inputStr = JSON.stringify(tool.input ?? '')
        for (const pattern of SECRET_PATTERNS) {
          if (pattern.test(inputStr)) {
            state.securityFlags.push(`Possible secret exposure in ${tool.name}`)
            pattern.lastIndex = 0 // Reset regex state
            break
          }
        }

        // Record file writes as outputs
        if (tool.name === 'Write' || tool.name === 'write_file') {
          const filePath = tool.input?.file_path ?? tool.input?.path
          if (filePath) {
            state.filesCreated.push(filePath)
            this.recordOutput(state.taskId, filePath)
          }
        }

        // Auto-checkpoint every 50k tokens
        const totalTokens = state.inputTokens + state.outputTokens
        const lastCheckpoint = state.checkpoints[state.checkpoints.length - 1]
        if (!lastCheckpoint || totalTokens - lastCheckpoint.tokens > 50000) {
          this.saveCheckpoint(state)
        }
      }
      return
    }

    if (event.type === 'user') {
      state.status = 'running'
      return
    }

    // Forward all raw events
    this.broadcast(IPC.EVENT_SESSION_OUTPUT, {
      taskId: state.taskId,
      type: 'raw',
      event
    })
  }

  private trackContextEvent(state: SessionState, tool: { name: string; input: any }): void {
    let eventType: string | null = null
    let target: string | null = null

    switch (tool.name) {
      case 'Read':
      case 'read_file':
        eventType = 'file_read'
        target = tool.input?.file_path ?? tool.input?.path
        if (target && !state.filesRead.includes(target)) {
          state.filesRead.push(target)
        }
        break
      case 'Grep':
      case 'grep':
      case 'search':
        eventType = 'search'
        target = tool.input?.pattern ?? tool.input?.query
        break
      case 'Glob':
      case 'glob':
        eventType = 'glob'
        target = tool.input?.pattern
        break
      case 'WebFetch':
      case 'web_fetch':
        eventType = 'web_fetch'
        target = tool.input?.url
        break
      case 'WebSearch':
      case 'web_search':
        eventType = 'web_search'
        target = tool.input?.query
        break
      case 'Bash':
      case 'bash':
        eventType = 'bash'
        target = tool.input?.command
        break
    }

    if (eventType) {
      try {
        getDb()
          .prepare(
            'INSERT INTO context_events (id, session_id, event_type, target) VALUES (?, ?, ?, ?)'
          )
          .run(uuidv4(), state.sessionDbId, eventType, target)
      } catch {
        // ignore
      }
    }
  }

  private extractTextContent(content: any): string {
    if (!content) return ''
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('')
    }
    return ''
  }

  private extractToolUse(content: any): { name: string; input: any }[] {
    if (!Array.isArray(content)) return []
    return content
      .filter((c: any) => c.type === 'tool_use')
      .map((c: any) => ({ name: c.name, input: c.input }))
  }

  private recordOutput(taskId: string, filePath: string): void {
    const { basename } = require('path')
    const { readFileSync, existsSync } = require('fs')

    const fileName = basename(filePath)
    let previewText: string | null = null

    try {
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8')
        previewText = content.slice(0, 500)
      }
    } catch {
      // ignore
    }

    const id = uuidv4()
    getDb()
      .prepare(
        'INSERT OR IGNORE INTO outputs (id, task_id, file_path, file_name, preview_text) VALUES (?, ?, ?, ?, ?)'
      )
      .run(id, taskId, filePath, fileName, previewText)

    this.broadcast(IPC.EVENT_OUTPUT_CREATED, { taskId, filePath, fileName })
  }

  hasSession(taskId: string): boolean {
    return this.sessions.has(taskId)
  }

  async send(taskId: string, message: string): Promise<void> {
    const state = this.sessions.get(taskId)
    if (!state) {
      throw new Error(`No active session for task ${taskId}`)
    }
    if (!state.process.stdin) {
      throw new Error('Session stdin not available')
    }
    if (!state.process.pid || state.process.killed) {
      throw new Error('Session process has exited')
    }
    state.process.stdin.write(message + '\n')
    state.status = 'running'
  }

  async spawnContinuation(taskId: string): Promise<void> {
    const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any
    if (!task) throw new Error('Task not found')
    const project = getDb()
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(task.project_id) as any
    if (!project) throw new Error('Project not found')

    // Load full conversation history (includes the new user message just saved)
    const rows = getDb()
      .prepare('SELECT * FROM messages WHERE task_id = ? ORDER BY timestamp ASC')
      .all(taskId) as any[]

    let goal = `Task: ${task.title}`
    if (task.description) goal += `\n\n${task.description}`

    if (rows.length > 0) {
      goal += `\n\nThis is a continuation of an existing conversation. Here is the conversation history:\n\n`
      for (const row of rows) {
        const speaker = row.role === 'user' ? 'Human' : row.role === 'claude' ? 'Assistant' : 'System'
        goal += `${speaker}: ${row.content}\n\n`
      }
      goal += `Please respond to the latest Human message above.`
    }

    await this.spawn({
      taskId,
      projectPath: project.path,
      goal,
      depth: task.depth,
      permission: task.permission
    })
  }

  terminate(taskId: string): void {
    const state = this.sessions.get(taskId)
    if (state) {
      try {
        state.process.kill('SIGTERM')
      } catch {
        // Process may have already exited
      }
      this.finalizeSession(state, 'terminated')
      this.sessions.delete(taskId)
      this.locks.delete(taskId)
    }
  }

  terminateAll(): void {
    this.shuttingDown = true
    for (const [taskId, state] of this.sessions) {
      try {
        state.process.kill('SIGTERM')
      } catch {
        // ignore
      }
      this.finalizeSession(state, 'terminated')
    }
    this.sessions.clear()
    this.locks.clear()
  }

  getStatus(taskId: string): SessionStatus {
    const state = this.sessions.get(taskId)
    if (!state) return 'completed'
    return state.status
  }

  healthCheck(taskId: string): boolean {
    const state = this.sessions.get(taskId)
    if (!state) return false
    try {
      // kill(0) checks if the process is still running without sending a signal
      state.process.kill(0)
      return true
    } catch {
      return false
    }
  }

  getActiveSessions(): { taskId: string; status: SessionStatus; sessionDbId: string }[] {
    return Array.from(this.sessions.entries()).map(([taskId, state]) => ({
      taskId,
      status: state.status,
      sessionDbId: state.sessionDbId
    }))
  }

  getLiveUsage(taskId: string): any | null {
    const state = this.sessions.get(taskId)
    if (!state) return null
    return {
      taskId: state.taskId,
      sessionId: state.sessionDbId,
      inputTokens: state.inputTokens,
      outputTokens: state.outputTokens,
      cacheReadTokens: state.cacheReadTokens,
      cacheWriteTokens: state.cacheWriteTokens,
      estimatedCostUsd: this.calculateCost(state),
      toolsUsed: state.toolsUsed,
      startedAt: state.startedAt
    }
  }

  getAllLiveUsage(): any[] {
    return Array.from(this.sessions.values()).map((state) => ({
      taskId: state.taskId,
      sessionId: state.sessionDbId,
      inputTokens: state.inputTokens,
      outputTokens: state.outputTokens,
      cacheReadTokens: state.cacheReadTokens,
      cacheWriteTokens: state.cacheWriteTokens,
      estimatedCostUsd: this.calculateCost(state),
      toolsUsed: state.toolsUsed,
      startedAt: state.startedAt
    }))
  }

  setMaxConcurrentSessions(max: number): void {
    this.maxConcurrentSessions = Math.max(1, Math.min(max, 50))
  }

  static checkClaudeCli(): { available: boolean; version?: string; error?: string } {
    try {
      const version = execSync('claude --version 2>/dev/null', { timeout: 5000 })
        .toString()
        .trim()
      return { available: true, version }
    } catch {
      return { available: false, error: 'Claude CLI not found in PATH' }
    }
  }

  // ─── Notifications ────────────────────────────────────────────────────────

  private sendNotification(
    state: SessionState,
    status: string,
    cost: number,
    durationSecs: number
  ): void {
    if (!Notification.isSupported()) return
    try {
      const title =
        status === 'completed'
          ? 'Session Complete'
          : status === 'error'
            ? 'Session Error'
            : 'Session Terminated'
      const mins = Math.round(durationSecs / 60)
      const tokens = state.inputTokens + state.outputTokens
      const body =
        status === 'completed'
          ? `Done in ${mins}m | ${tokens.toLocaleString()} tokens | $${cost.toFixed(4)}`
          : status === 'error'
            ? `Session failed after ${mins}m`
            : `Session stopped after ${mins}m`

      new Notification({ title, body, silent: false }).show()
    } catch {
      // Notification failures are non-critical
    }
  }

  // ─── Checkpointing ──────────────────────────────────────────────────────

  private saveCheckpoint(state: SessionState): void {
    const totalTokens = state.inputTokens + state.outputTokens
    const checkpointId = uuidv4()
    state.checkpoints.push({
      id: checkpointId,
      tokens: totalTokens,
      timestamp: Date.now()
    })

    try {
      getDb()
        .prepare(
          `INSERT INTO session_checkpoints (id, session_id, input_tokens, output_tokens,
            tools_used_json, files_created_json, files_read_json, security_flags_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          checkpointId,
          state.sessionDbId,
          state.inputTokens,
          state.outputTokens,
          JSON.stringify(state.toolsUsed),
          JSON.stringify(state.filesCreated),
          JSON.stringify(state.filesRead),
          JSON.stringify(state.securityFlags)
        )
    } catch {
      // ignore
    }
  }

  // ─── Security Posture ───────────────────────────────────────────────────

  private saveSecurityScore(state: SessionState): void {
    // Score 0-100: 100 = perfectly safe, lower = more concerning
    let score = 100

    // Penalize dangerous tool usage
    score -= Math.min(state.dangerousToolCount * 5, 30)

    // Penalize security flags
    score -= Math.min(state.securityFlags.length * 15, 50)

    // Penalize full-auto permission (it's riskier)
    // Check from the task
    try {
      const task = getDb()
        .prepare('SELECT permission FROM tasks WHERE id = ?')
        .get(state.taskId) as any
      if (task?.permission === 'full-auto') {
        score -= 10
      }
    } catch {
      // ignore
    }

    score = Math.max(0, score)

    try {
      getDb()
        .prepare(
          `INSERT INTO security_scores (id, session_id, project_id, score,
            flags_json, dangerous_tool_count)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          uuidv4(),
          state.sessionDbId,
          state.projectId,
          score,
          JSON.stringify(state.securityFlags),
          state.dangerousToolCount
        )
    } catch {
      // ignore
    }
  }

  // ─── Cost Anomaly Detection ─────────────────────────────────────────────

  private checkCostAnomaly(state: SessionState, cost: number): void {
    try {
      // Get average cost of recent sessions for this project
      const avg = getDb()
        .prepare(
          `SELECT AVG(total_cost_usd) as avg_cost
           FROM sessions
           WHERE project_id = ? AND status = 'completed'
             AND total_cost_usd > 0
             AND id != ?
           ORDER BY started_at DESC
           LIMIT 20`
        )
        .get(state.projectId, state.sessionDbId) as any

      if (!avg?.avg_cost || avg.avg_cost === 0) return

      const ratio = cost / avg.avg_cost
      if (ratio > 5.0) {
        // 5x above average = anomaly
        const msg = `Cost anomaly: $${cost.toFixed(4)} is ${ratio.toFixed(1)}x above average ($${avg.avg_cost.toFixed(4)})`
        this.broadcast(IPC.EVENT_SESSION_OUTPUT, {
          taskId: state.taskId,
          type: 'warning',
          text: msg
        })

        if (Notification.isSupported()) {
          try {
            new Notification({
              title: 'Cost Anomaly Detected',
              body: msg,
              silent: false
            }).show()
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private broadcast(channel: string, payload: any): void {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(channel, payload)
    })
  }
}
