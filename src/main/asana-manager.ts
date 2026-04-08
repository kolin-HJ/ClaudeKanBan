import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { net } from 'electron'

const ASANA_BASE = 'https://app.asana.com/api/1.0'

export interface AsanaWorkspace {
  gid: string
  name: string
}

export interface AsanaProject {
  gid: string
  name: string
  color?: string
  workspaceGid: string
}

export interface AsanaSection {
  gid: string
  name: string
}

export interface AsanaTask {
  gid: string
  name: string
  notes: string
  completed: boolean
  dueOn?: string
  assignee?: { gid: string; name: string }
  projects?: { gid: string; name: string }[]
  tags?: { gid: string; name: string }[]
  memberships?: { section?: { gid: string; name: string } }[]
  permalink_url?: string
  createdAt?: string
  modifiedAt?: string
}

export class AsanaManager {
  private token: string | null = null

  constructor() {
    this.token = this.readToken()
  }

  private readToken(): string | null {
    if (process.env.ASANA_TOKEN) return process.env.ASANA_TOKEN

    const tokenPath = join(homedir(), '.claude', 'asana-token')
    if (existsSync(tokenPath)) {
      return readFileSync(tokenPath, 'utf-8').trim()
    }
    return null
  }

  setToken(token: string): void {
    this.token = token
    // Persist to disk
    const claudeDir = join(homedir(), '.claude')
    mkdirSync(claudeDir, { recursive: true })
    writeFileSync(join(claudeDir, 'asana-token'), token, 'utf-8')
  }

  getToken(): string | null {
    return this.token
  }

  isConfigured(): boolean {
    return !!this.token
  }

  private async request(path: string, options: { method?: string; body?: any } = {}): Promise<any> {
    if (!this.token) throw new Error('Asana not configured. Add your Personal Access Token in Settings.')

    const url = `${ASANA_BASE}${path}`
    const method = options.method ?? 'GET'

    return new Promise((resolve, reject) => {
      const request = net.request({
        url,
        method
      })

      request.setHeader('Authorization', `Bearer ${this.token}`)
      request.setHeader('Accept', 'application/json')

      if (options.body) {
        request.setHeader('Content-Type', 'application/json')
      }

      let responseData = ''

      request.on('response', (response) => {
        response.on('data', (chunk: Buffer) => {
          responseData += chunk.toString()
        })

        response.on('end', () => {
          try {
            const parsed = JSON.parse(responseData)
            if (response.statusCode && response.statusCode >= 400) {
              const errMsg = parsed?.errors?.[0]?.message ?? `HTTP ${response.statusCode}`
              reject(new Error(`Asana API error: ${errMsg}`))
            } else {
              resolve(parsed)
            }
          } catch {
            reject(new Error(`Invalid JSON response from Asana`))
          }
        })

        response.on('error', reject)
      })

      request.on('error', reject)

      if (options.body) {
        request.write(JSON.stringify(options.body))
      }

      request.end()
    })
  }

  // ─── Workspaces ──────────────────────────────────────────────────────────

  async listWorkspaces(): Promise<AsanaWorkspace[]> {
    const res = await this.request('/workspaces?opt_fields=name')
    return (res.data ?? []).map((w: any) => ({
      gid: w.gid,
      name: w.name
    }))
  }

  // ─── Projects ────────────────────────────────────────────────────────────

  async listProjects(workspaceGid: string): Promise<AsanaProject[]> {
    const res = await this.request(
      `/workspaces/${workspaceGid}/projects?opt_fields=name,color&limit=100`
    )
    return (res.data ?? []).map((p: any) => ({
      gid: p.gid,
      name: p.name,
      color: p.color,
      workspaceGid
    }))
  }

  // ─── Sections ────────────────────────────────────────────────────────────

  async listSections(projectGid: string): Promise<AsanaSection[]> {
    const res = await this.request(`/projects/${projectGid}/sections?opt_fields=name`)
    return (res.data ?? []).map((s: any) => ({
      gid: s.gid,
      name: s.name
    }))
  }

  // ─── Tasks ───────────────────────────────────────────────────────────────

  async listTasks(projectGid: string, completedSince?: string): Promise<AsanaTask[]> {
    const fields = 'name,notes,completed,due_on,assignee.name,tags.name,memberships.section.name,permalink_url,created_at,modified_at'
    let url = `/projects/${projectGid}/tasks?opt_fields=${fields}&limit=100`
    if (completedSince) {
      url += `&completed_since=${completedSince}`
    } else {
      // By default only get incomplete tasks
      url += '&completed_since=now'
    }
    const res = await this.request(url)
    return (res.data ?? []).map(this.mapTask)
  }

  async listSectionTasks(sectionGid: string): Promise<AsanaTask[]> {
    const fields = 'name,notes,completed,due_on,assignee.name,tags.name,permalink_url,created_at,modified_at'
    const res = await this.request(
      `/sections/${sectionGid}/tasks?opt_fields=${fields}&limit=100`
    )
    return (res.data ?? []).map(this.mapTask)
  }

  async getTask(taskGid: string): Promise<AsanaTask> {
    const fields = 'name,notes,completed,due_on,assignee.name,projects.name,tags.name,memberships.section.name,permalink_url,created_at,modified_at'
    const res = await this.request(`/tasks/${taskGid}?opt_fields=${fields}`)
    return this.mapTask(res.data)
  }

  async completeTask(taskGid: string): Promise<void> {
    await this.request(`/tasks/${taskGid}`, {
      method: 'PUT',
      body: { data: { completed: true } }
    })
  }

  async addComment(taskGid: string, text: string): Promise<void> {
    await this.request(`/tasks/${taskGid}/stories`, {
      method: 'POST',
      body: { data: { text } }
    })
  }

  // ─── Verify connection ──────────────────────────────────────────────────

  async verifyConnection(): Promise<{ ok: boolean; name?: string; email?: string; error?: string }> {
    try {
      const res = await this.request('/users/me?opt_fields=name,email')
      return { ok: true, name: res.data?.name, email: res.data?.email }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private mapTask(t: any): AsanaTask {
    return {
      gid: t.gid,
      name: t.name,
      notes: t.notes ?? '',
      completed: t.completed ?? false,
      dueOn: t.due_on,
      assignee: t.assignee ? { gid: t.assignee.gid, name: t.assignee.name } : undefined,
      projects: t.projects?.map((p: any) => ({ gid: p.gid, name: p.name })),
      tags: t.tags?.map((tag: any) => ({ gid: tag.gid, name: tag.name })),
      memberships: t.memberships?.map((m: any) => ({
        section: m.section ? { gid: m.section.gid, name: m.section.name } : undefined
      })),
      permalink_url: t.permalink_url,
      createdAt: t.created_at,
      modifiedAt: t.modified_at
    }
  }
}
