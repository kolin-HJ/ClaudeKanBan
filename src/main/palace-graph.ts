import { getDb } from './db'

export interface PalaceNode {
  room: string
  wings: string[]
  halls: string[]
  count: number
}

export interface PalaceTunnel {
  room: string
  wings: string[]
  count: number
}

export interface PalaceStats {
  totalRooms: number
  tunnelRooms: number
  totalMemories: number
  roomsPerWing: Record<string, number>
  topRooms: { room: string; count: number }[]
}

/**
 * Build a graph of rooms from memory metadata.
 * Rooms that appear in multiple wings form "tunnels" (cross-project connections).
 */
export function buildGraph(projectId?: string): {
  nodes: Record<string, PalaceNode>
  tunnels: PalaceTunnel[]
} {
  const query = projectId
    ? `SELECT wing, room, hall, COUNT(*) as cnt
       FROM memories
       WHERE deleted_at IS NULL AND room IS NOT NULL AND wing IS NOT NULL
         AND project_id = ?
       GROUP BY wing, room, hall`
    : `SELECT wing, room, hall, COUNT(*) as cnt
       FROM memories
       WHERE deleted_at IS NULL AND room IS NOT NULL AND wing IS NOT NULL
       GROUP BY wing, room, hall`

  const rows = projectId
    ? (getDb().prepare(query).all(projectId) as any[])
    : (getDb().prepare(query).all() as any[])

  const nodes: Record<string, PalaceNode> = {}

  for (const row of rows) {
    const key = row.room
    if (!nodes[key]) {
      nodes[key] = { room: key, wings: [], halls: [], count: 0 }
    }
    if (!nodes[key].wings.includes(row.wing)) {
      nodes[key].wings.push(row.wing)
    }
    if (row.hall && !nodes[key].halls.includes(row.hall)) {
      nodes[key].halls.push(row.hall)
    }
    nodes[key].count += row.cnt
  }

  // Tunnels: rooms that appear in multiple wings
  const tunnels: PalaceTunnel[] = Object.values(nodes)
    .filter((n) => n.wings.length > 1)
    .map((n) => ({ room: n.room, wings: n.wings, count: n.count }))

  return { nodes, tunnels }
}

/**
 * BFS traversal from a starting room, following connections through shared wings.
 */
export function traverse(
  startRoom: string,
  maxHops = 2,
  projectId?: string
): { room: string; wings: string[]; count: number; hop: number }[] {
  const { nodes } = buildGraph(projectId)
  const startNode = nodes[startRoom]
  if (!startNode) return []

  const visited = new Set<string>()
  const results: { room: string; wings: string[]; count: number; hop: number }[] = []
  const queue: { room: string; hop: number }[] = [{ room: startRoom, hop: 0 }]

  while (queue.length > 0) {
    const { room, hop } = queue.shift()!
    if (visited.has(room)) continue
    visited.add(room)

    const node = nodes[room]
    if (!node) continue

    results.push({ room: node.room, wings: node.wings, count: node.count, hop })

    if (hop < maxHops) {
      // Find connected rooms (rooms sharing a wing with current room)
      for (const wing of node.wings) {
        for (const [otherRoom, otherNode] of Object.entries(nodes)) {
          if (!visited.has(otherRoom) && otherNode.wings.includes(wing)) {
            queue.push({ room: otherRoom, hop: hop + 1 })
          }
        }
      }
    }
  }

  return results
}

/**
 * Find tunnel rooms connecting two wings (or all tunnels if no args).
 */
export function findTunnels(wingA?: string, wingB?: string): PalaceTunnel[] {
  const { tunnels } = buildGraph()

  if (!wingA && !wingB) return tunnels

  return tunnels.filter((t) => {
    if (wingA && wingB) {
      return t.wings.includes(wingA) && t.wings.includes(wingB)
    }
    if (wingA) return t.wings.includes(wingA)
    if (wingB) return t.wings.includes(wingB)
    return true
  })
}

/**
 * Get overall palace statistics.
 */
export function graphStats(projectId?: string): PalaceStats {
  const { nodes, tunnels } = buildGraph(projectId)

  const roomsPerWing: Record<string, number> = {}
  for (const node of Object.values(nodes)) {
    for (const wing of node.wings) {
      roomsPerWing[wing] = (roomsPerWing[wing] ?? 0) + 1
    }
  }

  const topRooms = Object.values(nodes)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((n) => ({ room: n.room, count: n.count }))

  const totalMemories = Object.values(nodes).reduce((sum, n) => sum + n.count, 0)

  return {
    totalRooms: Object.keys(nodes).length,
    tunnelRooms: tunnels.length,
    totalMemories,
    roomsPerWing,
    topRooms
  }
}
