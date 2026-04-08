# ClaudeKanBan

**The Claude Code Overseer & Manager** -- a desktop app that turns Claude Code into a managed, observable, multi-project AI engineering platform.

Stop staring at terminals. Start managing agents.

---

## Why ClaudeKanBan

Running Claude Code in a terminal is powerful for single tasks. But when you're managing multiple projects, running parallel sessions, and need to understand where your tokens are going -- you need something more.

ClaudeKanBan wraps Claude Code sessions in a goal-driven Kanban board with full usage analytics, persistent memory, session insights, security monitoring, and multi-project workspace management.

---

## Features

### Core: Goal-Based Session Management
- **Kanban board** with 3 columns: Your Turn / Claude's Turn / Done
- **Multi-turn conversations** -- sessions stay alive for back-and-forth dialogue
- **Task depth levels** -- Quick (one-shot), Campaign (multi-step), Deep Build (phased planning + execution)
- **Permission modes** -- Default (confirms actions) or Full Auto (`--dangerously-skip-permissions`)
- **Auto-start** -- create a goal and launch Claude in one click

### Usage Tracking & Token Analytics
- **Live status bar** showing active sessions, token counts, and real-time cost estimates
- **Weekly/daily usage dashboards** with bar charts and trend analysis
- **Tool frequency analysis** -- see which tools (Read, Edit, Bash, etc.) Claude uses most
- **Per-project and per-session cost breakdowns**
- **Cost anomaly detection** -- alerts when a session costs 5x+ above the project average

### Session Insights & Learnings
- **Auto-generated insights** on session completion: token breakdown, tools used, files touched, duration
- **Learning extraction** -- key decisions and patterns auto-captured from Claude's messages
- **Promote to Memory** -- save any extracted learning as a permanent project memory with one click
- **Session history** with expandable detail cards

### Persistent Memory System
- **FTS5 full-text search** across all project memories
- **Auto-capture** learnings from completed sessions
- **Memory consolidation** -- merge duplicate/similar memories (Jaccard similarity)
- **Relevance decay** -- old unreferenced memories gradually lose weight
- **Cross-project patterns** -- high-relevance patterns shared globally across all projects
- **Import/Export** memories as JSON for backup or sharing
- **Memory types**: Project Context, Task Learning, Feedback, Pattern, Blocker
- **Categories**: Architecture, Convention, Debugging, Performance, Brand Voice, Workflow, Dependency

### Per-Project Plugin/Skill System
- **Skill files** (`.md`) managed per-project with toggle activation
- **Per-project configuration** -- enable/disable skills per project with priority ordering
- **Active skills auto-injected** into Claude session context on spawn
- **Fetch from URL** -- import skills directly from GitHub
- **Global + local scopes** -- `~/.claude/skills/` (all projects) and `<project>/.claude/skills/`

### Git Worktree Isolation
- **Optional per-task worktrees** -- each session gets its own git branch (`task/<id>`)
- Prevents merge conflicts when running parallel agents on the same project
- Toggle on/off in Settings
- Falls back gracefully if worktree creation fails

### Multi-Project Workspace
- **Project tabs** with per-tab state persistence (current page, selected task, scroll position)
- **Session status indicators** on tabs: green = running, yellow = waiting input
- **Right-click context menu**: Close, Close Others, Close to Right
- **Keyboard shortcuts**: `Ctrl+Tab` / `Ctrl+Shift+Tab` to cycle, `Ctrl+W` to close

### Security Posture Scoring
- **Per-session security score** (0-100) based on:
  - Dangerous tool usage (`rm -rf`, `sudo`, `curl | sh`)
  - Secret exposure detection (API keys, tokens, private keys in tool inputs)
  - Permission mode (full-auto sessions score lower)
- **Project-level security history**
- Regex patterns for: GitHub tokens, OpenAI keys, AWS credentials, private keys

### Session Checkpointing
- **Auto-checkpoints** every 50k tokens
- Final checkpoint on session completion
- Captures: token counts, tools used, files created/read, security flags
- Foundation for future session time-travel / replay

### Native OS Notifications
- **Desktop notifications** on session complete, error, or termination
- Shows duration, token count, and cost
- Cost anomaly alerts also trigger notifications

### Built-in Git Panel
- Stage/unstage, commit, push, pull, branch, checkout
- View diffs per file
- Create branches

### GitHub Integration
- List open PRs and issues
- Create PRs from within the app
- Auto-detects GitHub remote on project creation

### Documentation Manager
- Edit `CLAUDE.md`, `README.md`, `brand.md`, `context.md` per project
- Live markdown rendering

---

## Requirements

- **Node.js** 18+
- **Claude Code CLI** installed and on your PATH (`claude --version` should work)
- **Git** (for git features and worktree isolation)
- **GitHub Personal Access Token** with `repo` scope (optional, for PR features)

