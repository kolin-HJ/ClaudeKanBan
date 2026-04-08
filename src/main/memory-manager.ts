import { v4 as uuidv4 } from 'uuid'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getDb } from './db'
import { Memory, MemoryType, MemoryCategory } from '../shared/types'

interface CreateMemoryOpts {
  type: MemoryType
  category?: MemoryCategory
  content: string
  source?: 'user_input' | 'claude_note' | 'inferred'
  taskId?: string
}

export class MemoryManager {
  list(projectId: string, query?: string): Memory[] {
    if (query) {
      return this.search(projectId, query)
    }

    const rows = getDb()
      .prepare(
        `SELECT * FROM memories
         WHERE project_id = ? AND deleted_at IS NULL
         ORDER BY relevance_score DESC, last_referenced DESC`
      )
      .all(projectId) as any[]

    return rows.map(rowToMemory)
  }

  create(projectId: string, opts: CreateMemoryOpts): Memory {
    const id = uuidv4()
    getDb()
      .prepare(
        `INSERT INTO memories (id, project_id, type, category, content, source, task_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        projectId,
        opts.type,
        opts.category ?? null,
        opts.content,
        opts.source ?? 'user_input',
        opts.taskId ?? null
      )

    return rowToMemory(
      getDb().prepare('SELECT * FROM memories WHERE id = ?').get(id) as any
    )
  }

  update(id: string, content: string): void {
    getDb()
      .prepare(`UPDATE memories SET content = ? WHERE id = ?`)
      .run(content, id)
  }

  delete(id: string): void {
    getDb()
      .prepare(`UPDATE memories SET deleted_at = datetime('now') WHERE id = ?`)
      .run(id)
  }

  search(projectId: string, query: string): Memory[] {
    // Use FTS5 to find matching rowids, then join back to memories
    const rows = getDb()
      .prepare(
        `SELECT m.* FROM memories m
         JOIN memories_fts f ON f.rowid = m.rowid
         WHERE f.memories_fts MATCH ?
           AND m.project_id = ?
           AND m.deleted_at IS NULL
         ORDER BY rank`
      )
      .all(query, projectId) as any[]

    // Update last_referenced for returned memories
    if (rows.length > 0) {
      const ids = rows.map((r) => `'${r.id}'`).join(',')
      getDb()
        .prepare(`UPDATE memories SET last_referenced = datetime('now') WHERE id IN (${ids})`)
        .run()
    }

    return rows.map(rowToMemory)
  }

  async generateContextBlock(projectId: string, taskDescription: string): Promise<string> {
    // Get top relevant memories using FTS5 search on task description
    // Fall back to listing all if search returns nothing
    let memories: Memory[] = []

    if (taskDescription.trim()) {
      try {
        memories = this.search(projectId, taskDescription)
      } catch {
        // FTS query might fail on certain inputs; fall back gracefully
      }
    }

    if (memories.length === 0) {
      memories = this.list(projectId).slice(0, 20)
    }

    if (memories.length === 0) return ''

    const grouped = groupByType(memories)

    const lines: string[] = [
      '# Project Memory Context',
      '',
      '> The following memories are relevant to this task. Use them to inform your work.',
      ''
    ]

    for (const [type, items] of Object.entries(grouped)) {
      lines.push(`## ${formatTypeName(type as MemoryType)}`)
      for (const m of items) {
        const categoryTag = m.category ? ` [${m.category}]` : ''
        lines.push(`- ${m.content}${categoryTag}`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  captureFromTask(taskId: string): Memory[] {
    // Get all claude messages from this task and extract potential memories
    const messages = getDb()
      .prepare(`SELECT content FROM messages WHERE task_id = ? AND role = 'claude' ORDER BY timestamp`)
      .all(taskId) as { content: string }[]

    const task = getDb()
      .prepare('SELECT project_id FROM tasks WHERE id = ?')
      .get(taskId) as { project_id: string } | undefined

    if (!task || messages.length === 0) return []

    // Extract observations from the last few messages (heuristic approach)
    const recentMessages = messages.slice(-3)
    const extracted: Memory[] = []

    for (const msg of recentMessages) {
      const patterns = extractPatterns(msg.content)
      for (const pattern of patterns) {
        try {
          const memory = this.create(task.project_id, {
            type: 'task_learning',
            content: pattern,
            source: 'inferred',
            taskId
          })
          extracted.push(memory)
        } catch {
          // ignore duplicate or invalid entries
        }
      }
    }

    return extracted
  }

  writeMemoriesFile(projectId: string): void {
    const project = getDb()
      .prepare('SELECT path FROM projects WHERE id = ?')
      .get(projectId) as { path: string } | undefined

    if (!project) return

    const memories = this.list(projectId)
    if (memories.length === 0) return

    const grouped = groupByType(memories)
    const lines: string[] = ['# Project Memories', '', '*Auto-generated by ClaudeKanBan*', '']

    for (const [type, items] of Object.entries(grouped)) {
      lines.push(`## ${formatTypeName(type as MemoryType)}`)
      for (const m of items) {
        lines.push(`- ${m.content}`)
      }
      lines.push('')
    }

    const claudeDir = join(project.path, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    writeFileSync(join(claudeDir, 'memories.md'), lines.join('\n'), 'utf-8')
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToMemory(row: any): Memory {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    category: row.category,
    content: row.content,
    source: row.source,
    taskId: row.task_id,
    relevanceScore: row.relevance_score,
    createdAt: row.created_at,
    lastReferenced: row.last_referenced
  }
}

function groupByType(memories: Memory[]): Record<string, Memory[]> {
  const groups: Record<string, Memory[]> = {}
  for (const m of memories) {
    if (!groups[m.type]) groups[m.type] = []
    groups[m.type].push(m)
  }
  return groups
}

function formatTypeName(type: MemoryType): string {
  const names: Record<MemoryType, string> = {
    project_context: 'Project Context',
    task_learning: 'Task Learnings',
    feedback: 'Feedback & Preferences',
    pattern: 'Patterns & Conventions',
    blocker: 'Known Blockers'
  }
  return names[type] ?? type
}

function extractPatterns(content: string): string[] {
  const patterns: string[] = []

  // Look for sentences that signal learnings
  const sentences = content.split(/[.!?]\s+/)
  for (const sentence of sentences) {
    const s = sentence.trim()
    if (s.length < 20 || s.length > 300) continue

    const signalWords = [
      'important', 'note:', 'remember', 'always', 'never', 'make sure',
      'convention', 'pattern', 'best practice', 'fixed', 'resolved',
      'issue was', 'problem was', 'solution was', 'works by'
    ]

    const lower = s.toLowerCase()
    if (signalWords.some((w) => lower.includes(w))) {
      patterns.push(s)
    }
  }

  return patterns.slice(0, 3) // Cap at 3 per message
}
