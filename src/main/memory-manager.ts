import { v4 as uuidv4 } from 'uuid'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getDb } from './db'
import { Memory, MemoryType, MemoryCategory } from '../shared/types'
import { detectRoomForContent, classifyHall, getWingName } from './room-detector'

interface CreateMemoryOpts {
  type: MemoryType
  category?: MemoryCategory
  content: string
  source?: 'user_input' | 'claude_note' | 'inferred'
  taskId?: string
  wing?: string
  room?: string
  hall?: string
  importance?: number
  addedBy?: string
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
         ORDER BY importance DESC, relevance_score DESC, last_referenced DESC`
      )
      .all(projectId) as any[]

    return rows.map(rowToMemory)
  }

  create(projectId: string, opts: CreateMemoryOpts): Memory {
    // Auto-populate palace hierarchy if not provided
    let wing = opts.wing
    let room = opts.room
    let hall = opts.hall

    if (!wing) {
      const project = getDb()
        .prepare('SELECT name FROM projects WHERE id = ?')
        .get(projectId) as any
      wing = project ? getWingName(project.name) : undefined
    }

    if (!room) {
      room = detectRoomForContent(opts.content) || undefined
      if (room === 'general') room = undefined
    }

    if (!hall) {
      hall = classifyHall(opts.content) || undefined
    }

    // Duplicate detection: check for similar content in same wing+room
    if (wing) {
      const dup = this.checkDuplicate(projectId, opts.content, wing, room)
      if (dup.isDuplicate && dup.matchId) {
        // Boost existing memory instead of creating duplicate
        getDb()
          .prepare(
            `UPDATE memories SET
              importance = MIN(importance + 0.2, 3.0),
              relevance_score = MIN(relevance_score + 0.1, 2.0),
              last_referenced = datetime('now')
            WHERE id = ?`
          )
          .run(dup.matchId)
        return rowToMemory(
          getDb().prepare('SELECT * FROM memories WHERE id = ?').get(dup.matchId) as any
        )
      }
    }

    const id = uuidv4()
    getDb()
      .prepare(
        `INSERT INTO memories (id, project_id, type, category, content, source, task_id,
          wing, room, hall, importance, added_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        projectId,
        opts.type,
        opts.category ?? null,
        opts.content,
        opts.source ?? 'user_input',
        opts.taskId ?? null,
        wing ?? null,
        room ?? null,
        hall ?? null,
        opts.importance ?? 1.0,
        opts.addedBy ?? 'user'
      )

