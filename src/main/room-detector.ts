import { readdirSync, statSync } from 'fs'
import { join, basename } from 'path'

// 70+ folder-to-room patterns ported from mempalace's room_detector_local.py
const ROOM_PATTERNS: Record<string, string[]> = {
  frontend: ['frontend', 'client', 'ui', 'web', 'webapp', 'app', 'pages', 'views', 'components', 'layouts', 'templates', 'widgets', 'screens'],
  backend: ['backend', 'server', 'api', 'routes', 'controllers', 'handlers', 'endpoints', 'services', 'middleware'],
  database: ['db', 'database', 'migrations', 'models', 'schema', 'prisma', 'drizzle', 'sequelize', 'typeorm', 'knex', 'seeds', 'fixtures'],
  auth: ['auth', 'authentication', 'authorization', 'login', 'oauth', 'session', 'security', 'permissions', 'rbac'],
  testing: ['tests', 'test', 'spec', '__tests__', 'e2e', 'cypress', 'jest', 'vitest', 'playwright', 'integration', 'unit'],
  devops: ['.github', 'ci', 'cd', 'docker', 'k8s', 'kubernetes', 'terraform', 'deploy', 'deployment', 'infrastructure', 'infra', 'ansible', 'helm'],
  documentation: ['docs', 'documentation', 'wiki', 'guides', 'tutorials', 'manuals'],
  config: ['config', 'configuration', 'settings', 'env', 'environments'],
  scripts: ['scripts', 'tools', 'bin', 'utils', 'utilities', 'helpers', 'lib', 'shared'],
  assets: ['assets', 'static', 'public', 'images', 'media', 'fonts', 'icons', 'styles', 'css', 'sass', 'less'],
  mobile: ['mobile', 'ios', 'android', 'react-native', 'flutter', 'capacitor', 'cordova'],
  packages: ['packages', 'modules', 'plugins', 'extensions', 'addons'],
  types: ['types', 'typings', 'interfaces', '@types', 'defs', 'declarations'],
  state: ['store', 'stores', 'state', 'redux', 'zustand', 'context', 'atoms'],
  hooks: ['hooks', 'composables', 'custom-hooks'],
  workers: ['workers', 'jobs', 'queues', 'cron', 'tasks', 'background'],
  monitoring: ['monitoring', 'logging', 'metrics', 'telemetry', 'observability', 'alerts'],
  email: ['email', 'emails', 'mailers', 'templates', 'notifications'],
  payments: ['payments', 'billing', 'stripe', 'checkout', 'subscriptions', 'pricing'],
  analytics: ['analytics', 'tracking', 'events', 'metrics', 'reporting', 'dashboards'],
  i18n: ['i18n', 'locales', 'translations', 'lang', 'languages', 'intl'],
  cache: ['cache', 'caching', 'redis', 'memcached'],
  search: ['search', 'elasticsearch', 'algolia', 'meilisearch', 'indexing'],
  realtime: ['realtime', 'websocket', 'ws', 'socket', 'sse', 'pubsub'],
  graphql: ['graphql', 'gql', 'resolvers', 'schema', 'mutations', 'queries', 'subscriptions'],
  design: ['design', 'figma', 'sketch', 'mockups', 'wireframes', 'prototypes'],
  vendor: ['vendor', 'third-party', 'external', 'dependencies']
}

// Content-based room signals (for when we don't have file paths)
const CONTENT_ROOM_SIGNALS: Record<string, string[]> = {
  frontend: ['react', 'component', 'jsx', 'tsx', 'css', 'tailwind', 'html', 'dom', 'render', 'viewport'],
  backend: ['endpoint', 'route', 'middleware', 'request', 'response', 'controller', 'handler', 'express', 'fastify'],
  database: ['query', 'migration', 'schema', 'table', 'column', 'index', 'foreign key', 'join', 'sql', 'orm'],
  auth: ['login', 'token', 'jwt', 'oauth', 'session', 'password', 'credential', 'permission', 'rbac'],
  testing: ['test', 'spec', 'assert', 'expect', 'mock', 'stub', 'fixture', 'coverage'],
  devops: ['docker', 'ci/cd', 'pipeline', 'deploy', 'kubernetes', 'terraform', 'github actions'],
  config: ['environment', 'config', 'settings', '.env', 'secrets'],
  general: [] // fallback
}

