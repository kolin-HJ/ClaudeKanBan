import { useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'

export default function Settings() {
  const [githubToken, setGithubToken] = useState('')
  const [saved, setSaved] = useState(false)

  const handleSaveToken = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-xl mx-auto p-6 overflow-y-auto h-full">
      <h1 className="text-sm font-semibold text-foreground mb-6">Settings</h1>

      {/* GitHub Token */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-foreground mb-1 uppercase tracking-wider">
          GitHub Integration
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          A personal access token with <code className="text-foreground/80 bg-muted px-1 rounded">repo</code> scope is required to list and create pull requests.
        </p>
        <div className="flex gap-2">
          <Input
            type="password"
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxx"
            className="flex-1"
          />
          <Button
            onClick={handleSaveToken}
            disabled={!githubToken.trim()}
          >
            {saved ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Saved
              </>
            ) : (
              'Save'
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground/60 mt-2 font-mono">
          ~/.claude/github-token
        </p>
      </section>

      <div className="h-px bg-border mb-6" />

      {/* About */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-foreground mb-3 uppercase tracking-wider">About</h2>
        <div className="bg-card border border-border rounded-md divide-y divide-border">
          {[
            { label: 'Version', value: '0.1.0' },
            { label: 'Session format', value: 'stream-json' },
            { label: 'Database', value: 'SQLite (WAL + FTS5)' }
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-3 py-2">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-xs text-foreground font-mono">{value}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="h-px bg-border mb-6" />

      {/* Keyboard shortcuts */}
      <section>
        <h2 className="text-xs font-semibold text-foreground mb-3 uppercase tracking-wider">Keyboard Shortcuts</h2>
        <div className="space-y-2">
          {[
            { key: 'Ctrl+Enter', action: 'Send message' },
            { key: 'Esc', action: 'Close modal / deselect task' }
          ].map(({ key, action }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{action}</span>
              <kbd className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded border border-border font-mono">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
