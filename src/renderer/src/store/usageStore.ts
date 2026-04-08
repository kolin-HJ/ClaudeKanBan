import { create } from 'zustand'
import api from '../lib/ipc'

interface LiveUsage {
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

interface WeeklySummary {
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  sessionCount: number
  totalDurationSecs: number
}

interface DailyBreakdown {
  day: string
  input_tokens: number
  output_tokens: number
  cost: number
  sessions: number
}

interface ToolFreq {
  toolName: string
  count: number
}

interface UsageStore {
  liveSessions: Record<string, LiveUsage>
  weeklySummary: WeeklySummary | null
  dailyBreakdown: DailyBreakdown[]
  toolFrequencies: ToolFreq[]
  insights: any[]
  loading: boolean

  handleUsageUpdate: (payload: any) => void
  loadWeeklySummary: (projectId?: string) => Promise<void>
  loadDailyBreakdown: (days?: number, projectId?: string) => Promise<void>
  loadToolFrequencies: (projectId?: string, days?: number) => Promise<void>
  loadInsights: (projectId: string) => Promise<void>
  promoteLearning: (projectId: string, learning: string) => Promise<void>
}

export const useUsageStore = create<UsageStore>((set) => ({
  liveSessions: {},
  weeklySummary: null,
  dailyBreakdown: [],
  toolFrequencies: [],
  insights: [],
  loading: false,

  handleUsageUpdate: (payload) => {
    if (payload.final) {
      // Session ended — remove from live
      set((s) => {
        const updated = { ...s.liveSessions }
        delete updated[payload.taskId]
        return { liveSessions: updated }
      })
    } else {
      set((s) => ({
        liveSessions: {
          ...s.liveSessions,
          [payload.taskId]: {
            taskId: payload.taskId,
            sessionId: payload.sessionId,
            inputTokens: payload.inputTokens,
            outputTokens: payload.outputTokens,
            cacheReadTokens: payload.cacheReadTokens,
            cacheWriteTokens: payload.cacheWriteTokens,
            estimatedCostUsd: payload.estimatedCostUsd,
            toolsUsed: payload.toolsUsed ?? [],
            startedAt: payload.startedAt
          }
        }
      }))
    }
  },

  loadWeeklySummary: async (projectId) => {
    try {
      const summary = await api.usage.weekly(projectId)
      set({ weeklySummary: summary })
    } catch {
      // ignore
    }
  },

  loadDailyBreakdown: async (days = 7, projectId) => {
    try {
      const data = await api.usage.dailyBreakdown(days, projectId)
      set({ dailyBreakdown: data })
    } catch {
      // ignore
    }
  },

  loadToolFrequencies: async (projectId, days = 7) => {
    try {
      const data = await api.usage.tools(projectId, days)
      set({ toolFrequencies: data })
    } catch {
      // ignore
    }
  },

  loadInsights: async (projectId) => {
    set({ loading: true })
    try {
      const data = await api.insights.list(projectId)
      set({ insights: data, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  promoteLearning: async (projectId, learning) => {
    await api.insights.promoteLearning(projectId, learning)
  }
}))