// Hall classification signals (from mempalace's general_extractor.py)
const HALL_SIGNALS: Record<string, RegExp[]> = {
  hall_facts: [
    /\b(?:decided|chose|went with|locked in|confirmed|agreed|selected|picked)\b/i,
    /\b(?:switched to|migrated to|replaced|upgraded|downgraded)\b/i,
    /\b(?:using|adopted|implemented|established|set up)\b/i,
    /\b(?:the (?:decision|choice|approach|solution|answer) (?:is|was))\b/i
  ],
  hall_events: [
    /\b(?:completed|finished|deployed|shipped|released|launched|merged)\b/i,
    /\b(?:fixed|resolved|closed|patched|hotfix)\b/i,
    /\b(?:milestone|session|sprint|version|release)\b/i,
    /\b(?:started|began|kicked off|initiated)\b/i
  ],
  hall_discoveries: [
    /\b(?:discovered|found that|turns out|realized|learned|noticed)\b/i,
    /\b(?:interesting|surprising|unexpected|insight|breakthrough)\b/i,
    /\b(?:root cause|the issue was|the problem was|it works by)\b/i
  ],
  hall_preferences: [
    /\b(?:prefer|always use|convention|style|approach)\b/i,
    /\b(?:pattern|standard|idiom|habit|practice)\b/i,
    /\b(?:like to|tend to|usually|typically)\b/i
  ],
  hall_advice: [
    /\b(?:recommend|should|best practice|make sure|tip)\b/i,
    /\b(?:never|always|avoid|watch out|careful|be sure to)\b/i,
    /\b(?:important|remember|note:|warning|caution)\b/i
  ]
}

const SKIP_DIRS = new Set([
  '.git', 'node_modules', '.venv', 'venv', '__pycache__', '.cache',
  'dist', 'build', 'out', '.next', '.nuxt', '.output', 'target',
  'coverage', '.nyc_output', '.turbo', '.parcel-cache', '.worktrees'
])

/**
 * Detect rooms by scanning a project's directory structure.
 * Returns array of detected room names.
 */
export function detectRooms(projectPath: string): string[] {
  const rooms = new Set<string>()

  try {
    const entries = readdirSync(projectPath)
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue
      try {
        const fullPath = join(projectPath, entry)
        if (!statSync(fullPath).isDirectory()) continue

        const lowerEntry = entry.toLowerCase()
        for (const [room, patterns] of Object.entries(ROOM_PATTERNS)) {
          if (patterns.includes(lowerEntry)) {
            rooms.add(room)
            break
          }
        }

        // Check one level deeper for nested structure
        try {
          const subEntries = readdirSync(fullPath)
          for (const sub of subEntries) {
            if (SKIP_DIRS.has(sub)) continue
            const lowerSub = sub.toLowerCase()
            for (const [room, patterns] of Object.entries(ROOM_PATTERNS)) {
              if (patterns.includes(lowerSub)) {
                rooms.add(room)
                break
              }
            }
          }
        } catch {
          // Can't read subdirectory
        }
      } catch {
        // Can't stat entry
      }
    }
  } catch {
    // Can't read project directory
  }

  return Array.from(rooms).sort()
}

/**
 * Detect the most likely room for a piece of content or file path.
 * Uses content keyword signals and optional file path patterns.
 */
export function detectRoomForContent(content: string, filePath?: string): string {
  // Try file path first (more reliable)
  if (filePath) {
    const pathParts = filePath.toLowerCase().split(/[/\\]/)
    for (const part of pathParts) {
      for (const [room, patterns] of Object.entries(ROOM_PATTERNS)) {
        if (patterns.includes(part)) return room
      }
    }
  }

  // Fall back to content keyword scoring
  const lower = content.toLowerCase()
  let bestRoom = 'general'
  let bestScore = 0

  for (const [room, signals] of Object.entries(CONTENT_ROOM_SIGNALS)) {
    let score = 0
    for (const keyword of signals) {
      if (lower.includes(keyword)) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestRoom = room
    }
  }

  return bestRoom
}

/**
 * Classify a memory's content into a hall (memory type corridor).
 * Returns null if no strong signal is detected.
 */
export function classifyHall(content: string): string | null {
  let bestHall: string | null = null
  let bestScore = 0

  for (const [hall, patterns] of Object.entries(HALL_SIGNALS)) {
    let score = 0
    for (const pattern of patterns) {
      if (pattern.test(content)) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestHall = hall
    }
  }

  // Require at least 1 signal match
  return bestScore >= 1 ? bestHall : null
}

/**
 * Get the wing name for a project (project name as wing identifier).
 */
export function getWingName(projectName: string): string {
  return `wing_${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`
}

/**
 * Get all available room names from the patterns.
 */
export function getAllRoomNames(): string[] {
  return Object.keys(ROOM_PATTERNS).sort()
}
