import { v4 as uuidv4 } from 'uuid'
import { getDb } from './db'

export interface KgEntity {
  id: string
  name: string
  entityType: string
  properties?: Record<string, any>
  createdAt: string
}

export interface KgTriple {
  id: string
  subject: string
  predicate: string
  object: string
  validFrom: string
  validTo?: string
  confidence: number
  sourceMemoryId?: string
  sourceFile?: string
  extractedAt: string
  current: boolean
}

// Predicate patterns for auto-extraction from text
const PREDICATE_PATTERNS: { pattern: RegExp; predicate: string }[] = [
  { pattern: /\b(\w+)\s+uses?\s+(\w[\w\s]*?\w)\b/i, predicate: 'uses' },
  { pattern: /\b(\w+)\s+depends?\s+on\s+(\w[\w\s]*?\w)\b/i, predicate: 'depends_on' },
  { pattern: /\bswitched\s+from\s+(\w[\w\s]*?\w)\s+to\s+(\w[\w\s]*?\w)\b/i, predicate: 'migrated_from' },
  { pattern: /\bmigrated?\s+from\s+(\w[\w\s]*?\w)\s+to\s+(\w[\w\s]*?\w)\b/i, predicate: 'migrated_from' },
  { pattern: /\b(\w+)\s+replaced\s+(\w[\w\s]*?\w)\b/i, predicate: 'replaced' },
  { pattern: /\b(\w+)\s+is\s+built\s+with\s+(\w[\w\s]*?\w)\b/i, predicate: 'built_with' },
  { pattern: /\b(\w+)\s+requires?\s+(\w[\w\s]*?\w)\b/i, predicate: 'requires' },
  { pattern: /\b(\w+)\s+integrates?\s+with\s+(\w[\w\s]*?\w)\b/i, predicate: 'integrates_with' },
  { pattern: /\b(\w+)\s+connects?\s+to\s+(\w[\w\s]*?\w)\b/i, predicate: 'connects_to' },
  { pattern: /\b(\w+)\s+owns?\s+(\w[\w\s]*?\w)\b/i, predicate: 'owns' },
  { pattern: /\b(\w+)\s+(?:is\s+)?responsible\s+for\s+(\w[\w\s]*?\w)\b/i, predicate: 'responsible_for' },
  { pattern: /\b(\w+)\s+works?\s+on\s+(\w[\w\s]*?\w)\b/i, predicate: 'works_on' }
]

export class KnowledgeGraph {
  // ─── Entities ──────────────────────────────────────────────────────────

  addEntity(name: string, entityType: string, properties?: Record<string, any>): string {
    const existing = getDb()
      .prepare('SELECT id FROM kg_entities WHERE name = ? AND entity_type = ?')
      .get(name, entityType) as any

    if (existing) {
      if (properties) {
        getDb()
          .prepare('UPDATE kg_entities SET properties = ? WHERE id = ?')
          .run(JSON.stringify(properties), existing.id)
      }
      return existing.id
    }

    const id = uuidv4()
    getDb()
      .prepare('INSERT INTO kg_entities (id, name, entity_type, properties) VALUES (?, ?, ?, ?)')
      .run(id, name, entityType, properties ? JSON.stringify(properties) : null)
    return id
  }

