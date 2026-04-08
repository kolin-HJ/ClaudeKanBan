import { useEffect, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { GitStatus, Branch, PullRequest } from '../../../shared/types'

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
      <div className="flex items-center justify-center h-full text-slate-600 text-sm">
        Select a project to manage git
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

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className="w-72 shrink-0 border-r border-slate-800 flex flex-col">
        {/* Branch header */}
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-slate-500">Branch:</span>
            <span className="text-sm font-medium text-violet-300">{status?.current ?? '…'}</span>
            {(status?.ahead ?? 0) > 0 && (
              <span className="text-xs text-amber-400">↑{status?.ahead}</span>
            )}
            {(status?.behind ?? 0) > 0 && (
              <span className="text-xs text-red-400">↓{status?.behind}</span>
            )}
          </div>
          <div className="flex gap-1">
            <button
              onClick={handlePull}
              className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors flex-1"
            >
              Pull
            </button>
            <button
              onClick={handlePush}
              disabled={loading}
              className="text-xs px-2 py-1 bg-violet-700 hover:bg-violet-600 text-white rounded transition-colors flex-1 disabled:opacity-40"
            >
              Push
            </button>
            <button
              onClick={loadStatus}
              className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
            >
              ↻
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800">
          {(['changes', 'branches', 'prs'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 text-xs py-2 capitalize transition-colors ${
                tab === t
                  ? 'text-slate-100 border-b-2 border-violet-500'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
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
                <div className="mb-2">
                  <div className="text-xs text-slate-500 uppercase tracking-wide px-1 mb-1">
                    Staged ({status?.staged.length})
                  </div>
                  {status?.staged.map((f) => (
                    <div
                      key={f}
                      className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer hover:bg-slate-700 ${
                        selectedFile === f ? 'bg-slate-700' : ''
                      }`}
                      onClick={() => handleSelectFile(f)}
                    >
                      <span className="text-emerald-400 text-xs">M</span>
                      <span className="text-xs text-slate-300 flex-1 truncate">{f}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUnstage([f]) }}
                        className="text-xs text-slate-500 hover:text-slate-200"
                      >
                        −
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Changes */}
              {allChangedFiles.filter((f) => !f.staged).length > 0 && (
                <div className="mb-2">
                  <div className="flex items-center justify-between px-1 mb-1">
                    <span className="text-xs text-slate-500 uppercase tracking-wide">
                      Changes ({allChangedFiles.filter((f) => !f.staged).length})
                    </span>
                    <button
                      onClick={() =>
                        handleStage(allChangedFiles.filter((f) => !f.staged).map((f) => f.file))
                      }
                      className="text-xs text-slate-500 hover:text-slate-200"
                    >
                      Stage all +
                    </button>
                  </div>
                  {allChangedFiles
                    .filter((f) => !f.staged)
                    .map(({ file }) => (
                      <div
                        key={file}
                        className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer hover:bg-slate-700 ${
                          selectedFile === file ? 'bg-slate-700' : ''
                        }`}
                        onClick={() => handleSelectFile(file)}
                      >
                        <span className="text-amber-400 text-xs">M</span>
                        <span className="text-xs text-slate-300 flex-1 truncate">{file}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleStage([file]) }}
                          className="text-xs text-slate-500 hover:text-slate-200"
                        >
                          +
                        </button>
                      </div>
                    ))}
                </div>
              )}

              {allChangedFiles.length === 0 && (
                <div className="text-xs text-slate-600 text-center mt-6">No changes</div>
              )}

              {/* Commit */}
              {(status?.staged ?? []).length > 0 && (
                <div className="mt-3 px-1">
                  <textarea
                    value={commitMsg}
                    onChange={(e) => setCommitMsg(e.target.value)}
                    placeholder="Commit message…"
                    rows={2}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100 placeholder-slate-500 resize-none focus:outline-none focus:border-violet-500 mb-2"
                  />
                  <button
                    onClick={handleCommit}
                    disabled={!commitMsg.trim() || loading}
                    className="w-full text-xs py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded transition-colors"
                  >
                    Commit
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'branches' && (
            <div className="p-2">
              <div className="flex gap-1 mb-2">
                <input
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  placeholder="New branch name…"
                  className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500"
                />
                <button
                  onClick={handleCreateBranch}
                  disabled={!newBranch.trim()}
                  className="text-xs px-2 py-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded transition-colors"
                >
                  +
                </button>
              </div>
              {branches
                .filter((b) => !b.name.startsWith('remotes/'))
                .map((b) => (
                  <button
                    key={b.name}
                    onClick={() => !b.current && handleCheckout(b.name)}
                    className={`
                      w-full flex items-center gap-2 px-2 py-1.5 rounded text-left
                      ${b.current ? 'bg-violet-900/30 text-violet-300' : 'hover:bg-slate-700 text-slate-300'}
                    `}
                  >
                    <span className={b.current ? 'text-violet-400' : 'text-slate-600'}>
                      {b.current ? '●' : '○'}
                    </span>
                    <span className="text-xs truncate">{b.name}</span>
                  </button>
                ))}
            </div>
          )}

          {tab === 'prs' && (
            <div className="p-2">
              {prs.length === 0 ? (
                <div className="text-xs text-slate-600 text-center mt-6">No open PRs</div>
              ) : (
                prs.map((pr) => (
                  <div key={pr.number} className="mb-2 p-2 bg-slate-800 rounded-lg border border-slate-700">
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-slate-500 shrink-0">#{pr.number}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-slate-200 leading-snug">{pr.title}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {pr.head} → {pr.base}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => window.electronAPI.system.openExternal(pr.url)}
                      className="mt-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      Open on GitHub →
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Diff viewer */}
      <div className="flex-1 overflow-y-auto p-4 font-mono">
        {diff ? (
          <pre className="text-xs leading-relaxed whitespace-pre-wrap">
            {diff.split('\n').map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith('+')
                    ? 'text-emerald-400'
                    : line.startsWith('-')
                      ? 'text-red-400'
                      : line.startsWith('@@')
                        ? 'text-violet-400'
                        : 'text-slate-400'
                }
              >
                {line}
              </div>
            ))}
          </pre>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-600 text-sm">
            Select a file to see its diff
          </div>
        )}
      </div>
    </div>
  )
}