---

## Quick Start

```bash
git clone https://github.com/kolin-HJ/ClaudeKanBan.git
cd ClaudeKanBan
npm install
npm run dev
```

No database setup needed. SQLite database auto-created on first launch.

---

## Build & Distribute

```bash
npm run build        # Compile to out/
npm run dist         # Build distributable (NSIS installer for Windows, DMG for macOS, AppImage for Linux)
```

---

## Usage

### 1. Add a Project
Click **+ Add Project** in the tab bar, browse to any local git repository.

### 2. Create a Goal
Click **+ New Goal** on the board. Describe what you want Claude to do, pick a depth and permission level. Check "Start immediately" to launch the session.

### 3. Converse
Click any card to open the detail panel. Claude's responses stream in real time. Type your reply and press `Ctrl+Enter`.

### 4. Track Usage
Switch to the **Usage** tab to see token consumption, costs, tool frequency, and session insights. The live status bar at the bottom always shows active session counts and weekly totals.

### 5. Manage Memory
The **Memory** tab shows all stored observations. Add memories manually or let the system auto-capture learnings. Use **Consolidate** to merge duplicates, **Export/Import** for backups.

### 6. Configure Skills
The **Skills** tab shows available skills with per-project toggle switches. Active skills are automatically included in Claude's context when sessions start.

---

## Architecture

```
src/
├── main/                       # Electron main process (Node.js)
│   ├── index.ts                # App init, window, process cleanup
│   ├── claude-manager.ts       # Claude CLI subprocess management, usage tracking,
│   │                           # notifications, checkpointing, security scanning
│   ├── ipc-handlers.ts         # 40+ IPC request handlers organized by domain
│   ├── insights-manager.ts     # Post-session insight generation + learning extraction
│   ├── memory-manager.ts       # FTS5 memory CRUD, consolidation, decay, cross-project
│   ├── skills-manager.ts       # Skill .md file I/O with frontmatter parsing
│   ├── git-manager.ts          # simple-git wrapper
│   ├── github-manager.ts       # Octokit PR/issue API
│   └── db.ts                   # SQLite init + versioned migrations
├── preload/
│   └── index.ts                # contextBridge IPC API (12 namespaces, 60+ methods)
├── renderer/src/
│   ├── App.tsx                 # Root layout with error boundary, status bar, event wiring
│   ├── pages/                  # Board, Skills, Docs, Memory, Usage, GitView, Outputs, Settings
│   ├── components/             # KanbanBoard, TaskDetailPanel, ProjectTabs, Sidebar,
│   │                           # UsageStatusBar, ErrorBoundary, CreateTaskModal, OutputPreview
│   └── store/                  # Zustand stores: project, task, ui, usage
└── shared/
    └── types.ts                # 20+ interfaces, 50+ IPC channel constants
```

### Database Schema (SQLite + WAL + FTS5)

| Table | Purpose |
|-------|---------|
| `projects` | Project metadata + GitHub remote |
| `tasks` | Goals with status, depth, permission |
| `messages` | Conversation history (user/claude) |
| `outputs` | File artifacts with previews |
| `memories` | Project knowledge with FTS5 search |
| `sessions` | Usage records (tokens, cost, duration) |
| `tool_usage` | Every tool call with inputs |
| `context_events` | Files read, searches, bash commands |
| `session_insights` | Post-session analytics |
| `session_checkpoints` | Periodic state snapshots |
| `security_scores` | Per-session security posture |
| `project_skills` | Per-project skill activation |
| `app_settings` | Key-value app configuration |

---

## Tech Stack

| Layer | Library |
|-------|---------|
| Desktop shell | Electron 33 + electron-vite |
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS 3 |
| State management | Zustand |
| Database | SQLite via better-sqlite3 (WAL + FTS5) |
| Git operations | simple-git |
| GitHub API | @octokit/rest |
| Markdown | react-markdown + remark-gfm |
| IDs | uuid v4 |

---

## Configuration

| Location | Purpose |
|----------|---------|
| `<userData>/app.db` | App database (all tables) |
| `~/.claude/github-token` | GitHub personal access token |
| `~/.claude/settings.json` | Claude Code hooks/scheduled tasks |
| `~/.claude/skills/` | Global skills (all projects) |
| `<project>/.claude/skills/` | Project-local skills |
| `<project>/.claude/memories.md` | Auto-generated memory file |
| `<project>/.worktrees/` | Git worktrees for isolated sessions |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Send message in task panel |
| `Ctrl+Tab` | Next project tab |
| `Ctrl+Shift+Tab` | Previous project tab |
| `Ctrl+W` | Close current project tab |
| `Esc` | Close modal / deselect task |

---

## Contributing

Pull requests welcome. Please open an issue first for significant changes.

---

## License

MIT
