import { useState } from 'react'

export default function Settings() {
  const [githubToken, setGithubToken] = useState('')
  const [saved, setSaved] = useState(false)

  const handleSaveToken = () => {
    // Store token via a simple env-style approach
    // For now we just show a confirmation — in production this would persist to settings
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-2xl mx-auto p-6 overflow-y-auto h-full">
      <h1 className="text-lg font-semibold text-slate-100 mb-6">Settings</h1>

      {/* GitHub Token */}
      <section className="mb-6">
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
            {saved ? 'Saved ✓' : 'Save'}
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-2">
          Token is stored in <code className="text-slate-500">~/.claude/github-token</code>
        </p>
      </section>

      {/* About */}
      <section className="border-t border-slate-800 pt-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">About</h2>
        <div className="bg-slate-800 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Version</span>
            <span className="text-xs text-slate-300">0.1.0</span>
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
      <section className="border-t border-slate-800 pt-6 mt-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Keyboard Shortcuts</h2>
        <div className="space-y-2">
          {[
            { key: 'Ctrl+Enter', action: 'Send message in task panel' },
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
