export type TaskStatus = 'your-turn' | 'in-progress' | 'done'
export type TaskDepth = 'quick' | 'campaign' | 'deep-build'
export type TaskPermission = 'default' | 'full-auto'
export type MessageRole = 'user' | 'claude' | 'system'
export type MemoryType = 'project_context' | 'task_learning' | 'feedback' | 'pattern' | 'blocker'
export type MemoryCategory =
  | 'architecture'
  | 'convention'
  | 'debugging'
  | 'performance'
  | 'brand_voice'
  | 'workflow'
  | 'dependency'
// 0=Identity (always injected, ~50 tokens), 1=Critical (always injected, ~120 tokens),
// 2=Context (on-demand by room/topic), 3=Archive (deep FTS search only)
export type MemoryLayer = 0 | 1 | 2 | 3
export type MemoryLinkRelationship = 'related' | 'contradicts' | 'extends' | 'supersedes'
export type SessionStatus = 'spawning' | 'running' | 'waiting-input' | 'completed' | 'error'
export type SessionDbStatus = 'running' | 'completed' | 'error' | 'terminated'

export interface Project {
  id: string
  name: string
  path: string
  githubRemote?: string
  createdAt: string
}

export interface Task {
  id: string
  projectId: string
  title: string
  description?: string
  status: TaskStatus
  depth: TaskDepth
  permission: TaskPermission
  createdAt: string
  updatedAt: string
  asanaGid?: string
  asanaPermalink?: string
}

export interface Message {
  id: string
  taskId: string
  role: MessageRole
  content: string
  timestamp: string
}

export interface Output {
  id: string
  taskId: string
  filePath: string
  fileName: string
  previewText?: string
  createdAt: string
}

export interface Memory {
  id: string
  projectId: string
  type: MemoryType
  category?: MemoryCategory
  // Layer controls when this memory is injected into Claude prompts
  layer: MemoryLayer
  // content = the concise, actionable memory (what Claude needs to know)
  content: string
  // verbatim = raw original text this was extracted from (store everything)
  verbatim?: string
  source: 'user_input' | 'claude_note' | 'inferred'
  taskId?: string
  relevanceScore: number
  referenceCount: number
  createdAt: string
  lastReferenced: string
  // Palace fields - spatial memory architecture
  wing?: string
  room?: string
  hall?: string
  importance?: number
  addedBy?: string
}

export interface MemoryLink {
  id: string
  sourceId: string
  targetId: string
  relationship: MemoryLinkRelationship
  createdAt: string
}

export interface GitStatus {
  current: string
  tracking?: string
  ahead: number
  behind: number
  staged: string[]
  modified: string[]
  untracked: string[]
  conflicted: string[]
}

export interface Branch {
  name: string
  current: boolean
  remote?: string
}

export interface PullRequest {
  number: number
  title: string
  state: string
  url: string
  head: string
  base: string
  author: string
  createdAt: string
}

export interface ScheduledTask {
  id: string
  name: string
  schedule: string
  command: string
  active: boolean
  lastRun?: string
  lastStatus?: 'success' | 'failure'
  lastOutputFile?: string
}

export interface Skill {
  name: string
  filePath: string
  content: string
  category?: string
  referenceFiles: string[]
}

export interface SessionRecord {
  id: string
  taskId: string
  projectId: string
  startedAt: string
  endedAt?: string
  status: SessionDbStatus
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalCostUsd: number
  durationSecs: number
}

export interface ToolUsageRecord {
  id: string
  sessionId: string
  toolName: string
  inputJson?: string
  timestamp: string
}

export interface ContextEvent {
  id: string
  sessionId: string
  eventType: string
  target?: string
  timestamp: string
}

export interface SessionInsight {
  id: string
  sessionId: string
  projectId: string
  taskId: string
  tokenInput: number
  tokenOutput: number
  costUsd: number
  durationSecs: number
  toolsJson?: string
  filesReadJson?: string
  filesCreatedJson?: string
  learningsJson?: string
  summary?: string
  createdAt: string
}

export interface ProjectSkillConfig {
  id: string
  projectId: string
  skillPath: string
  active: boolean
  priority: number
}

