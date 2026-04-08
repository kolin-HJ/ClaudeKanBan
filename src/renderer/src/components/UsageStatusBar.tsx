import { useUsageStore } from '../store/usageStore'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatDuration(startedAt: number): string {
  const secs = Math.floor((Date.now() - startedAt) / 1000)
  const mins = Math.floor(secs / 60)
  const hrs = Math.floor(mins / 60)
  if (hrs > 0) return `${hrs}h ${mins % 60}m`
  if (mins > 0) return `${mins}m ${secs % 60}s`
  return `${secs}s`
}

export default function UsageStatusBar() {
  const { liveSessions, weeklySummary } = useUsageStore()
  const sessions = Object.values(liveSessions)
  const activeCount = sessions.length

  const totalInput = sessions.reduce((a, s) => a + s.inputTokens, 0)
  const totalOutput = sessions.reduce((a, s) => a + s.outputTokens, 0)
  const totalCost = sessions.reduce((a, s) => a + s.estimatedCostUsd, 0)

  return (
    <div className="flex items-center justify-between bg-slate-950 border-t border-slate-800 px-3 h-7 text-[11px] text-slate-400 shrink-0 select-none">
      {/* Left: active sessions */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          {activeCount > 0 ? (
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
          )}
          {activeCount} active session{activeCount !== 1 ? 's' : ''}
        </span>

        {activeCount > 0 && (
          <>
            <span className="text-slate-600">|</span>
            <span>
              In: {formatTokens(totalInput)} / Out: {formatTokens(totalOutput)}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-emerald-400">${totalCost.toFixed(4)}</span>
            {sessions.length === 1 && (
              <>
                <span className="text-slate-600">|</span>
                <span>{formatDuration(sessions[0].startedAt)}</span>
              </>
            )}
          </>
        )}
      </div>

      {/* Right: weekly summary */}
      <div className="flex items-center gap-3">
        {weeklySummary && (
          <>
            <span>
              Week: {formatTokens(weeklySummary.totalInputTokens + weeklySummary.totalOutputTokens)}{' '}
              tokens
            </span>
            <span className="text-slate-600">|</span>
            <span>{weeklySummary.sessionCount} sessions</span>
            <span className="text-slate-600">|</span>
            <span className="text-emerald-400">${weeklySummary.totalCostUsd.toFixed(2)}</span>
          </>
        )}
      </div>
    </div>
  )
}
