import { spawn, ChildProcess, execSync } from 'child_process'
import { BrowserWindow } from 'electron'
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

interface SessionState {
  process: ChildProcess
  status: SessionStatus
  taskId: string
  projectId: string
  buffer: string
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
      const args = ['--output-format', 'stream-json', '--print']

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

      args.push(prompt)

      // Create session record in DB
      const sessionDbId = uuidv4()
      getDb()
        .prepare(
          `INSERT INTO sessions (id, task_id, project_id, status) VALUES (?, ?, ?, 'running')`
        )
        .run(sessionDbId, opts.taskId, opts.projectId)

      const env = { ...process.env, ...(opts.envOverrides ?? {}) }

      const proc = spawn('claude', args, {
        cwd: opts.projectPath,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env
      })

      const state: SessionState = {
        process: proc,
        status: 'spawning',
        taskId: opts.taskId,
        projectId: opts.projectId,
        buffer: '',
        sessionDbId,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        toolsUsed: [],
        filesCreated: [],
        filesRead: [],
        startedAt: Date.now()
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

        // Record file writes as outputs
        if (tool.name === 'Write' || tool.name === 'write_file') {
          const filePath = tool.input?.file_path ?? tool.input?.path
          if (filePath) {
            state.filesCreated.push(filePath)
            this.recordOutput(state.taskId, filePath)
          }
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

  private broadcast(channel: string, payload: any): void {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(channel, payload)
    })
  }
}
