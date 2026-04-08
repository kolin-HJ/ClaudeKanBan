import { v4 as uuidv4 } from 'uuid'
import { getDb } from './db'

export interface DiaryEntry {
  id: string
  sessionId?: string
  projectId: string
  agentName: string
  topic: string
  content: string
  createdAt: string
}

export class DiaryManager {
  write(opts: {
    sessionId?: string
    projectId: string
    agentName?: string
    topic?: string
    content: string
  }): string {
    const id = uuidv4()
    getDb()
      .prepare(
        `INSERT INTO agent_diary (id, session_id, project_id, agent_name, topic, content)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        opts.sessionId ?? null,
        opts.projectId,
        opts.agentName ?? 'claude',
        opts.topic ?? 'general',
        opts.content
      )
    return id
  }

  read(projectId: string, agentName?: string, lastN = 20): DiaryEntry[] {
    const query = agentName
      ? `SELECT * FROM agent_diary WHERE project_id = ? AND agent_name = ?
         ORDER BY created_at DESC LIMIT ?`
      : `SELECT * FROM agent_diary WHERE project_id = ?
         ORDER BY created_at DESC LIMIT ?`
    const rows = agentName
      ? (getDb().prepare(query).all(projectId, agentName, lastN) as any[])
      : (getDb().prepare(query).all(projectId, lastN) as any[])
    return rows.map(rowToDiary)
  }

  readByTopic(projectId: string, topic: string, lastN = 20): DiaryEntry[] {
    const rows = getDb()
      .prepare(
        `SELECT * FROM agent_diary WHERE project_id = ? AND topic = ?
         ORDER BY created_at DESC LIMIT ?`
      )
      .all(projectId, topic, lastN) as any[]
    return rows.map(rowToDiary)
  }

  /**
   * Generate an auto-journal entry summarizing a completed session.
   */
  writeSessionSummary(opts: {
    sessionId: string
    projectId: string
    taskTitle: string
    durationSecs: number
    inputTokens: number
    outputTokens: number
    costUsd: number
    toolsUsed: string[]
    filesCreated: string[]
    filesRead: string[]
    decisions: string[]
    problems: string[]
  }): string {
    const mins = Math.round(opts.durationSecs / 60)
    const totalTokens = opts.inputTokens + opts.outputTokens

    const lines: string[] = [
      `Session: ${opts.taskTitle}`,
      `Duration: ${mins}m | Tokens: ${totalTokens.toLocaleString()} | Cost: $${opts.costUsd.toFixed(4)}`
    ]

    if (opts.toolsUsed.length > 0) {
      lines.push(`Tools: ${opts.toolsUsed.join(', ')}`)
    }
    if (opts.filesCreated.length > 0) {
      lines.push(`Files created: ${opts.filesCreated.length}`)
    }
    if (opts.filesRead.length > 0) {
      lines.push(`Files read: ${opts.filesRead.length}`)
    }
    if (opts.decisions.length > 0) {
      lines.push(`Decisions: ${opts.decisions.join('; ')}`)
    }
    if (opts.problems.length > 0) {
      lines.push(`Problems: ${opts.problems.join('; ')}`)
    }

    return this.write({
      sessionId: opts.sessionId,
      projectId: opts.projectId,
      agentName: 'claude',
      topic: 'session_summary',
      content: lines.join('\n')
    })
  }
}

function rowToDiary(row: any): DiaryEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    projectId: row.project_id,
    agentName: row.agent_name,
    topic: row.topic,
    content: row.content,
    createdAt: row.created_at
  }
}
