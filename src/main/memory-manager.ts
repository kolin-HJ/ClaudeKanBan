import { v4 as uuidv4 } from 'uuid'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getDb } from './db'
import { Memory, MemoryType, MemoryCategory, MemoryLayer, MemoryLink, MemoryLinkRelationship } from '../shared/types'

interface CreateMemoryOpts {
  type: MemoryType
  category?: MemoryCategory
  room?: string
  layer?: MemoryLayer
  content: string
  verbatim?: string
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
         ORDER BY layer ASC, relevance_score DESC, last_referenced DESC`
      )
      .all(projectId) as any[]

    return rows.map(rowToMemory)
  }

  create(projectId: string, opts: CreateMemoryOpts): Memory {
    const id = uuidv4()
    const layer = opts.layer ?? inferLayer(opts.content)
    const room = opts.room ?? inferRoom(opts.content, opts.category)

    getDb()
      .prepare(
        `INSERT INTO memories (id, project_id, type, category, room, layer, content, verbatim, source, task_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        projectId,
        opts.type,
        opts.category ?? null,
        room ?? null,
        layer,
        opts.content,
        opts.verbatim ?? null,
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

  updateFull(id: string, opts: Partial<CreateMemoryOpts>): void {
    const sets: string[] = []
    const vals: any[] = []
    if (opts.content !== undefined) { sets.push('content = ?'); vals.push(opts.content) }
    if (opts.room !== undefined) { sets.push('room = ?'); vals.push(opts.room) }
    if (opts.layer !== undefined) { sets.push('layer = ?'); vals.push(opts.layer) }
    if (opts.category !== undefined) { sets.push('category = ?'); vals.push(opts.category) }
    if (opts.verbatim !== undefined) { sets.push('verbatim = ?'); vals.push(opts.verbatim) }
    if (sets.length === 0) return
    vals.push(id)
    getDb()
      .prepare(`UPDATE memories SET ${sets.join(', ')} WHERE id = ?`)
      .run(...vals)
  }

  delete(id: string): void {
    getDb()
      .prepare(`UPDATE memories SET deleted_at = datetime('now') WHERE id = ?`)
      .run(id)
  }

  search(projectId: string, query: string): Memory[] {
    // Sanitize query for FTS5: remove special chars that break the parser
    const safeQuery = query.replace(/['"*()]/g, ' ').trim()
    if (!safeQuery) return this.list(projectId)

    const rows = getDb()
      .prepare(
        `SELECT m.* FROM memories m
         JOIN memories_fts f ON f.rowid = m.rowid
         WHERE f.memories_fts MATCH ?
           AND m.project_id = ?
           AND m.deleted_at IS NULL
         ORDER BY rank`
      )
      .all(safeQuery, projectId) as any[]

    // Update last_referenced + reference_count for returned memories
    if (rows.length > 0) {
      const ids = rows.map((r) => `'${r.id}'`).join(',')
      getDb()
        .prepare(
          `UPDATE memories
           SET last_referenced = datetime('now'),
               reference_count = reference_count + 1
           WHERE id IN (${ids})`
        )
        .run()
    }

    return rows.map(rowToMemory)
  }

  // ─── Rooms ────────────────────────────────────────────────────────────────

  getRooms(projectId: string): { room: string; count: number }[] {
    const rows = getDb()
      .prepare(
        `SELECT room, COUNT(*) as count FROM memories
         WHERE project_id = ? AND deleted_at IS NULL AND room IS NOT NULL
         GROUP BY room ORDER BY count DESC`
      )
      .all(projectId) as any[]
    return rows.map((r) => ({ room: r.room as string, count: r.count as number }))
  }

  getByRoom(projectId: string, room: string): Memory[] {
    const rows = getDb()
      .prepare(
        `SELECT * FROM memories
         WHERE project_id = ? AND room = ? AND deleted_at IS NULL
         ORDER BY layer ASC, relevance_score DESC`
      )
      .all(projectId, room) as any[]
    return rows.map(rowToMemory)
  }

  // ─── Links (Tunnels) ──────────────────────────────────────────────────────

  getLinks(memoryId: string): (MemoryLink & { linkedMemory: Memory })[] {
    const rows = getDb()
      .prepare(
        `SELECT ml.*, m.* FROM memory_links ml
         JOIN memories m ON (
           CASE WHEN ml.source_id = ? THEN ml.target_id ELSE ml.source_id END = m.id
         )
         WHERE (ml.source_id = ? OR ml.target_id = ?)
           AND m.deleted_at IS NULL`
      )
      .all(memoryId, memoryId, memoryId) as any[]

    return rows.map((row) => ({
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      relationship: row.relationship,
      createdAt: row.created_at,
      linkedMemory: rowToMemory(row)
    }))
  }

  linkMemories(sourceId: string, targetId: string, relationship: MemoryLinkRelationship = 'related'): MemoryLink {
    const id = uuidv4()
    getDb()
      .prepare(
        `INSERT OR IGNORE INTO memory_links (id, source_id, target_id, relationship)
         VALUES (?, ?, ?, ?)`
      )
      .run(id, sourceId, targetId, relationship)
    return {
      id,
      sourceId,
      targetId,
      relationship,
      createdAt: new Date().toISOString()
    }
  }

  deleteLink(linkId: string): void {
    getDb().prepare('DELETE FROM memory_links WHERE id = ?').run(linkId)
  }

  // ─── 4-Layer Context Generation ───────────────────────────────────────────
  //
  // L0 Identity  (~50 tokens): Project identity — always injected
  // L1 Critical (~120 tokens): Hard rules, never-do constraints — always injected
  // L2 Context    (on-demand): Room-level context matched to task topic
  // L3 Archive    (on-demand): Task-specific learnings via deep FTS search

  async generateContextBlock(projectId: string, taskDescription: string): Promise<string> {
    // Always-active layers: L0 + L1
    const alwaysRows = getDb()
      .prepare(
        `SELECT * FROM memories
         WHERE project_id = ? AND layer IN (0, 1) AND deleted_at IS NULL
         ORDER BY layer ASC, relevance_score DESC`
      )
      .all(projectId) as any[]
    const always = alwaysRows.map(rowToMemory)

    if (always.length > 0) {
      const ids = always.map((m) => `'${m.id}'`).join(',')
      getDb()
        .prepare(
          `UPDATE memories
           SET last_referenced = datetime('now'),
               reference_count = reference_count + 1
           WHERE id IN (${ids})`
        )
        .run()
    }

    // On-demand layers: L2 + L3 via FTS on task description
    let contextual: Memory[] = []
    let deep: Memory[] = []

    if (taskDescription.trim()) {
      const safeQuery = taskDescription.replace(/['"*()]/g, ' ').trim()
      if (safeQuery) {
        try {
          const l2Rows = getDb()
            .prepare(
              `SELECT m.* FROM memories m
               JOIN memories_fts f ON f.rowid = m.rowid
               WHERE f.memories_fts MATCH ?
                 AND m.project_id = ?
                 AND m.layer = 2
                 AND m.deleted_at IS NULL
               ORDER BY rank
               LIMIT 10`
            )
            .all(safeQuery, projectId) as any[]
          contextual = l2Rows.map(rowToMemory)

          const l3Rows = getDb()
            .prepare(
              `SELECT m.* FROM memories m
               JOIN memories_fts f ON f.rowid = m.rowid
               WHERE f.memories_fts MATCH ?
                 AND m.project_id = ?
                 AND m.layer = 3
                 AND m.deleted_at IS NULL
               ORDER BY rank
               LIMIT 5`
            )
            .all(safeQuery, projectId) as any[]
          deep = l3Rows.map(rowToMemory)
        } catch {
          // FTS parse failure — fall back gracefully
        }
      }
    }

    // Fallback: if no on-demand results, pull top L2 by relevance
    if (contextual.length === 0 && deep.length === 0) {
      const fallbackRows = getDb()
        .prepare(
          `SELECT * FROM memories
           WHERE project_id = ? AND layer IN (2, 3) AND deleted_at IS NULL
           ORDER BY relevance_score DESC, last_referenced DESC
           LIMIT 10`
        )
        .all(projectId) as any[]
      contextual = fallbackRows.map(rowToMemory)
    }

    // Deduplicate against always-active set
    const alwaysIds = new Set(always.map((m) => m.id))
    contextual = contextual.filter((m) => !alwaysIds.has(m.id))
    deep = deep.filter((m) => !alwaysIds.has(m.id) && !contextual.some((c) => c.id === m.id))

    const allMemories = [...always, ...contextual, ...deep]
    if (allMemories.length === 0) return ''

    return buildContextBlock(always, contextual, deep)
  }

  // ─── Auto-capture from Claude session ────────────────────────────────────

  captureFromTask(taskId: string): Memory[] {
    const messages = getDb()
      .prepare(`SELECT content FROM messages WHERE task_id = ? AND role = 'claude' ORDER BY timestamp`)
      .all(taskId) as { content: string }[]

    const task = getDb()
      .prepare('SELECT project_id, title FROM tasks WHERE id = ?')
      .get(taskId) as { project_id: string; title: string } | undefined

    if (!task || messages.length === 0) return []

    const recentMessages = messages.slice(-5) // Expanded to 5 for better coverage
    const extracted: Memory[] = []
    const seenContent = new Set<string>()

    for (const msg of recentMessages) {
      const patterns = extractPatterns(msg.content)
      for (const { content, layer, room, verbatim } of patterns) {
        const normalized = content.toLowerCase().trim()
        if (seenContent.has(normalized)) continue
        seenContent.add(normalized)

        try {
          const memory = this.create(task.project_id, {
            type: layer <= 1 ? 'pattern' : 'task_learning',
            content,
            verbatim,
            room,
            layer,
            source: 'inferred',
            taskId
          })
          extracted.push(memory)
        } catch {
          // ignore
        }
      }
    }

    // Auto-link extracted memories to existing similar ones
    if (extracted.length > 0) {
      this.autoLinkMemories(task.project_id, extracted)
    }

    return extracted
  }

  private autoLinkMemories(projectId: string, newMemories: Memory[]): void {
    for (const mem of newMemories) {
      const safeQuery = mem.content.split(' ').slice(0, 5).join(' ').replace(/['"*()]/g, ' ').trim()
      if (!safeQuery) continue
      try {
        const similar = getDb()
          .prepare(
            `SELECT m.id FROM memories m
             JOIN memories_fts f ON f.rowid = m.rowid
             WHERE f.memories_fts MATCH ?
               AND m.project_id = ?
               AND m.id != ?
               AND m.deleted_at IS NULL
             ORDER BY rank
             LIMIT 3`
          )
          .all(safeQuery, projectId, mem.id) as { id: string }[]

        for (const s of similar) {
          try {
            this.linkMemories(mem.id, s.id, 'related')
          } catch {
            // duplicate link — ignore
          }
        }
      } catch {
        // FTS error — ignore
      }
    }
  }

  // ─── Export to file ───────────────────────────────────────────────────────

  export(projectId: string): void {
    const project = getDb()
      .prepare('SELECT path, name FROM projects WHERE id = ?')
      .get(projectId) as { path: string; name: string } | undefined

    if (!project) return

    const memories = this.list(projectId)
    if (memories.length === 0) return

    const lines: string[] = [
      `# Memory Palace — ${project.name}`,
      '',
      '*Auto-generated by ClaudeKanBan. Injected into Claude sessions automatically.*',
      ''
    ]

    // Group by layer
    const byLayer: Record<number, Memory[]> = { 0: [], 1: [], 2: [], 3: [] }
    for (const m of memories) {
      byLayer[m.layer].push(m)
    }

    const layerNames: Record<number, string> = {
      0: 'L0 — Identity (Always Active)',
      1: 'L1 — Critical (Always Active)',
      2: 'L2 — Context (On-Demand)',
      3: 'L3 — Archive (Deep Search)'
    }

    for (const layer of [0, 1, 2, 3] as MemoryLayer[]) {
      const items = byLayer[layer]
      if (items.length === 0) continue
      lines.push(`## ${layerNames[layer]}`)
      lines.push('')

      // Group by room within each layer
      const byRoom: Record<string, Memory[]> = {}
      for (const m of items) {
        const r = m.room ?? 'general'
        if (!byRoom[r]) byRoom[r] = []
        byRoom[r].push(m)
      }

      for (const [room, roomItems] of Object.entries(byRoom)) {
        if (Object.keys(byRoom).length > 1) {
          lines.push(`### ${room}`)
          lines.push('')
        }
        for (const m of roomItems) {
          const categoryTag = m.category ? ` [${m.category}]` : ''
          lines.push(`- ${m.content}${categoryTag}`)
        }
        lines.push('')
      }
    }

    const claudeDir = join(project.path, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    writeFileSync(join(claudeDir, 'memories.md'), lines.join('\n'), 'utf-8')
  }

  // Legacy alias
  writeMemoriesFile(projectId: string): void {
    this.export(projectId)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToMemory(row: any): Memory {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    category: row.category,
    room: row.room ?? undefined,
    layer: (row.layer ?? 2) as MemoryLayer,
    content: row.content,
    verbatim: row.verbatim ?? undefined,
    source: row.source,
    taskId: row.task_id,
    relevanceScore: row.relevance_score,
    referenceCount: row.reference_count ?? 0,
    createdAt: row.created_at,
    lastReferenced: row.last_referenced
  }
}

function buildContextBlock(
  always: Memory[],
  contextual: Memory[],
  deep: Memory[]
): string {
  const lines: string[] = [
    '# Project Memory Palace',
    '',
    '> Relevant context for this task. Treat these as authoritative facts about the project.',
    ''
  ]

  const l0 = always.filter((m) => m.layer === 0)
  const l1 = always.filter((m) => m.layer === 1)

  if (l0.length > 0) {
    lines.push('## Identity')
    for (const m of l0) lines.push(`- ${m.content}`)
    lines.push('')
  }

  if (l1.length > 0) {
    lines.push('## Critical Facts')
    for (const m of l1) lines.push(`- ${m.content}`)
    lines.push('')
  }

  if (contextual.length > 0) {
    lines.push('## Relevant Context')
    // Group by room for readability
    const byRoom: Record<string, Memory[]> = {}
    for (const m of contextual) {
      const r = m.room ?? 'general'
      if (!byRoom[r]) byRoom[r] = []
      byRoom[r].push(m)
    }
    for (const [, items] of Object.entries(byRoom)) {
      for (const m of items) {
        const tag = m.room ? ` [${m.room}]` : ''
        lines.push(`- ${m.content}${tag}`)
      }
    }
    lines.push('')
  }

  if (deep.length > 0) {
    lines.push('## Related Learnings')
    for (const m of deep) lines.push(`- ${m.content}`)
    lines.push('')
  }

  return lines.join('\n')
}

// Auto-detect room from content keywords
function inferRoom(content: string, category?: MemoryCategory): string | undefined {
  const lower = content.toLowerCase()

  if (/\b(auth|login|logout|password|token|jwt|session|oauth|permission|role)\b/.test(lower)) return 'auth'
  if (/\b(api|endpoint|route|request|response|rest|graphql|http|fetch|axios)\b/.test(lower)) return 'api'
  if (/\b(database|db|query|migration|schema|sql|orm|prisma|sqlite|postgres|mysql|mongo)\b/.test(lower)) return 'database'
  if (/\b(test|spec|jest|vitest|playwright|coverage|mock|fixture)\b/.test(lower)) return 'testing'
  if (/\b(deploy|ci|cd|docker|container|build|pipeline|github.action|workflow)\b/.test(lower)) return 'devops'
  if (/\b(component|react|vue|angular|ui|frontend|css|style|tailwind|html)\b/.test(lower)) return 'frontend'
  if (/\b(state|store|redux|zustand|context|hook|signal)\b/.test(lower)) return 'state'
  if (/\b(error|exception|crash|bug|fix|issue|debug|trace)\b/.test(lower)) return 'debugging'
  if (/\b(performance|speed|cache|optimize|memory|latency|throughput)\b/.test(lower)) return 'performance'
  if (/\b(file|fs|path|directory|upload|download|stream)\b/.test(lower)) return 'filesystem'

  if (category) {
    const map: Partial<Record<MemoryCategory, string>> = {
      architecture: 'architecture',
      convention: 'conventions',
      debugging: 'debugging',
      performance: 'performance',
      brand_voice: 'brand',
      workflow: 'workflow',
      dependency: 'dependencies'
    }
    return map[category]
  }

  return undefined
}

// Auto-assign layer based on signal words in content
function inferLayer(content: string): MemoryLayer {
  const lower = content.toLowerCase()

  // L0: foundational identity statements
  if (/\b(this (project|app|codebase) (is|uses|runs)|built with|written in|tech stack)\b/.test(lower)) return 0

  // L1: critical rules, always/never constraints
  const l1Signals = ['always ', 'never ', 'must ', 'do not ', "don't ", 'critical', 'required', 'forbidden', 'mandatory']
  if (l1Signals.some((s) => lower.includes(s))) return 1

  // L2: conventions, patterns, design decisions
  const l2Signals = ['convention', 'pattern', 'best practice', 'prefer', 'approach', 'design', 'should ', 'use ', 'when ']
  if (l2Signals.some((s) => lower.includes(s))) return 2

  // L3: task-specific learnings
  return 3
}

interface ExtractedPattern {
  content: string
  verbatim: string
  layer: MemoryLayer
  room: string | undefined
}

function extractPatterns(content: string): ExtractedPattern[] {
  const patterns: ExtractedPattern[] = []
  const sentences = content.split(/(?<=[.!?])\s+/)

  for (const sentence of sentences) {
    const s = sentence.trim()
    if (s.length < 20 || s.length > 400) continue

    const signalWords = [
      'important', 'note:', 'remember', 'always', 'never', 'make sure',
      'convention', 'pattern', 'best practice', 'fixed', 'resolved',
      'issue was', 'problem was', 'solution was', 'works by', 'should ',
      'do not', "don't", 'must ', 'critical', 'use '
    ]

    const lower = s.toLowerCase()
    if (!signalWords.some((w) => lower.includes(w))) continue

    // Remove markdown formatting for the stored content
    const cleaned = s.replace(/[#*`_~]/g, '').trim()
    if (!cleaned) continue

    patterns.push({
      content: cleaned,
      verbatim: s,
      layer: inferLayer(cleaned),
      room: inferRoom(cleaned)
    })
  }

  return patterns.slice(0, 5) // Cap at 5 per message
}