export interface UsageSummary {
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  sessionCount: number
  totalDurationSecs: number
}

export interface ToolFrequency {
  toolName: string
  count: number
}

export interface LiveSessionUsage {
  taskId: string
  sessionId: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  estimatedCostUsd: number
  toolsUsed: string[]
  startedAt: number
}

export interface AsanaTaskRef {
  gid: string
  name: string
  notes: string
  completed: boolean
  dueOn?: string
  assigneeName?: string
  sectionName?: string
  tags?: string[]
  permalink?: string
}

export interface SessionCheckpoint {
  id: string
  sessionId: string
  inputTokens: number
  outputTokens: number
  toolsUsedJson?: string
  filesCreatedJson?: string
  filesReadJson?: string
  securityFlagsJson?: string
  createdAt: string
}

export interface SecurityScore {
  id: string
  sessionId: string
  projectId: string
  score: number
  flagsJson?: string
  dangerousToolCount: number
  createdAt: string
}

// IPC channel names
export const IPC = {
  PROJECTS_LIST: 'projects:list',
  PROJECTS_CREATE: 'projects:create',
  PROJECTS_REMOVE: 'projects:remove',

  TASKS_LIST: 'tasks:list',
  TASKS_CREATE: 'tasks:create',
  TASKS_UPDATE_STATUS: 'tasks:updateStatus',
  TASKS_DELETE: 'tasks:delete',

  SESSIONS_SPAWN: 'sessions:spawn',
  SESSIONS_SEND: 'sessions:send',
  SESSIONS_TERMINATE: 'sessions:terminate',
  SESSIONS_STATUS: 'sessions:status',

  MESSAGES_HISTORY: 'messages:history',
  MESSAGES_LAST_TWO: 'messages:lastTwo',

  OUTPUTS_LIST: 'outputs:list',
  OUTPUTS_READ: 'outputs:readFile',
  OUTPUTS_RECENT: 'outputs:recent',

  GIT_STATUS: 'git:status',
  GIT_DIFF: 'git:diff',
  GIT_STAGE: 'git:stage',
  GIT_UNSTAGE: 'git:unstage',
  GIT_COMMIT: 'git:commit',
  GIT_PUSH: 'git:push',
  GIT_PULL: 'git:pull',
  GIT_BRANCHES: 'git:branches',
  GIT_CREATE_BRANCH: 'git:createBranch',
  GIT_CHECKOUT: 'git:checkout',

  GITHUB_LIST_PRS: 'github:listPRs',
  GITHUB_CREATE_PR: 'github:createPR',
  GITHUB_LIST_ISSUES: 'github:listIssues',

  MEMORY_LIST: 'memory:list',
  MEMORY_CREATE: 'memory:create',
  MEMORY_UPDATE: 'memory:update',
  MEMORY_DELETE: 'memory:delete',
  MEMORY_SEARCH: 'memory:search',
  MEMORY_CONTEXT_BLOCK: 'memory:contextBlock',
  MEMORY_CAPTURE_TASK: 'memory:captureFromTask',
  MEMORY_ROOMS: 'memory:rooms',
  MEMORY_LINKS_LIST: 'memory:linksList',
  MEMORY_LINKS_CREATE: 'memory:linksCreate',
  MEMORY_LINKS_DELETE: 'memory:linksDelete',
  MEMORY_EXPORT: 'memory:export',

  SKILLS_LIST: 'skills:list',
  SKILLS_READ: 'skills:read',
  SKILLS_UPDATE: 'skills:update',
  SKILLS_CREATE: 'skills:create',
  SKILLS_FETCH_URL: 'skills:fetchUrl',

  DOCS_LIST: 'docs:list',
  DOCS_READ: 'docs:read',
  DOCS_UPDATE: 'docs:update',

  SCHEDULED_LIST: 'scheduled:list',
  SCHEDULED_RUN: 'scheduled:run',
  SCHEDULED_TOGGLE: 'scheduled:toggle',
  SCHEDULED_DELETE: 'scheduled:delete',

  SYSTEM_OPEN_DIALOG: 'system:openDialog',
  SYSTEM_OPEN_EXTERNAL: 'system:openExternal',

  // Usage & analytics
  USAGE_SESSION: 'usage:session',
  USAGE_WEEKLY: 'usage:weekly',
  USAGE_PROJECT: 'usage:project',
  USAGE_DAILY_BREAKDOWN: 'usage:dailyBreakdown',
  USAGE_TOOLS: 'usage:tools',
  USAGE_CONTEXT: 'usage:context',
  USAGE_LIVE: 'usage:live',

  // Insights
  INSIGHTS_LIST: 'insights:list',
  INSIGHTS_GET: 'insights:get',
  INSIGHTS_PROMOTE_LEARNING: 'insights:promoteLearning',

  // Enhanced memory
  MEMORY_CONSOLIDATE: 'memory:consolidate',
  MEMORY_IMPORT: 'memory:import',
  MEMORY_GLOBAL_PATTERNS: 'memory:globalPatterns',

  // Enhanced skills (per-project)
  SKILLS_PROJECT_LIST: 'skills:projectList',
  SKILLS_TOGGLE: 'skills:toggle',
  SKILLS_SET_PRIORITY: 'skills:setPriority',

  // Checkpoints
  CHECKPOINTS_LIST: 'checkpoints:list',
  CHECKPOINTS_GET: 'checkpoints:get',

  // Security
  SECURITY_SCORE: 'security:score',
  SECURITY_PROJECT_SCORES: 'security:projectScores',

  // Palace (mempalace architecture)
  PALACE_IDENTITY_GET: 'palace:identityGet',
  PALACE_IDENTITY_SET: 'palace:identitySet',
  PALACE_ROOMS: 'palace:rooms',
  PALACE_DETECT_ROOMS: 'palace:detectRooms',
  PALACE_STATS: 'palace:stats',
  PALACE_GRAPH: 'palace:graph',
  PALACE_TRAVERSE: 'palace:traverse',
  PALACE_TUNNELS: 'palace:tunnels',
  PALACE_SEARCH: 'palace:search',
  PALACE_DUPLICATE_CHECK: 'palace:duplicateCheck',

  // Knowledge Graph
  KG_ADD_ENTITY: 'kg:addEntity',
  KG_LIST_ENTITIES: 'kg:listEntities',
  KG_ADD_TRIPLE: 'kg:addTriple',
  KG_INVALIDATE: 'kg:invalidate',
  KG_QUERY_ENTITY: 'kg:queryEntity',
  KG_QUERY_RELATIONSHIP: 'kg:queryRelationship',
  KG_TIMELINE: 'kg:timeline',
  KG_STATS: 'kg:stats',

  // Agent Diary
  DIARY_WRITE: 'diary:write',
  DIARY_READ: 'diary:read',
  DIARY_READ_BY_TOPIC: 'diary:readByTopic',

  // Asana integration
  ASANA_VERIFY: 'asana:verify',
  ASANA_SET_TOKEN: 'asana:setToken',
  ASANA_GET_TOKEN: 'asana:getToken',
  ASANA_WORKSPACES: 'asana:workspaces',
  ASANA_PROJECTS: 'asana:projects',
  ASANA_SECTIONS: 'asana:sections',
  ASANA_TASKS: 'asana:tasks',
  ASANA_TASK_DETAIL: 'asana:taskDetail',
  ASANA_COMPLETE_TASK: 'asana:completeTask',
  ASANA_ADD_COMMENT: 'asana:addComment',

  // App settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // System health
  SYSTEM_CLAUDE_CHECK: 'system:claudeCheck',
  SYSTEM_ACTIVE_SESSIONS: 'system:activeSessions',

  // Events pushed from main → renderer
  EVENT_SESSION_OUTPUT: 'event:sessionOutput',
  EVENT_TASK_STATUS: 'event:taskStatus',
  EVENT_OUTPUT_CREATED: 'event:outputCreated',
  EVENT_GIT_CHANGED: 'event:gitChanged',
  EVENT_USAGE_UPDATE: 'event:usageUpdate',
  EVENT_SESSION_HEALTH: 'event:sessionHealth'
} as const
