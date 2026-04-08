import { useEffect, useState } from 'react'
import { RefreshCw, ArrowUp, ArrowDown, GitBranch, Circle, Plus, ExternalLink } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { GitStatus, Branch, PullRequest } from '../../../shared/types'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { cn } from '../lib/utils'

export default function GitView() {
  const { activeProjectId } = useProjectStore()
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [diff, setDiff] = useState<string>('')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [prs, setPrs] = useState<PullRequest[]>([])
  const [commitMsg, setCommitMsg] = useState('')
  const [newBranch, setNewBranch] = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'changes' | 'branches' | 'prs'>('changes')

  const loadStatus = async () => {
    if (!activeProjectId) return
    const s = await window.electronAPI.git.status(activeProjectId)
    setStatus(s)
  }

  const loadBranches = async () => {
    if (!activeProjectId) return
    const b = await window.electronAPI.git.branches(activeProjectId)
    setBranches(b)
  }

  const loadPRs = async () => {
    if (!activeProjectId) return
    try {
      const p = await window.electronAPI.github.listPRs(activeProjectId)
      setPrs(p)
    } catch {
      setPrs([])
    }
  }

  useEffect(() => {
    loadStatus()
    loadBranches()
    loadPRs()
  }, [activeProjectId])

  const handleSelectFile = async (file: string) => {
    setSelectedFile(file)
    if (!activeProjectId) return
    const d = await window.electronAPI.git.diff(activeProjectId, file)
    setDiff(d)
  }

  const handleStage = async (files: string[]) => {
    if (!activeProjectId) return
    await window.electronAPI.git.stage(activeProjectId, files)
    loadStatus()
  }

  const handleUnstage = async (files: string[]) => {
    if (!activeProjectId) return
    await window.electronAPI.git.unstage(activeProjectId, files)
    loadStatus()
  }

  const handleCommit = async () => {
    if (!activeProjectId || !commitMsg.trim()) return
    setLoading(true)
    try {
      await window.electronAPI.git.commit(activeProjectId, commitMsg.trim())
      setCommitMsg('')
      loadStatus()
    } catch (err: any) {
      alert(`Commit failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handlePush = async () => {
    if (!activeProjectId) return
    setLoading(true)
    try {
      await window.electronAPI.git.push(activeProjectId)
    } catch (err: any) {
      alert(`Push failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handlePull = async () => {
    if (!activeProjectId) return
    await window.electronAPI.git.pull(activeProjectId)
    loadStatus()
  }

  const handleCheckout = async (branch: string) => {
    if (!activeProjectId) return
    await window.electronAPI.git.checkout(activeProjectId, branch)
    loadStatus()
    loadBranches()
  }

  const handleCreateBranch = async () => {
    if (!activeProjectId || !newBranch.trim()) return
    await window.electronAPI.git.createBranch(activeProjectId, newBranch.trim())
    setNewBranch('')
    loadBranches()
  }

  if (!activeProjectId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a project to view git status
      </div>
    )
  }

  const allChangedFiles = [
    ...(status?.staged ?? []).map((f) => ({ file: f, staged: true })),
    ...(status?.modified ?? [])
      .filter((f) => !(status?.staged ?? []).includes(f))
      .map((f) => ({ file: f, staged: false })),
    ...(status?.untracked ?? []).map((f) => ({ file: f, staged: false }))
  ]

  const tabs = ['changes', 'branches', 'prs'] as const

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className="w-68 shrink-0 border-r border-border flex flex-col" style={{ width: '272px' }}>
        {/* Branch header */}
        <div className="px-3 py-2.5 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <GitBranch className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-foreground truncate flex-1">
              {status?.current ?? '...'}
            </span>
            {(status?.ahead ?? 0) > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-amber-400">
                <ArrowUp className="w-3 h-3" />
                {status?.ahead}
              </span>
            )}
            {(status?.behind ?? 0) > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-red-400">
                <ArrowDown className="w-3 h-3" />
                {status?.behind}
              </span>
            )}
          </div>
          <div className="flex gap-1">
            <Button variant="secondary" size="sm" onClick={handlePull} className="flex-1 h-7">
              Pull
            </Button>
            <Button size="sm" onClick={handlePush} disabled={loading} className="flex-1 h-7">
              Push
            </Button>
            <Button variant="ghost" size="icon" onClick={loadStatus} className="h-7 w-7">
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 text-xs py-2 capitalize transition-colors',
                tab === t
                  ? 'text-foreground border-b border-primary -mb-px'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t === 'prs' ? 'PRs' : t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === 'changes' && (
            <div className="p-2">
              {/* Staged */}
              {(status?.staged ?? []).length > 0 && (
                <div className="mb-3">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider px-1 mb-1">
                    Staged ({status?.staged.length})
                  </div>
                  {status?.staged.map((f) => (
                    <div
                      key={f}
                      className={cn(
                        'flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer hover:bg-accent text-xs',
                        selectedFile === f && 'bg-accent'
                      )}
                      onClick={() => handleSelectFile(f)}
                    >
                      <span className="text-emerald-400 font-mono font-bold">M</span>
                      <span className="text-foreground flex-1 truncate">{f}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUnstage([f]) }}
                        className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        &minus;
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Unstaged */}
              {allChangedFiles.filter((f) => !f.staged).length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center justify-between px-1 mb-1">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">
                      Changes ({allChangedFiles.filter((f) => !f.staged).length})
                    </span>
                    <button
                      onClick={() =>
                        handleStage(allChangedFiles.filter((f) => !f.staged).map((f) => f.file))
                      }
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Stage all
                    </button>
                  </div>
                  {allChangedFiles
                    .filter((f) => !f.staged)
                    .map(({ file }) => (
                      <div
                        key={file}
                        className={cn(
                          'flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer hover:bg-accent text-xs group',
                          selectedFile === file && 'bg-accent'
                        )}
                        onClick={() => handleSelectFile(file)}
                      >
                        <span className="text-amber-400 font-mono font-bold">M</span>
                        <span className="text-foreground flex-1 truncate">{file}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleStage([file]) }}
                          className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          +
                        </button>
                      </div>
                    ))}
                </div>
              )}

              {allChangedFiles.length === 0 && (
                <div className="text-xs text-muted-foreground/40 text-center mt-8">
                  No changes
                </div>
              )}

              {/* Commit */}
              {(status?.staged ?? []).length > 0 && (
                <div className="mt-3 space-y-2">
                  <Textarea
                    value={commitMsg}
                    onChange={(e) => setCommitMsg(e.target.value)}
                    placeholder="Commit message..."
                    rows={2}
                    className="text-xs"
                  />
                  <Button
                    size="sm"
                    onClick={handleCommit}
                    disabled={!commitMsg.trim() || loading}
                    className="w-full"
                  >
                    Commit
                  </Button>
                </div>
              )}
            </div>
          )}

          {tab === 'branches' && (
            <div className="p-2">
              <div className="flex gap-1 mb-3">
                <Input
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  placeholder="New branch..."
                  className="flex-1 h-7 text-xs"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateBranch()}
                />
                <Button
                  size="icon"
                  onClick={handleCreateBranch}
                  disabled={!newBranch.trim()}
                  className="h-7 w-7"
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
              {branches
                .filter((b) => !b.name.startsWith('remotes/'))
                .map((b) => (
                  <button
                    key={b.name}
                    onClick={() => !b.current && handleCheckout(b.name)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors',
                      b.current
                        ? 'bg-primary/10 text-primary cursor-default'
                        : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Circle className={cn('w-2 h-2 shrink-0', b.current ? 'fill-primary text-primary' : 'text-muted-foreground/40')} />
                    <span className="text-xs truncate">{b.name}</span>
                  </button>
                ))}
            </div>
          )}

          {tab === 'prs' && (
            <div className="p-2">
              {prs.length === 0 ? (
                <div className="text-xs text-muted-foreground/40 text-center mt-8">No open PRs</div>
              ) : (
                prs.map((pr) => (
                  <div
                    key={pr.number}
                    className="mb-2 p-2.5 bg-card border border-border rounded-md"
                  >
                    <div className="flex items-start gap-2 mb-1.5">
                      <span className="text-xs text-muted-foreground shrink-0 font-mono">
                        #{pr.number}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-foreground leading-snug font-medium">
                          {pr.title}
                        </div>
                        <div className="text-xs text-muted-foreground/60 mt-0.5 font-mono">
                          {pr.head} → {pr.base}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => window.electronAPI.system.openExternal(pr.url)}
                      className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      Open on GitHub
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Diff viewer */}
      <div className="flex-1 overflow-y-auto p-4 font-mono bg-background">
        {diff ? (
          <pre className="text-xs leading-relaxed whitespace-pre-wrap">
            {diff.split('\n').map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith('+') && !line.startsWith('+++')
                    ? 'text-emerald-400 bg-emerald-400/5'
                    : line.startsWith('-') && !line.startsWith('---')
                      ? 'text-red-400 bg-red-400/5'
                      : line.startsWith('@@')
                        ? 'text-primary/70'
                        : 'text-muted-foreground/50'
                }
              >
                {line || ' '}
              </div>
            ))}
          </pre>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground/40 text-sm">
            Select a file to view its diff
          </div>
        )}
      </div>
    </div>
  )
}
