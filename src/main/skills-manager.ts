import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync
} from 'fs'
import { join, basename, extname } from 'path'
import { homedir } from 'os'
import { Skill } from '../shared/types'

export class SkillsManager {
  private globalSkillsDir(): string {
    return join(homedir(), '.claude', 'skills')
  }

  private projectSkillsDir(projectPath: string): string {
    return join(projectPath, '.claude', 'skills')
  }

  list(projectPath?: string): Skill[] {
    const skills: Skill[] = []
    const seen = new Set<string>()

    // Load global skills
    const globalDir = this.globalSkillsDir()
    if (existsSync(globalDir)) {
      for (const file of readdirSync(globalDir)) {
        if (extname(file) !== '.md') continue
        const filePath = join(globalDir, file)
        if (!seen.has(filePath)) {
          seen.add(filePath)
          skills.push(this.parseSkillFile(filePath))
        }
      }
    }

    // Load project-specific skills (override globals with same name)
    if (projectPath) {
      const projectDir = this.projectSkillsDir(projectPath)
      if (existsSync(projectDir)) {
        for (const file of readdirSync(projectDir)) {
          if (extname(file) !== '.md') continue
          const filePath = join(projectDir, file)
          if (!seen.has(filePath)) {
            seen.add(filePath)
            skills.push(this.parseSkillFile(filePath))
          }
        }
      }
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name))
  }

  read(filePath: string): string {
    if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`)
    return readFileSync(filePath, 'utf-8')
  }

  update(filePath: string, content: string): void {
    mkdirSync(require('path').dirname(filePath), { recursive: true })
    writeFileSync(filePath, content, 'utf-8')
  }

  create(name: string, content: string, targetDir: string): Skill {
    mkdirSync(targetDir, { recursive: true })
    const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()
    const filePath = join(targetDir, `${safeName}.md`)
    writeFileSync(filePath, content, 'utf-8')
    return this.parseSkillFile(filePath)
  }

  async fetchFromUrl(url: string): Promise<string> {
    // Convert GitHub blob URLs to raw URLs
    const rawUrl = this.toRawGitHubUrl(url)

    const response = await fetch(rawUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }

  private toRawGitHubUrl(url: string): string {
    // https://github.com/owner/repo/blob/branch/path/to/file.md
    // → https://raw.githubusercontent.com/owner/repo/branch/path/to/file.md
    return url.replace(
      /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/,
      'https://raw.githubusercontent.com/$1/$2/$3'
    )
  }

  private parseSkillFile(filePath: string): Skill {
    let content = ''
    try {
      content = readFileSync(filePath, 'utf-8')
    } catch {
      content = ''
    }

    const { name, category, referenceFiles } = this.parseFrontmatter(content, filePath)

    return {
      name,
      filePath,
      content,
      category,
      referenceFiles
    }
  }

  private parseFrontmatter(
    content: string,
    filePath: string
  ): { name: string; category?: string; referenceFiles: string[] } {
    const defaultName = basename(filePath, '.md')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())

    // Check for YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
    if (!frontmatterMatch) {
      return { name: defaultName, referenceFiles: [] }
    }

    const fm = frontmatterMatch[1]

    const nameMatch = fm.match(/^name:\s*(.+)$/m)
    const categoryMatch = fm.match(/^category:\s*(.+)$/m)
    const refsMatch = fm.match(/^reference_files:\s*\[(.*?)\]/m)
    const refsListMatch = fm.match(/^reference_files:\s*\n((?:\s+-\s*.+\n?)+)/m)

    const name = nameMatch?.[1]?.trim() ?? defaultName
    const category = categoryMatch?.[1]?.trim()

    let referenceFiles: string[] = []
    if (refsMatch?.[1]) {
      referenceFiles = refsMatch[1]
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    } else if (refsListMatch?.[1]) {
      referenceFiles = refsListMatch[1]
        .split('\n')
        .map((s) => s.replace(/^\s+-\s*/, '').trim())
        .filter(Boolean)
    }

    return { name, category, referenceFiles }
  }
}
