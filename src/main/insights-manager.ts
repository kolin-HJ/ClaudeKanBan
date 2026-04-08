import { v4 as uuidv4 } from 'uuid'
import { getDb } from './db'
import { SessionInsight } from '../shared/types'
import { MemoryManager } from './memory-manager'
import { KnowledgeGraph } from './knowledge-graph'
import { DiaryManager } from './diary-manager'

export class InsightsManager {
  private memoryManager: MemoryManager
  private knowledgeGraph: KnowledgeGraph
  private diaryManager: DiaryManager

  constructor(memoryManager: MemoryManager, kg?: KnowledgeGraph, diary?: DiaryManager) {
    this.memoryManager = memoryManager
    this.knowledgeGraph = kg ?? new KnowledgeGraph()
    this.diaryManager = diary ?? new DiaryManager()
  }

  generateInsight(sessionId: string): SessionInsight | null {
    const session = getDb()
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(sessionId) as any
    if (!session) return null

    // Get tool usage breakdown
    const tools = getDb()
      .prepare(
        `SELECT tool_name, COUNT(*) as count FROM tool_usage
         WHERE session_id = ? GROUP BY tool_name ORDER BY count DESC`
      )
      .all(sessionId) as { tool_name: string; count: number }[]

    // Get context events
    const contextEvents = getDb()
      .prepare('SELECT * FROM context_events WHERE session_id = ? ORDER BY timestamp')
      .all(sessionId) as any[]

    const filesRead = contextEvents
      .filter((e: any) => e.event_type === 'file_read' && e.target)
      .map((e: any) => e.target)

    // Get file outputs
    const outputs = getDb()
      .prepare('SELECT file_path FROM outputs WHERE task_id = ?')
      .all(session.task_id) as { file_path: string }[]
    const filesCreated = outputs.map((o) => o.file_path)

    // Extract learnings from messages
    const learnings = this.extractLearnings(session.task_id)

    // Generate summary
    const summary = this.generateSummary(session, tools, filesRead, filesCreated, learnings)

    const id = uuidv4()
    const toolsJson = JSON.stringify(tools.map((t) => ({ name: t.tool_name, count: t.count })))
    const filesReadJson = JSON.stringify([...new Set(filesRead)])
    const filesCreatedJson = JSON.stringify([...new Set(filesCreated)])
    const learningsJson = JSON.stringify(learnings)

    getDb()
      .prepare(
        `INSERT INTO session_insights
         (id, session_id, project_id, task_id, token_input, token_output,
          cost_usd, duration_secs, tools_json, files_read_json,
          files_created_json, learnings_json, summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        sessionId,
        session.project_id,
        session.task_id,
        session.input_tokens,
        session.output_tokens,
        session.total_cost_usd,
        session.duration_secs,
        toolsJson,
        filesReadJson,
        filesCreatedJson,
        learningsJson,
        summary
      )

    // Auto-capture learnings into palace memory system (with hall classification)
    // This uses the enhanced captureFromTask which classifies into halls
    try {
      this.memoryManager.captureFromTask(session.task_id)
    } catch {
      // fallback: create simple learnings
      for (const learning of learnings) {
        try {
          this.memoryManager.create(session.project_id, {
            type: 'task_learning',
            content: learning,
            source: 'inferred',
            taskId: session.task_id
          })
        } catch {
          // ignore
        }
      }
    }

    // Auto-extract knowledge graph triples from Claude messages
    try {
      const messages = getDb()
        .prepare(
          `SELECT content FROM messages WHERE task_id = ? AND role = 'claude' ORDER BY timestamp`
        )
        .all(session.task_id) as { content: string }[]
      for (const msg of messages.slice(-5)) {
        const extraction = this.knowledgeGraph.extractFromContent(msg.content)
        this.knowledgeGraph.processExtraction(extraction)
      }
    } catch {
      // KG extraction failure is non-critical
    }

    // Write agent diary entry summarizing the session
    try {
      const task = getDb()
        .prepare('SELECT title FROM tasks WHERE id = ?')
        .get(session.task_id) as any
      this.diaryManager.writeSessionSummary({
        sessionId,
        projectId: session.project_id,
        taskTitle: task?.title ?? 'Unknown task',
        durationSecs: session.duration_secs,
        inputTokens: session.input_tokens,
        outputTokens: session.output_tokens,
        costUsd: session.total_cost_usd,
        toolsUsed: tools.map((t: any) => t.tool_name),
        filesCreated: filesCreated,
        filesRead: filesRead,
        decisions: learnings.filter((l: string) =>
          /\b(?:decided|chose|went with|switched|using)\b/i.test(l)
        ),
        problems: learnings.filter((l: string) =>
          /\b(?:issue|problem|bug|error|failed|broken)\b/i.test(l)
        )
      })
    } catch {
      // Diary failure is non-critical
    }

    // Sync memories file
    try {
      this.memoryManager.writeMemoriesFile(session.project_id)
    } catch {
      // ignore
    }

    return this.rowToInsight(
      getDb().prepare('SELECT * FROM session_insights WHERE id = ?').get(id) as any
    )
  }

  list(projectId: string, limit = 50): SessionInsight[] {
    const rows = getDb()
      .prepare(
        `SELECT si.*, t.title as task_title FROM session_insights si
         JOIN tasks t ON t.id = si.task_id
         WHERE si.project_id = ?
         ORDER BY si.created_at DESC LIMIT ?`
      )
      .all(projectId, limit) as any[]
    return rows.map((r: any) => ({ ...this.rowToInsight(r), taskTitle: r.task_title }))
  }

  get(id: string): SessionInsight | null {
    const row = getDb().prepare('SELECT * FROM session_insights WHERE id = ?').get(id) as any
    if (!row) return null
    return this.rowToInsight(row)
  }

  promoteLearning(projectId: string, learning: string): void {
    this.memoryManager.create(projectId, {
      type: 'task_learning',
      content: learning,
      source: 'user_input'
    })
  }

  private extractLearnings(taskId: string): string[] {
    const messages = getDb()
      .prepare(
        `SELECT content FROM messages WHERE task_id = ? AND role = 'claude' ORDER BY timestamp`
      )
      .all(taskId) as { content: string }[]

    if (messages.length === 0) return []

    const learnings: string[] = []
    const recentMessages = messages.slice(-3)

    for (const msg of recentMessages) {
      const sentences = msg.content.split(/[.!?]\s+/)
      for (const sentence of sentences) {
        const s = sentence.trim()
        if (s.length < 20 || s.length > 300) continue

        const signalWords = [
          'important',
          'note:',
          'remember',
          'always',
          'never',
          'make sure',
          'convention',
          'pattern',
          'best practice',
          'fixed',
          'resolved',
          'issue was',
          'problem was',
          'solution was',
          'works by',
          'key takeaway',
          'learned that',
          'discovered'
        ]

        const lower = s.toLowerCase()
        if (signalWords.some((w) => lower.includes(w))) {
          learnings.push(s)
        }
      }
    }

    return learnings.slice(0, 5)
  }

  private generateSummary(
    session: any,
    tools: { tool_name: string; count: number }[],
    filesRead: string[],
    filesCreated: string[],
    learnings: string[]
  ): string {
    const parts: string[] = []
    const mins = Math.round(session.duration_secs / 60)
    const totalTokens = session.input_tokens + session.output_tokens

    parts.push(
      `Session ran for ${mins}m using ${totalTokens.toLocaleString()} tokens ($${session.total_cost_usd.toFixed(4)}).`
    )

    if (tools.length > 0) {
      const topTools = tools.slice(0, 3).map((t) => `${t.tool_name}(${t.count})`)
      parts.push(`Tools: ${topTools.join(', ')}.`)
    }

    const uniqueReads = [...new Set(filesRead)]
    if (uniqueReads.length > 0) {
      parts.push(`Read ${uniqueReads.length} file(s).`)
    }

    if (filesCreated.length > 0) {
      parts.push(`Created/modified ${filesCreated.length} file(s).`)
    }

    if (learnings.length > 0) {
      parts.push(`${learnings.length} learning(s) extracted.`)
    }

    return parts.join(' ')
  }

  private rowToInsight(row: any): SessionInsight {
    return {
      id: row.id,
      sessionId: row.session_id,
      projectId: row.project_id,
      taskId: row.task_id,
      tokenInput: row.token_input,
      tokenOutput: row.token_output,
      costUsd: row.cost_usd,
      durationSecs: row.duration_secs,
      toolsJson: row.tools_json,
      filesReadJson: row.files_read_json,
      filesCreatedJson: row.files_created_json,
      learningsJson: row.learnings_json,
      summary: row.summary,
      createdAt: row.created_at
    }
  }
}
