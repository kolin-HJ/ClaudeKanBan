import { Octokit } from '@octokit/rest'
import { PullRequest } from '../shared/types'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export class GithubManager {
  private octokit: Octokit | null = null

  private getOctokit(): Octokit {
    if (!this.octokit) {
      const token = this.readToken()
      this.octokit = new Octokit({ auth: token ?? undefined })
    }
    return this.octokit
  }

  private readToken(): string | null {
    // Check env var first
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN

    // Fall back to ~/.claude/github-token
    const tokenPath = join(homedir(), '.claude', 'github-token')
    if (existsSync(tokenPath)) {
      return readFileSync(tokenPath, 'utf-8').trim()
    }

    return null
  }

  // Allow the token to be updated at runtime (from Settings page)
  setToken(token: string): void {
    this.octokit = new Octokit({ auth: token })
  }

  /** Parse "owner/repo" from a GitHub remote URL */
  private parseRemote(remoteUrl: string): { owner: string; repo: string } | null {
    // Handle both HTTPS and SSH formats
    const https = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
    if (!https) return null
    return { owner: https[1], repo: https[2].replace(/\.git$/, '') }
  }

  async listPRs(remoteUrl: string): Promise<PullRequest[]> {
    const parsed = this.parseRemote(remoteUrl)
    if (!parsed) return []

    const { data } = await this.getOctokit().pulls.list({
      ...parsed,
      state: 'open',
      per_page: 50
    })

    return data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      url: pr.html_url,
      head: pr.head.ref,
      base: pr.base.ref,
      author: pr.user?.login ?? '',
      createdAt: pr.created_at
    }))
  }

  async createPR(
    remoteUrl: string,
    opts: { title: string; body?: string; head: string; base: string }
  ): Promise<PullRequest> {
    const parsed = this.parseRemote(remoteUrl)
    if (!parsed) throw new Error('Could not parse GitHub remote URL')

    const { data } = await this.getOctokit().pulls.create({
      ...parsed,
      title: opts.title,
      body: opts.body ?? '',
      head: opts.head,
      base: opts.base
    })

    return {
      number: data.number,
      title: data.title,
      state: data.state,
      url: data.html_url,
      head: data.head.ref,
      base: data.base.ref,
      author: data.user?.login ?? '',
      createdAt: data.created_at
    }
  }

  async listIssues(remoteUrl: string): Promise<any[]> {
    const parsed = this.parseRemote(remoteUrl)
    if (!parsed) return []

    const { data } = await this.getOctokit().issues.listForRepo({
      ...parsed,
      state: 'open',
      per_page: 50
    })

    return data
      .filter((i) => !i.pull_request) // Exclude PRs from issues list
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        url: issue.html_url,
        author: issue.user?.login ?? '',
        labels: issue.labels.map((l: any) => (typeof l === 'string' ? l : l.name)),
        createdAt: issue.created_at
      }))
  }
}
