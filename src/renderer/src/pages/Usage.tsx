import { useEffect, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useUsageStore } from '../store/usageStore'

type Tab = 'overview' | 'insights' | 'tools'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatDuration(secs: number): string {
  const hrs = Math.floor(secs / 3600)
  const mins = Math.floor((secs % 3600) / 60)
  if (hrs > 0) return `${hrs}h ${mins}m`
  return `${mins}m`
}

export default function Usage() {
  const { activeProjectId } = useProjectStore()
  const {
    weeklySummary,
    dailyBreakdown,
    toolFrequencies,
    insights,
    liveSessions,
    loading,
    loadWeeklySummary,
    loadDailyBreakdown,
    loadToolFrequencies,
    loadInsights,
    promoteLearning
  } = useUsageStore()

  const [tab, setTab] = useState<Tab>('overview')
  const [promoted, setPromoted] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadWeeklySummary(activeProjectId ?? undefined)
    loadDailyBreakdown(7, activeProjectId ?? undefined)
    loadToolFrequencies(activeProjectId ?? undefined, 7)
    if (activeProjectId) loadInsights(activeProjectId)
  }, [activeProjectId])

  const handlePromote = async (learning: string) => {
    if (!activeProjectId) return
    await promoteLearning(activeProjectId, learning)
    setPromoted((prev) => new Set(prev).add(learning))
  }

  const sessions = Object.values(liveSessions)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <h1 className="text-lg font-semibold text-slate-100">Usage & Insights</h1>
        <div className="flex gap-1 bg-slate-800 rounded-lg p-0.5">
          {(['overview', 'insights', 'tools'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded text-sm capitalize transition-colors ${
                tab === t
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Live sessions */}
        {sessions.length > 0 && (
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h2 className="text-sm font-medium text-slate-300 mb-3">Live Sessions</h2>
            <div className="space-y-2">
              {sessions.map((s) => (
                <div
                  key={s.taskId}
                  className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-slate-300 truncate max-w-[200px]">{s.taskId.slice(0, 8)}...</span>
                  </div>
                  <div className="flex items-center gap-4 text-slate-400 text-xs">
                    <span>In: {formatTokens(s.inputTokens)}</span>
                    <span>Out: {formatTokens(s.outputTokens)}</span>
                    <span className="text-emerald-400">${s.estimatedCostUsd.toFixed(4)}</span>
                    <span>{s.toolsUsed.length} tools</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'overview' && (
          <>
            {/* Weekly summary cards */}
            {weeklySummary && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatCard label="Sessions" value={String(weeklySummary.sessionCount)} />
                <StatCard label="Input Tokens" value={formatTokens(weeklySummary.totalInputTokens)} />
                <StatCard label="Output Tokens" value={formatTokens(weeklySummary.totalOutputTokens)} />
                <StatCard
                  label="Total Cost"
                  value={`$${weeklySummary.totalCostUsd.toFixed(2)}`}
                  highlight
                />
                <StatCard label="Total Time" value={formatDuration(weeklySummary.totalDurationSecs)} />
              </div>
            )}

            {/* Daily breakdown chart */}
            {dailyBreakdown.length > 0 && (
              <div className="bg-slate-800/50 rounded-lg p-4">
                <h2 className="text-sm font-medium text-slate-300 mb-4">Daily Usage (7 days)</h2>
                <div className="flex items-end gap-1 h-32">
                  {dailyBreakdown.map((d) => {
                    const total = d.input_tokens + d.output_tokens
                    const maxTokens = Math.max(
                      ...dailyBreakdown.map((dd) => dd.input_tokens + dd.output_tokens),
                      1
                    )
                    const height = Math.max((total / maxTokens) * 100, 4)
                    const inputPct = total > 0 ? (d.input_tokens / total) * 100 : 50

                    return (
                      <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full relative" style={{ height: `${height}%` }}>
                          <div
                            className="absolute bottom-0 w-full bg-violet-500 rounded-t"
                            style={{ height: `${inputPct}%` }}
                          />
                          <div
                            className="absolute top-0 w-full bg-violet-300 rounded-t"
                            style={{ height: `${100 - inputPct}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-slate-500">
                          {new Date(d.day).toLocaleDateString('en', { weekday: 'short' })}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded bg-violet-500" /> Input
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded bg-violet-300" /> Output
                  </span>
                </div>
              </div>
            )}

            {/* Top tools quick view */}
            {toolFrequencies.length > 0 && (
              <div className="bg-slate-800/50 rounded-lg p-4">
                <h2 className="text-sm font-medium text-slate-300 mb-3">Top Tools (7 days)</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {toolFrequencies.slice(0, 8).map((t) => (
                    <div
                      key={t.toolName}
                      className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 text-sm"
                    >
                      <span className="text-slate-300 truncate">{t.toolName}</span>
                      <span className="text-slate-500 ml-2">{t.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'insights' && (
          <div className="space-y-3">
            {loading && <p className="text-slate-500 text-sm">Loading insights...</p>}
            {!loading && insights.length === 0 && (
              <p className="text-slate-500 text-sm">
                No session insights yet. Complete a Claude session to generate insights.
              </p>
            )}
            {insights.map((insight: any) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                promoted={promoted}
                onPromote={handlePromote}
              />
            ))}
          </div>
        )}

        {tab === 'tools' && (
          <div className="space-y-4">
            {toolFrequencies.length === 0 ? (
              <p className="text-slate-500 text-sm">No tool usage data yet.</p>
            ) : (
              <div className="bg-slate-800/50 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="px-4 py-2 font-medium">Tool</th>
                      <th className="px-4 py-2 font-medium text-right">Uses</th>
                      <th className="px-4 py-2 font-medium">Distribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {toolFrequencies.map((t) => {
                      const maxCount = toolFrequencies[0]?.count ?? 1
                      const pct = (t.count / maxCount) * 100
                      return (
                        <tr
                          key={t.toolName}
                          className="border-b border-slate-800 hover:bg-slate-800/50"
                        >
                          <td className="px-4 py-2 text-slate-200">{t.toolName}</td>
                          <td className="px-4 py-2 text-right text-slate-400">{t.count}</td>
                          <td className="px-4 py-2">
                            <div className="w-full bg-slate-700 rounded h-2">
                              <div
                                className="bg-violet-500 rounded h-2 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  highlight
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="bg-slate-800/50 rounded-lg p-3">
      <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-lg font-semibold ${highlight ? 'text-emerald-400' : 'text-slate-100'}`}>
        {value}
      </div>
    </div>
  )
}

function InsightCard({
  insight,
  promoted,
  onPromote
}: {
  insight: any
  promoted: Set<string>
  onPromote: (learning: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const tools = insight.toolsJson ? JSON.parse(insight.toolsJson) : []
  const filesRead = insight.filesReadJson ? JSON.parse(insight.filesReadJson) : []
  const filesCreated = insight.filesCreatedJson ? JSON.parse(insight.filesCreatedJson) : []
  const learnings = insight.learningsJson ? JSON.parse(insight.learningsJson) : []

  return (
    <div className="bg-slate-800/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-800/80 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-200 truncate">{insight.taskTitle ?? 'Session'}</span>
            <span className="text-slate-500">{new Date(insight.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{insight.summary}</div>
        </div>
        <div className="flex items-center gap-3 ml-4 text-xs text-slate-400 shrink-0">
          <span>{formatTokens(insight.tokenInput + insight.tokenOutput)} tok</span>
          <span className="text-emerald-400">${insight.costUsd?.toFixed(4)}</span>
          <span>{formatDuration(insight.durationSecs)}</span>
          <span className="text-slate-600">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-700 pt-3">
          {/* Tools */}
          {tools.length > 0 && (
            <div>
              <h4 className="text-xs text-slate-500 uppercase tracking-wide mb-1">Tools Used</h4>
              <div className="flex flex-wrap gap-1">
                {tools.map((t: any) => (
                  <span
                    key={t.name}
                    className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-300"
                  >
                    {t.name} ({t.count})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Files */}
          {(filesRead.length > 0 || filesCreated.length > 0) && (
            <div className="grid grid-cols-2 gap-3">
              {filesRead.length > 0 && (
                <div>
                  <h4 className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                    Files Read ({filesRead.length})
                  </h4>
                  <div className="max-h-24 overflow-y-auto text-xs text-slate-400 space-y-0.5">
                    {filesRead.map((f: string) => (
                      <div key={f} className="truncate">
                        {f.split('/').pop()}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {filesCreated.length > 0 && (
                <div>
                  <h4 className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                    Files Created ({filesCreated.length})
                  </h4>
                  <div className="max-h-24 overflow-y-auto text-xs text-slate-400 space-y-0.5">
                    {filesCreated.map((f: string) => (
                      <div key={f} className="truncate">
                        {f.split('/').pop()}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Learnings */}
          {learnings.length > 0 && (
            <div>
              <h4 className="text-xs text-slate-500 uppercase tracking-wide mb-1">Learnings</h4>
              <div className="space-y-1">
                {learnings.map((l: string, i: number) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 bg-slate-900 rounded px-3 py-2 text-xs"
                  >
                    <span className="flex-1 text-slate-300">{l}</span>
                    <button
                      onClick={() => onPromote(l)}
                      disabled={promoted.has(l)}
                      className={`shrink-0 px-2 py-0.5 rounded text-xs transition-colors ${
                        promoted.has(l)
                          ? 'bg-emerald-900 text-emerald-400'
                          : 'bg-violet-600 hover:bg-violet-500 text-white'
                      }`}
                    >
                      {promoted.has(l) ? 'Saved' : 'Save to Memory'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
