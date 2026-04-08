import simpleGit, { SimpleGit } from 'simple-git'
import { GitStatus, Branch } from '../shared/types'

export class GitManager {
  private git(cwd: string): SimpleGit {
    return simpleGit({ baseDir: cwd, binary: 'git', maxConcurrentProcesses: 4 })
  }

  async status(projectPath: string): Promise<GitStatus> {
    const git = this.git(projectPath)
    const s = await git.status()
    return {
      current: s.current ?? 'HEAD',
      tracking: s.tracking ?? undefined,
      ahead: s.ahead,
      behind: s.behind,
      staged: s.staged,
      modified: s.modified,
      untracked: s.not_added,
      conflicted: s.conflicted
    }
  }

  async diff(projectPath: string, filePath?: string): Promise<string> {
    const git = this.git(projectPath)
    if (filePath) {
      return git.diff([filePath])
    }
    return git.diff()
  }

  async stage(projectPath: string, files: string[]): Promise<void> {
    await this.git(projectPath).add(files)
  }

  async unstage(projectPath: string, files: string[]): Promise<void> {
    await this.git(projectPath).reset(['HEAD', '--', ...files])
  }

  async commit(projectPath: string, message: string): Promise<void> {
    await this.git(projectPath).commit(message)
  }

  async push(projectPath: string): Promise<void> {
    await this.git(projectPath).push()
  }

  async pull(projectPath: string): Promise<void> {
    await this.git(projectPath).pull()
  }

  async branches(projectPath: string): Promise<Branch[]> {
    const summary = await this.git(projectPath).branch(['-a'])
    return Object.values(summary.branches).map((b) => ({
      name: b.name,
      current: b.current,
      remote: b.name.startsWith('remotes/') ? b.name : undefined
    }))
  }

  async createBranch(projectPath: string, name: string): Promise<void> {
    await this.git(projectPath).checkoutLocalBranch(name)
  }

  async checkout(projectPath: string, branch: string): Promise<void> {
    await this.git(projectPath).checkout(branch)
  }

  async getRemote(projectPath: string): Promise<string | null> {
    try {
      const git = this.git(projectPath)
      const remotes = await git.getRemotes(true)
      const origin = remotes.find((r) => r.name === 'origin')
      return origin?.refs?.fetch ?? null
    } catch {
      return null
    }
  }
}
