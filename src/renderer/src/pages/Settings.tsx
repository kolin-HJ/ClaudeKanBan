import { useState, useEffect } from 'react'
import api from '../lib/ipc'

export default function Settings() {
  const [githubToken, setGithubToken] = useState('')
  const [saved, setSaved] = useState(false)
  const [claudeStatus, setClaudeStatus] = useState<{
    available: boolean
    version?: string
    error?: string
  } | null>(null)
  const [maxSessions, setMaxSessions] = useState(10)
  const [defaultPermission, setDefaultPermission] = useState('default')
  const [useWorktree, setUseWorktree] = useState(false)
  const [activeSessions, setActiveSessions] = useState<any[]>([])
  const [asanaToken, setAsanaToken] = useState('')
  const [asanaStatus, setAsanaStatus] = useState<{
    ok: boolean; name?: string; email?: string; error?: string
  } | null>(null)
  const [asanaExisting, setAsanaExisting] = useState<string | null>(null)
  const [asanaSaving, setAsanaSaving] = useState(false)

  useEffect(() => {
    // Check Claude CLI on mount
    api.system.claudeCheck().then(setClaudeStatus).catch(() => {})
    api.system.activeSessions().then(setActiveSessions).catch(() => {})

    // Load settings
    api.settings.get('maxConcurrentSessions').then((v: any) => {
      if (v) setMaxSessions(v)
    })
    api.settings.get('useWorktreeIsolation').then((v: any) => {
      if (v === 'true' || v === true) setUseWorktree(true)
    })
    // Load Asana status
    api.asana.getToken().then((t: any) => {
      if (t) {
        setAsanaExisting(t)
        api.asana.verify().then(setAsanaStatus).catch(() => {})
      }
    })
    api.settings.get('defaultPermission').then((v: any) => {
      if (v) setDefaultPermission(v)
    })
  }, [])

  const handleSaveToken = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSaveMaxSessions = () => {
    api.settings.set('maxConcurrentSessions', maxSessions)
  }

  const handleSavePermission = () => {
    api.settings.set('defaultPermission', defaultPermission)
  }

  return (
    <div className="max-w-2xl mx-auto p-6 overflow-y-auto h-full space-y-6">
      <h1 className="text-lg font-semibold text-slate-100">Settings</h1>

      {/* Claude CLI Status */}
      <section>
        <h2 className="text-sm font-semibold text-slate-300 mb-2">Claude CLI</h2>
        <div className="bg-slate-800 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Status</span>
            {claudeStatus ? (
              claudeStatus.available ? (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Available
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-red-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  Not Found
                </span>
              )
            ) : (
              <span className="text-xs text-slate-500">Checking...</span>
            )}
          </div>
          {claudeStatus?.version && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Version</span>
              <span className="text-xs text-slate-300">{claudeStatus.version}</span>
            </div>
          )}
          {claudeStatus?.error && (
            <p className="text-xs text-red-400 mt-1">{claudeStatus.error}</p>
          )}
        </div>
      </section>

      {/* Instance Management */}
      <section>
        <h2 className="text-sm font-semibold text-slate-300 mb-2">Instance Management</h2>
        <div className="space-y-3">
          <div className="bg-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">Active Sessions</span>
              <span className="text-xs text-slate-300">{activeSessions.length}</span>
            </div>
            {activeSessions.length > 0 && (
              <div className="space-y-1">
                {activeSessions.map((s: any) => (
                  <div
                    key={s.taskId}
                    className="flex items-center justify-between text-xs bg-slate-900 rounded px-2 py-1"
                  >
                    <span className="text-slate-400 truncate">{s.taskId.slice(0, 8)}...</span>
                    <span
                      className={`${
                        s.status === 'running'
                          ? 'text-emerald-400'
                          : s.status === 'spawning'
                            ? 'text-yellow-400'
                            : 'text-slate-500'
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-400 shrink-0">Max Concurrent Sessions</label>
            <input
              type="number"
              min={1}
              max={50}
              value={maxSessions}
              onChange={(e) => setMaxSessions(Number(e.target.value))}
              className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-violet-500"
            />
            <button
              onClick={handleSaveMaxSessions}
              className="px-3 py-1 text-xs bg-violet-600 hover:bg-violet-500 rounded transition-colors"
            >
              Save
            </button>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={useWorktree}
              onChange={(e) => {
                setUseWorktree(e.target.checked)
                api.settings.set('useWorktreeIsolation', e.target.checked ? 'true' : 'false')
              }}
              className="w-4 h-4 rounded accent-violet-500"
            />
            <div>
              <span className="text-xs text-slate-300">Git Worktree Isolation</span>
              <p className="text-xs text-slate-500">Each task gets its own git branch via worktree. Prevents conflicts with parallel agents.</p>
            </div>
          </label>

          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-400 shrink-0">Default Permission</label>
            <select
              value={defaultPermission}
              onChange={(e) => setDefaultPermission(e.target.value)}
              className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-violet-500"
            >
              <option value="default">Default (confirm actions)</option>
              <option value="full-auto">Full Auto (skip permissions)</option>
            </select>
            <button
              onClick={handleSavePermission}
              className="px-3 py-1 text-xs bg-violet-600 hover:bg-violet-500 rounded transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </section>

      {/* GitHub Token */}
      <section>
        <h2 className="text-sm font-semibold text-slate-300 mb-1">GitHub Integration</h2>
        <p className="text-xs text-slate-500 mb-3">
          A personal access token with <code className="text-slate-400">repo</code> scope is
          required to list and create pull requests.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxx"
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500"
          />
          <button
            onClick={handleSaveToken}
            disabled={!githubToken.trim()}
            className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg transition-colors"
          >
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-2">
          Token is stored in <code className="text-slate-500">~/.claude/github-token</code>
        </p>
      </section>

      {/* Asana Integration */}
      <section>
        <h2 className="text-sm font-semibold text-slate-300 mb-1">Asana Integration</h2>
        <p className="text-xs text-slate-500 mb-3">
          Connect to Asana to import tasks and sync completion status. Create a{' '}
          <button
            onClick={() => api.system.openExternal('https://app.asana.com/0/my-apps')}
            className="text-violet-400 hover:text-violet-300 underline"
          >
            Personal Access Token
          </button>{' '}
          in your Asana account settings.
        </p>

        {/* Connection status */}
        {asanaStatus && (
          <div className={`mb-3 px-3 py-2 rounded text-xs ${
            asanaStatus.ok
              ? 'bg-emerald-900/30 border border-emerald-800 text-emerald-300'
              : 'bg-red-900/30 border border-red-800 text-red-300'
          }`}>
            {asanaStatus.ok
              ? `Connected as ${asanaStatus.name} (${asanaStatus.email})`
              : `Connection failed: ${asanaStatus.error}`
            }
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="password"
            value={asanaToken}
            onChange={(e) => setAsanaToken(e.target.value)}
            placeholder={asanaExisting ? 'Token saved (enter new to replace)' : '0/xxxxxxxxx'}
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500"
          />
          <button
            onClick={async () => {
              if (!asanaToken.trim()) return
              setAsanaSaving(true)
              await api.asana.setToken(asanaToken.trim())
              const result = await api.asana.verify()
              setAsanaStatus(result)
              setAsanaExisting('••••••••')
              setAsanaToken('')
              setAsanaSaving(false)
            }}
            disabled={!asanaToken.trim() || asanaSaving}
            className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg transition-colors"
          >
            {asanaSaving ? 'Verifying...' : 'Connect'}
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-2">
          Token is stored in <code className="text-slate-500">~/.claude/asana-token</code>
        </p>
      </section>

      {/* About */}
      <section className="border-t border-slate-800 pt-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">About</h2>
        <div className="bg-slate-800 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Version</span>
            <span className="text-xs text-slate-300">0.2.0</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Claude sessions use</span>
            <span className="text-xs text-slate-300">--output-format stream-json</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Database</span>
            <span className="text-xs text-slate-300">SQLite (WAL + FTS5)</span>
          </div>
        </div>
      </section>

      {/* Keyboard shortcuts */}
      <section className="border-t border-slate-800 pt-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Keyboard Shortcuts</h2>
        <div className="space-y-2">
          {[
            { key: 'Ctrl+Enter', action: 'Send message in task panel' },
            { key: 'Ctrl+Tab', action: 'Next project tab' },
            { key: 'Ctrl+Shift+Tab', action: 'Previous project tab' },
            { key: 'Ctrl+W', action: 'Close current project tab' },
            { key: 'Esc', action: 'Close modal / deselect task' }
          ].map(({ key, action }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-xs text-slate-400">{action}</span>
              <kbd className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">{key}</kbd>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
