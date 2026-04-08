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

    if (rows.length > 0) {
      const updateStmt = getDb().prepare(
        `UPDATE memories SET last_referenced = datetime('now') WHERE id = ?`
      )
      for (const row of rows) {
        updateStmt.run(row.id)
      }
    }

    return rows.map(rowToMemory)
  }

  async generateContextBlock(projectId: string, taskDescription: string): Promise<string> {
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

    // Also include global patterns from other projects
    const globalPatterns = this.getGlobalPatterns()
    const projectPatternIds = new Set(memories.map((m) => m.id))
    const uniqueGlobals = globalPatterns.filter((m) => !projectPatternIds.has(m.id)).slice(0, 5)

    if (memories.length === 0 && uniqueGlobals.length === 0) return ''

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

    if (uniqueGlobals.length > 0) {
      lines.push('## Global Patterns (from other projects)')
      for (const m of uniqueGlobals) {
        lines.push(`- ${m.content}`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  captureFromTask(taskId: string): Memory[] {
    const messages = getDb()
      .prepare(`SELECT content FROM messages WHERE task_id = ? AND role = 'claude' ORDER BY timestamp`)
      .all(taskId) as { content: string }[]

    const task = getDb()
      .prepare('SELECT project_id FROM tasks WHERE id = ?')
      .get(taskId) as { project_id: string } | undefined

    if (!task || messages.length === 0) return []

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

  // ─── Enhanced: Consolidation ──────────────────────────────────────────────

  consolidate(projectId: string): { merged: number; removed: number } {
    const memories = this.list(projectId)
    let merged = 0
    let removed = 0

    // Group by type to compare within the same type
    const grouped = groupByType(memories)

    for (const [, items] of Object.entries(grouped)) {
      const toDelete: string[] = []

      for (let i = 0; i < items.length; i++) {
        if (toDelete.includes(items[i].id)) continue

        for (let j = i + 1; j < items.length; j++) {
          if (toDelete.includes(items[j].id)) continue

          const similarity = computeSimilarity(items[i].content, items[j].content)
          if (similarity > 0.7) {
            // Keep the one with higher relevance score, merge content if needed
            const keep = items[i].relevanceScore >= items[j].relevanceScore ? items[i] : items[j]
            const remove = keep === items[i] ? items[j] : items[i]

            // Boost relevance of kept memory
            getDb()
              .prepare(
                `UPDATE memories SET relevance_score = MIN(relevance_score + 0.2, 2.0) WHERE id = ?`
              )
              .run(keep.id)

            toDelete.push(remove.id)
            merged++
          }
        }
      }

      // Soft-delete duplicates
      for (const id of toDelete) {
        this.delete(id)
        removed++
      }
    }

    return { merged, removed }
  }

  // ─── Enhanced: Decay ───────────────────────────────────────────────────────

  decayRelevance(projectId: string): { decayed: number; pruned: number } {
    // Reduce relevance for memories not referenced in 30+ days
    const decayResult = getDb()
      .prepare(
        `UPDATE memories
         SET relevance_score = relevance_score * 0.9
         WHERE project_id = ?
           AND deleted_at IS NULL
           AND last_referenced < datetime('now', '-30 days')`
      )
      .run(projectId)

    // Soft-delete memories with very low relevance
    const pruneResult = getDb()
      .prepare(
        `UPDATE memories
         SET deleted_at = datetime('now')
         WHERE project_id = ?
           AND deleted_at IS NULL
           AND relevance_score < 0.1`
      )
      .run(projectId)

    return {
      decayed: decayResult.changes,
      pruned: pruneResult.changes
    }
  }

  // ─── Enhanced: Cross-Project Patterns ──────────────────────────────────────

  getGlobalPatterns(): Memory[] {
    const rows = getDb()
      .prepare(
        `SELECT * FROM memories
         WHERE type IN ('pattern', 'convention')
           AND deleted_at IS NULL
           AND relevance_score >= 0.8
         ORDER BY relevance_score DESC
         LIMIT 20`
      )
      .all() as any[]

    return rows.map(rowToMemory)
  }

  // ─── Enhanced: Import/Export ────────────────────────────────────────────────

  exportMemories(projectId: string): any[] {
    const memories = this.list(projectId)
    return memories.map((m) => ({
      type: m.type,
      category: m.category,
      content: m.content,
      source: m.source,
      relevanceScore: m.relevanceScore
    }))
  }

  importMemories(projectId: string, data: any[]): number {
    let imported = 0
    for (const item of data) {
      try {
        this.create(projectId, {
          type: item.type ?? 'project_context',
          category: item.category,
          content: item.content,
          source: item.source ?? 'user_input'
        })
        imported++
      } catch {
        // skip invalid entries
      }
    }
    return imported
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

  const sentences = content.split(/[.!?]\s+/)
  for (const sentence of sentences) {
    const s = sentence.trim()
    if (s.length < 20 || s.length > 300) continue

    const signalWords = [
      'important', 'note:', 'remember', 'always', 'never', 'make sure',
      'convention', 'pattern', 'best practice', 'fixed', 'resolved',
      'issue was', 'problem was', 'solution was', 'works by',
      'key takeaway', 'learned that', 'discovered'
    ]

    const lower = s.toLowerCase()
    if (signalWords.some((w) => lower.includes(w))) {
      patterns.push(s)
    }
  }

  return patterns.slice(0, 3)
}

function computeSimilarity(a: string, b: string): number {
  // Simple Jaccard similarity on word sets
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 3))
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 3))

  if (wordsA.size === 0 || wordsB.size === 0) return 0

  let intersection = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++
  }

  const union = wordsA.size + wordsB.size - intersection
  return union > 0 ? intersection / union : 0
}
