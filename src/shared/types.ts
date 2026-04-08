export type TaskStatus = 'your-turn' | 'in-progress' | 'done'
export type TaskDepth = 'quick' | 'campaign' | 'deep-build'
export type TaskPermission = 'default' | 'full-auto'
export type MessageRole = 'user' | 'claude'
export type MemoryType = 'project_context' | 'task_learning' | 'feedback' | 'pattern' | 'blocker'
export type MemoryCategory =
  | 'architecture'
  | 'convention'
  | 'debugging'
  | 'performance'
  | 'brand_voice'
  | 'workflow'
  | 'dependency'
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
  content: string
  source: 'user_input' | 'claude_note' | 'inferred'
  taskId?: string
  relevanceScore: number
  createdAt: string
  lastReferenced: string
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
  MEMORY_EXPORT: 'memory:export',
  MEMORY_IMPORT: 'memory:import',
  MEMORY_GLOBAL_PATTERNS: 'memory:globalPatterns',

  // Enhanced skills (per-project)
  SKILLS_PROJECT_LIST: 'skills:projectList',
  SKILLS_TOGGLE: 'skills:toggle',
  SKILLS_SET_PRIORITY: 'skills:setPriority',

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