    return rowToMemory(
      getDb().prepare('SELECT * FROM memories WHERE id = ?').get(id) as any
    )
  }

  update(id: string, content: string): void {
    // Re-classify hall on content update
    const hall = classifyHall(content) || undefined
    getDb()
      .prepare(`UPDATE memories SET content = ?, hall = COALESCE(?, hall) WHERE id = ?`)
      .run(content, hall ?? null, id)
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

  /**
   * Search with palace filtering: wing + optional room/hall narrows results
   * (mempalace's +34% retrieval boost from metadata filtering)
   */
  searchPalace(
    projectId: string,
    query: string,
    opts?: { wing?: string; room?: string; hall?: string }
  ): Memory[] {
    let sql = `SELECT m.* FROM memories m
      JOIN memories_fts f ON f.rowid = m.rowid
      WHERE f.memories_fts MATCH ?
        AND m.project_id = ?
        AND m.deleted_at IS NULL`
    const params: any[] = [query, projectId]

    if (opts?.wing) {
      sql += ' AND m.wing = ?'
      params.push(opts.wing)
    }
    if (opts?.room) {
      sql += ' AND m.room = ?'
      params.push(opts.room)
    }
    if (opts?.hall) {
      sql += ' AND m.hall = ?'
      params.push(opts.hall)
    }

    sql += ' ORDER BY rank'

    const rows = getDb().prepare(sql).all(...params) as any[]
    return rows.map(rowToMemory)
  }

  // ─── 4-Layer Memory Stack (mempalace architecture) ─────────────────────

  /**
   * Generate palace context using the 4-layer memory stack.
   * L0: Identity (~50 tokens) — always loaded
   * L1: Essential Story (~120 tokens) — top memories by importance
   * L2: On-Demand (~200-500 tokens) — task-filtered by room
   * L3: Deep Search — FTS5 fallback
   */
  async generatePalaceContext(projectId: string, taskDescription: string): Promise<string> {
    const lines: string[] = []

    // L0: Identity (always loaded)
    const identity = getDb()
      .prepare('SELECT content FROM palace_identity WHERE project_id = ?')
      .get(projectId) as any
    if (identity?.content) {
      lines.push('# Identity', '', identity.content, '')
    }

    // L1: Essential Story — top 15 highest-importance memories grouped by room
    const topMemories = getDb()
      .prepare(
        `SELECT * FROM memories
         WHERE project_id = ? AND deleted_at IS NULL
         ORDER BY importance DESC, relevance_score DESC
         LIMIT 15`
      )
      .all(projectId) as any[]

    if (topMemories.length > 0) {
      lines.push('# Project Context', '')
      const byRoom: Record<string, any[]> = {}
      for (const m of topMemories) {
        const roomKey = m.room ?? 'general'
        if (!byRoom[roomKey]) byRoom[roomKey] = []
        byRoom[roomKey].push(m)
      }
      for (const [room, mems] of Object.entries(byRoom)) {
        lines.push(`## ${room}`)
        for (const m of mems) {
          const hallTag = m.hall ? ` [${m.hall.replace('hall_', '')}]` : ''
          lines.push(`- ${m.content}${hallTag}`)
        }
        lines.push('')
      }
    }

    // L2: On-Demand Retrieval — search by task-relevant room
    if (taskDescription.trim()) {
      const taskRoom = detectRoomForContent(taskDescription)
      let relevantMemories: any[] = []

      // First try room-filtered search
      if (taskRoom && taskRoom !== 'general') {
        relevantMemories = getDb()
          .prepare(
            `SELECT * FROM memories
             WHERE project_id = ? AND deleted_at IS NULL AND room = ?
             ORDER BY importance DESC, relevance_score DESC
             LIMIT 10`
          )
          .all(projectId, taskRoom) as any[]
      }

      // If room search got < 3 results, try FTS5
      if (relevantMemories.length < 3) {
        try {
          const ftsResults = this.search(projectId, taskDescription)
          // Merge without duplicates
          const existingIds = new Set([
            ...topMemories.map((m: any) => m.id),
            ...relevantMemories.map((m: any) => m.id)
          ])
          for (const m of ftsResults) {
            if (!existingIds.has(m.id)) {
              relevantMemories.push(m)
            }
          }
        } catch {
          // FTS query failure is OK
        }
      }

      // Filter out what's already in L1
      const l1Ids = new Set(topMemories.map((m: any) => m.id))
      const l2Memories = relevantMemories.filter((m: any) => !l1Ids.has(m.id)).slice(0, 10)

      if (l2Memories.length > 0) {
        lines.push('# Task-Relevant Context', '')
        for (const m of l2Memories) {
          const content = typeof m.content === 'string' ? m.content : m.content
          const roomTag = m.room ? ` [${m.room}]` : ''
          lines.push(`- ${content}${roomTag}`)
        }
        lines.push('')
      }
    }

    // Include global patterns from other projects (cross-wing tunnels)
    const globalPatterns = this.getGlobalPatterns()
    const existingIds = new Set(topMemories.map((m: any) => m.id))
    const uniqueGlobals = globalPatterns.filter((m) => !existingIds.has(m.id)).slice(0, 5)
    if (uniqueGlobals.length > 0) {
      lines.push('# Global Patterns', '')
      for (const m of uniqueGlobals) {
        lines.push(`- ${m.content}`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  // Keep the old method as a thin wrapper for backwards compat
  async generateContextBlock(projectId: string, taskDescription: string): Promise<string> {
    return this.generatePalaceContext(projectId, taskDescription)
  }

  // ─── Palace Identity (L0) ─────────────────────────────────────────────

  getIdentity(projectId: string): string {
    const row = getDb()
      .prepare('SELECT content FROM palace_identity WHERE project_id = ?')
      .get(projectId) as any
    return row?.content ?? ''
  }

  setIdentity(projectId: string, content: string): void {
    getDb()
      .prepare(
        `INSERT INTO palace_identity (project_id, content, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(project_id) DO UPDATE SET content = ?, updated_at = datetime('now')`
      )
      .run(projectId, content, content)
  }

  // ─── Enhanced Conversation Mining (replaces simple extractPatterns) ────

  /**
   * Mine Claude messages from a completed task.
   * Classifies each learning into a hall (facts/events/discoveries/preferences/advice).
   */
  captureFromTask(taskId: string): Memory[] {
    const messages = getDb()
      .prepare(
        `SELECT content FROM messages WHERE task_id = ? AND role = 'claude' ORDER BY timestamp`
      )
      .all(taskId) as { content: string }[]

    const task = getDb()
      .prepare('SELECT project_id, title FROM tasks WHERE id = ?')
      .get(taskId) as { project_id: string; title?: string } | undefined

    if (!task || messages.length === 0) return []

    const project = getDb()
      .prepare('SELECT name FROM projects WHERE id = ?')
      .get(task.project_id) as any
    const wing = project ? getWingName(project.name) : undefined
    const room = task.title ? detectRoomForContent(task.title) : undefined

    const extracted: Memory[] = []
    // Process ALL messages, not just last 3
    for (const msg of messages) {
      const learnings = extractHallClassifiedPatterns(msg.content)
      for (const learning of learnings) {
        try {
          const memory = this.create(task.project_id, {
            type: learning.type,
            content: learning.content,
            source: 'inferred',
            taskId,
            wing,
            room: room !== 'general' ? room : undefined,
            hall: learning.hall,
            importance: learning.importance,
            addedBy: 'session_mining'
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

    // Group by room then hall for palace-style output
    const byRoom: Record<string, Memory[]> = {}
    for (const m of memories) {
      const key = (m as any).room ?? 'general'
      if (!byRoom[key]) byRoom[key] = []
      byRoom[key].push(m)
    }

    const lines: string[] = ['# Project Memories (Palace)', '', '*Auto-generated by ClaudeKanBan*', '']

    for (const [room, mems] of Object.entries(byRoom)) {
      lines.push(`## ${room}`)
      for (const m of mems) {
        const hallTag = (m as any).hall ? ` [${(m as any).hall.replace('hall_', '')}]` : ''
        const typeTag = ` (${m.type})`
        lines.push(`- ${m.content}${hallTag}${typeTag}`)
      }
      lines.push('')
    }

    const claudeDir = join(project.path, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    writeFileSync(join(claudeDir, 'memories.md'), lines.join('\n'), 'utf-8')
  }

  // ─── Duplicate Detection ──────────────────────────────────────────────

  checkDuplicate(
    projectId: string,
    content: string,
    wing?: string,
    room?: string
  ): { isDuplicate: boolean; matchId?: string; similarity?: number } {
    let sql = `SELECT id, content FROM memories
      WHERE project_id = ? AND deleted_at IS NULL`
    const params: any[] = [projectId]

    if (wing) {
      sql += ' AND wing = ?'
      params.push(wing)
    }
    if (room) {
      sql += ' AND room = ?'
      params.push(room)
    }

    sql += ' ORDER BY created_at DESC LIMIT 50'

    const rows = getDb().prepare(sql).all(...params) as any[]
    for (const row of rows) {
      const sim = computeSimilarity(content, row.content)
      if (sim > 0.7) {
        return { isDuplicate: true, matchId: row.id, similarity: sim }
      }
    }
    return { isDuplicate: false }
  }

  // ─── Consolidation ────────────────────────────────────────────────────

  consolidate(projectId: string): { merged: number; removed: number } {
    const memories = this.list(projectId)
    let merged = 0
    let removed = 0

    const grouped = groupByType(memories)

    for (const [, items] of Object.entries(grouped)) {
      const toDelete: string[] = []

      for (let i = 0; i < items.length; i++) {
        if (toDelete.includes(items[i].id)) continue

        for (let j = i + 1; j < items.length; j++) {
          if (toDelete.includes(items[j].id)) continue

          const similarity = computeSimilarity(items[i].content, items[j].content)
          if (similarity > 0.7) {
            const keep = items[i].relevanceScore >= items[j].relevanceScore ? items[i] : items[j]
            const remove = keep === items[i] ? items[j] : items[i]

            getDb()
              .prepare(
                `UPDATE memories SET
                  importance = MIN(importance + 0.2, 3.0),
                  relevance_score = MIN(relevance_score + 0.2, 2.0)
                WHERE id = ?`
              )
              .run(keep.id)

            toDelete.push(remove.id)
            merged++
          }
        }
      }

      for (const id of toDelete) {
        this.delete(id)
        removed++
      }
    }

    return { merged, removed }
  }

  // ─── Relevance Decay ──────────────────────────────────────────────────

  decayRelevance(projectId: string): { decayed: number; pruned: number } {
    const decayResult = getDb()
      .prepare(
        `UPDATE memories
         SET relevance_score = relevance_score * 0.9
         WHERE project_id = ?
           AND deleted_at IS NULL
           AND last_referenced < datetime('now', '-30 days')`
      )
      .run(projectId)

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

  // ─── Cross-Project Patterns (Tunnels) ─────────────────────────────────

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

  // ─── Palace Statistics ────────────────────────────────────────────────

  palaceStats(projectId: string): {
    totalMemories: number
    byHall: Record<string, number>
    byRoom: Record<string, number>
    wing: string | null
  } {
    const total = (
      getDb()
        .prepare('SELECT COUNT(*) as c FROM memories WHERE project_id = ? AND deleted_at IS NULL')
        .get(projectId) as any
    ).c

    const hallRows = getDb()
      .prepare(
        `SELECT hall, COUNT(*) as c FROM memories
         WHERE project_id = ? AND deleted_at IS NULL AND hall IS NOT NULL
         GROUP BY hall`
      )
      .all(projectId) as any[]

    const roomRows = getDb()
      .prepare(
        `SELECT room, COUNT(*) as c FROM memories
         WHERE project_id = ? AND deleted_at IS NULL AND room IS NOT NULL
         GROUP BY room ORDER BY c DESC`
      )
      .all(projectId) as any[]

    const wingRow = getDb()
      .prepare(
        `SELECT wing FROM memories
         WHERE project_id = ? AND wing IS NOT NULL LIMIT 1`
      )
      .get(projectId) as any

    const byHall: Record<string, number> = {}
    for (const r of hallRows) byHall[r.hall] = r.c

    const byRoom: Record<string, number> = {}
    for (const r of roomRows) byRoom[r.room] = r.c

    return { totalMemories: total, byHall, byRoom, wing: wingRow?.wing ?? null }
  }

  // ─── Import/Export ────────────────────────────────────────────────────

  exportMemories(projectId: string): any[] {
    const memories = this.list(projectId)
    return memories.map((m) => ({
      type: m.type,
      category: m.category,
      content: m.content,
      source: m.source,
      relevanceScore: m.relevanceScore,
      wing: (m as any).wing,
      room: (m as any).room,
      hall: (m as any).hall,
      importance: (m as any).importance
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
          source: item.source ?? 'user_input',
          wing: item.wing,
          room: item.room,
          hall: item.hall,
          importance: item.importance
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
    lastReferenced: row.last_referenced,
    // Palace fields
    wing: row.wing,
    room: row.room,
    hall: row.hall,
    importance: row.importance,
    addedBy: row.added_by
  } as any
}

function groupByType(memories: Memory[]): Record<string, Memory[]> {
  const groups: Record<string, Memory[]> = {}
  for (const m of memories) {
    if (!groups[m.type]) groups[m.type] = []
    groups[m.type].push(m)
  }
  return groups
}

function computeSimilarity(a: string, b: string): number {
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

interface ClassifiedLearning {
  content: string
  type: MemoryType
  hall: string
  importance: number
}

/**
 * Extract learnings from Claude message content with hall classification.
 * Replaces the old simple extractPatterns approach.
 */
function extractHallClassifiedPatterns(content: string): ClassifiedLearning[] {
  const learnings: ClassifiedLearning[] = []
  const sentences = content.split(/[.!?]\s+/)

  const hallSignals: Record<string, { patterns: RegExp[]; type: MemoryType; importance: number }> = {
    hall_facts: {
      patterns: [
        /\b(?:decided|chose|went with|locked in|confirmed|switched to|migrated|using|adopted|implemented)\b/i
      ],
      type: 'pattern',
      importance: 1.5
    },
    hall_events: {
      patterns: [
        /\b(?:completed|finished|deployed|shipped|released|fixed|resolved|merged|started)\b/i
      ],
      type: 'task_learning',
      importance: 1.2
    },
    hall_discoveries: {
      patterns: [
        /\b(?:discovered|found that|turns out|realized|learned|root cause|issue was|problem was)\b/i
      ],
      type: 'task_learning',
      importance: 1.8
    },
    hall_preferences: {
      patterns: [
        /\b(?:prefer|always use|convention|pattern|standard|idiom|typically)\b/i
      ],
      type: 'pattern',
      importance: 1.3
    },
    hall_advice: {
      patterns: [
        /\b(?:recommend|should|best practice|make sure|never|always|avoid|important|remember)\b/i
      ],
      type: 'feedback',
      importance: 1.4
    }
  }

  for (const sentence of sentences) {
    const s = sentence.trim()
    if (s.length < 20 || s.length > 300) continue

    for (const [hall, config] of Object.entries(hallSignals)) {
      for (const pattern of config.patterns) {
        if (pattern.test(s)) {
          learnings.push({
            content: s,
            type: config.type,
            hall,
            importance: config.importance
          })
          break // Only classify into first matching hall
        }
      }
    }
  }

  // Deduplicate and cap
  const seen = new Set<string>()
  return learnings.filter((l) => {
    const key = l.content.toLowerCase().slice(0, 50)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 10) // Max 10 learnings per message set
}