  getEntity(name: string): KgEntity | null {
    const row = getDb()
      .prepare('SELECT * FROM kg_entities WHERE name = ? COLLATE NOCASE')
      .get(name) as any
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      entityType: row.entity_type,
      properties: row.properties ? JSON.parse(row.properties) : undefined,
      createdAt: row.created_at
    }
  }

  listEntities(type?: string): KgEntity[] {
    const query = type
      ? 'SELECT * FROM kg_entities WHERE entity_type = ? ORDER BY name'
      : 'SELECT * FROM kg_entities ORDER BY name'
    const rows = (type ? getDb().prepare(query).all(type) : getDb().prepare(query).all()) as any[]
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      entityType: r.entity_type,
      properties: r.properties ? JSON.parse(r.properties) : undefined,
      createdAt: r.created_at
    }))
  }

  // ─── Triples ───────────────────────────────────────────────────────────

  addTriple(
    subject: string,
    predicate: string,
    object: string,
    opts?: {
      validFrom?: string
      validTo?: string
      confidence?: number
      sourceMemoryId?: string
      sourceFile?: string
    }
  ): string {
    // Check for existing current triple with same SPO
    const existing = getDb()
      .prepare(
        `SELECT id FROM kg_triples
         WHERE subject = ? AND predicate = ? AND object = ? AND valid_to IS NULL`
      )
      .get(subject, predicate, object) as any

    if (existing) return existing.id

    const id = uuidv4()
    getDb()
      .prepare(
        `INSERT INTO kg_triples (id, subject, predicate, object, valid_from, valid_to,
          confidence, source_memory_id, source_file)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        subject,
        predicate,
        object,
        opts?.validFrom ?? new Date().toISOString(),
        opts?.validTo ?? null,
        opts?.confidence ?? 1.0,
        opts?.sourceMemoryId ?? null,
        opts?.sourceFile ?? null
      )
    return id
  }

  invalidate(subject: string, predicate: string, object: string, ended?: string): void {
    getDb()
      .prepare(
        `UPDATE kg_triples SET valid_to = ?
         WHERE subject = ? AND predicate = ? AND object = ? AND valid_to IS NULL`
      )
      .run(ended ?? new Date().toISOString(), subject, predicate, object)
  }

  queryEntity(
    name: string,
    opts?: { asOf?: string; direction?: 'outgoing' | 'incoming' | 'both' }
  ): KgTriple[] {
    const direction = opts?.direction ?? 'both'
    const asOf = opts?.asOf

    let rows: any[] = []

    if (direction === 'outgoing' || direction === 'both') {
      const query = asOf
        ? `SELECT *, 'outgoing' as direction FROM kg_triples
           WHERE subject = ? COLLATE NOCASE
             AND valid_from <= ?
             AND (valid_to IS NULL OR valid_to >= ?)
           ORDER BY valid_from DESC`
        : `SELECT *, 'outgoing' as direction FROM kg_triples
           WHERE subject = ? COLLATE NOCASE
           ORDER BY valid_from DESC`
      rows.push(
        ...(asOf
          ? (getDb().prepare(query).all(name, asOf, asOf) as any[])
          : (getDb().prepare(query).all(name) as any[]))
      )
    }

    if (direction === 'incoming' || direction === 'both') {
      const query = asOf
        ? `SELECT *, 'incoming' as direction FROM kg_triples
           WHERE object = ? COLLATE NOCASE
             AND valid_from <= ?
             AND (valid_to IS NULL OR valid_to >= ?)
           ORDER BY valid_from DESC`
        : `SELECT *, 'incoming' as direction FROM kg_triples
           WHERE object = ? COLLATE NOCASE
           ORDER BY valid_from DESC`
      rows.push(
        ...(asOf
          ? (getDb().prepare(query).all(name, asOf, asOf) as any[])
          : (getDb().prepare(query).all(name) as any[]))
      )
    }

    return rows.map(rowToTriple)
  }

  queryRelationship(predicate: string, asOf?: string): KgTriple[] {
    const query = asOf
      ? `SELECT * FROM kg_triples
         WHERE predicate = ?
           AND valid_from <= ?
           AND (valid_to IS NULL OR valid_to >= ?)
         ORDER BY valid_from DESC`
      : `SELECT * FROM kg_triples WHERE predicate = ? ORDER BY valid_from DESC`
    const rows = asOf
      ? (getDb().prepare(query).all(predicate, asOf, asOf) as any[])
      : (getDb().prepare(query).all(predicate) as any[])
    return rows.map(rowToTriple)
  }

  timeline(entityName: string, limit = 100): KgTriple[] {
    const rows = getDb()
      .prepare(
        `SELECT * FROM kg_triples
         WHERE subject = ? COLLATE NOCASE OR object = ? COLLATE NOCASE
         ORDER BY valid_from ASC
         LIMIT ?`
      )
      .all(entityName, entityName, limit) as any[]
    return rows.map(rowToTriple)
  }

  stats(): { entities: number; triples: number; currentFacts: number; expiredFacts: number; relationshipTypes: string[] } {
    const entities = (getDb().prepare('SELECT COUNT(*) as c FROM kg_entities').get() as any).c
    const triples = (getDb().prepare('SELECT COUNT(*) as c FROM kg_triples').get() as any).c
    const current = (
      getDb().prepare('SELECT COUNT(*) as c FROM kg_triples WHERE valid_to IS NULL').get() as any
    ).c
    const types = getDb()
      .prepare('SELECT DISTINCT predicate FROM kg_triples ORDER BY predicate')
      .all() as any[]

    return {
      entities,
      triples,
      currentFacts: current,
      expiredFacts: triples - current,
      relationshipTypes: types.map((t: any) => t.predicate)
    }
  }

  // ─── Auto-Extraction ───────────────────────────────────────────────────

  /**
   * Extract entities and relationships from text content.
   * Returns arrays of extracted entities and triples.
   */
  extractFromContent(
    content: string,
    sourceMemoryId?: string
  ): { entities: string[]; triples: { subject: string; predicate: string; object: string }[] } {
    const entities: string[] = []
    const triples: { subject: string; predicate: string; object: string }[] = []

    for (const { pattern, predicate } of PREDICATE_PATTERNS) {
      const matches = content.matchAll(new RegExp(pattern.source, 'gi'))
      for (const match of matches) {
        if (match[1] && match[2]) {
          const subject = match[1].trim()
          const object = match[2].trim()

          // Skip very short or common words
          if (subject.length < 2 || object.length < 2) continue
          if (/^(the|a|an|this|that|it|we|i|you|they)$/i.test(subject)) continue
          if (/^(the|a|an|this|that|it|we|i|you|they)$/i.test(object)) continue

          entities.push(subject, object)
          triples.push({ subject, predicate, object })
        }
      }
    }

    return { entities: [...new Set(entities)], triples }
  }

  /**
   * Process extracted triples: create entities and add triples to the graph.
   */
  processExtraction(
    extraction: { entities: string[]; triples: { subject: string; predicate: string; object: string }[] },
    sourceMemoryId?: string
  ): number {
    let added = 0

    for (const name of extraction.entities) {
      this.addEntity(name, 'concept') // Default type; could be refined
    }

    for (const triple of extraction.triples) {
      try {
        this.addTriple(triple.subject, triple.predicate, triple.object, { sourceMemoryId })
        added++
      } catch {
        // Skip duplicates
      }
    }

    return added
  }
}

function rowToTriple(row: any): KgTriple {
  return {
    id: row.id,
    subject: row.subject,
    predicate: row.predicate,
    object: row.object,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    confidence: row.confidence,
    sourceMemoryId: row.source_memory_id,
    sourceFile: row.source_file,
    extractedAt: row.extracted_at,
    current: !row.valid_to
  }
}
