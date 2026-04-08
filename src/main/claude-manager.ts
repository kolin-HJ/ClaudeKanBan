import { spawn, ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from './db'
import { IPC, SessionStatus } from '../shared/types'

interface SessionState {
  process: ChildProcess
  status: SessionStatus
  taskId: string
  buffer: string
}

interface SpawnOptions {
  taskId: string
  projectPath: string
  goal: string
  depth: string
  permission: string
  memoryContext?: string
}

export class ClaudeManager {
  private sessions = new Map<string, SessionState>()

  async spawn(opts: SpawnOptions): Promise<void> {
    if (this.sessions.has(opts.taskId)) {
      throw new Error(`Session already running for task ${opts.taskId}`)
    }

    const args = ['--output-format', 'stream-json', '--print']

    if (opts.permission === 'full-auto') {
      args.push('--dangerously-skip-permissions')
    }

    // Build the initial prompt with optional memory context
    let prompt = opts.goal
    if (opts.memoryContext) {
      prompt = `${opts.memoryContext}\n\n---\n\n${opts.goal}`
    }

    // Add depth-specific instructions
    if (opts.depth === 'campaign') {
      prompt += '\n\nThis is a multi-step campaign task. Please break it into clear phases and work through them systematically.'
    } else if (opts.depth === 'deep-build') {
      prompt += '\n\nThis is a deep build task. Please start by creating a detailed plan with numbered phases, then execute each phase. Label each phase clearly in your responses.'
    }

    args.push(prompt)

    const proc = spawn('claude', args, {
      cwd: opts.projectPath,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    const state: SessionState = {
      process: proc,
      status: 'spawning',
      taskId: opts.taskId,
      buffer: ''
    }
    this.sessions.set(opts.taskId, state)

    this.broadcast(IPC.EVENT_SESSION_OUTPUT, {
      taskId: opts.taskId,
      type: 'status',
      status: 'spawning'
    })

    proc.stdout?.on('data', (chunk: Buffer) => {
      state.buffer += chunk.toString()
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
      state.status = code === 0 ? 'completed' : 'error'
      this.broadcast(IPC.EVENT_SESSION_OUTPUT, {
        taskId: opts.taskId,
        type: 'status',
        status: state.status
      })
      this.sessions.delete(opts.taskId)
    })

    proc.on('error', (err) => {
      state.status = 'error'
      this.broadcast(IPC.EVENT_SESSION_OUTPUT, {
        taskId: opts.taskId,
        type: 'error',
        text: err.message
      })
      this.sessions.delete(opts.taskId)
    })
  }

  private processBuffer(state: SessionState): void {
    const lines = state.buffer.split('\n')
    state.buffer = lines.pop() ?? '' // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line)
        this.handleStreamEvent(state, event)
      } catch {
        // Not valid JSON — emit as raw text
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
      const content = this.extractTextContent(event.message?.content)
      if (content) {
        // Save to DB
        const msgId = uuidv4()
        getDb()
          .prepare('INSERT INTO messages (id, task_id, role, content) VALUES (?, ?, ?, ?)')
          .run(msgId, state.taskId, 'claude', content)

        // Update task status to "your-turn" when Claude responds
        getDb()
          .prepare(`UPDATE tasks SET status = 'your-turn', updated_at = datetime('now') WHERE id = ?`)
          .run(state.taskId)

        // Broadcast message + status change
        this.broadcast(IPC.EVENT_SESSION_OUTPUT, {
          taskId: state.taskId,
          type: 'message',
          role: 'claude',
          content,
          messageId: msgId
        })
        this.broadcast(IPC.EVENT_TASK_STATUS, { taskId: state.taskId, status: 'your-turn' })
      }

      // Check for tool use (file writes etc.)
      const toolUse = this.extractToolUse(event.message?.content)
      for (const tool of toolUse) {
        this.broadcast(IPC.EVENT_SESSION_OUTPUT, {
          taskId: state.taskId,
          type: 'tool_use',
          toolName: tool.name,
          toolInput: tool.input
        })

        // If it's a file write, record as an output
        if (tool.name === 'Write' || tool.name === 'write_file') {
          const filePath = tool.input?.file_path ?? tool.input?.path
          if (filePath) {
            this.recordOutput(state.taskId, filePath)
          }
        }
      }
      return
    }

    if (event.type === 'user') {
      // Echo of user input — update status to in-progress
      state.status = 'running'
      return
    }

    // Forward all raw events for UI consumption
    this.broadcast(IPC.EVENT_SESSION_OUTPUT, {
      taskId: state.taskId,
      type: 'raw',
      event
    })
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
    state.process.stdin.write(message + '\n')
    state.status = 'running'
  }

  terminate(taskId: string): void {
    const state = this.sessions.get(taskId)
    if (state) {
      state.process.kill('SIGTERM')
      this.sessions.delete(taskId)
    }
  }

  getStatus(taskId: string): SessionStatus {
    const state = this.sessions.get(taskId)
    if (!state) return 'completed'
    return state.status
  }

  private broadcast(channel: string, payload: any): void {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(channel, payload)
    })
  }
}
