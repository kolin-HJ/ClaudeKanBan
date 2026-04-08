# ClaudeKanBan

A local desktop app for managing [Claude Code](https://claude.ai/code) sessions like a project owner, not a developer.

Stop staring at terminals. Start managing goals.

![ClaudeKanBan screenshot placeholder](docs/screenshot.png)

---

## What it does

ClaudeKanBan wraps Claude Code sessions in a Kanban board that maps naturally to the back-and-forth rhythm of AI-assisted work:

| Column | Meaning |
|--------|---------|
| **Your Turn** | Claude finished — you need to review or reply |
| **Claude's Turn** | Active session running, Claude is working |
| **Done** | Goal completed |

Each card is a *goal*, not a file. You describe what you want, Claude works on it in your project directory, and the card moves as the conversation progresses.

---

## Features

- **Project tabs** — each project links to a local git repo; sessions run in that directory
- **Goal-oriented Kanban** — create goals with a depth level (Quick / Campaign / Deep Build) and a permission mode
- **Live session streaming** — Claude's `stream-json` output is parsed and displayed in real time
- **Memory system** — per-project SQLite + FTS5 index of observations; injected as context at session start
- **Skills manager** — view, edit, and create Claude skill `.md` files with full markdown rendering
- **Docs manager** — edit `CLAUDE.md`, `brand.md`, `context.md`, and `README.md` directly in the app
- **Git panel** — stage, commit, push, pull, branch, and checkout without leaving the app
- **GitHub integration** — list open PRs, create PRs, list issues
- **Scheduled tasks** — view and manage Claude Code cron hooks from `~/.claude/settings.json`
- **Recent outputs** — browse and preview all files generated across tasks

---

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [Claude Code CLI](https://claude.ai/code) installed and authenticated (`claude` must be on your PATH)
- Git (for git features)
- A GitHub Personal Access Token with `repo` scope (optional, for PR features)

---

## Install

```bash
git clone https://github.com/your-username/ClaudeKanBan.git
cd ClaudeKanBan
npm install
npm run dev
```

That's it. No database setup, no environment config required. The app creates `~/.claude/claudekanban.db` on first run.

---

## Build

```bash
npm run build
```

Produces a Windows NSIS installer in `dist/`. The app bundles its own SQLite binary — no system dependencies needed.

---

## Usage

### Add a project

1. Click **+ Add Project** in the tab bar
2. Browse to any local git repository
3. The project is ready — tasks you create will run Claude sessions in that folder

### Create a goal

1. Click **+ New Goal** on the board
2. Write what you want Claude to do
3. Choose a depth:
   - **Quick** — single-shot task (blog post, code review, quick script)
   - **Campaign** — multi-turn conversation with a clear end state
   - **Deep Build** — phased project (plan → implement → test)
4. Choose a permission mode:
   - **Default** — Claude asks before modifying files
   - **Full Auto** — Claude proceeds without confirmation (`--dangerously-skip-permissions`)
5. Optionally check **Start immediately** to spawn the session right away

### Reply to Claude

Click any card to open the detail panel. Type your message and press **Ctrl+Enter** (or click Send).

### Memory

Switch to the **Memory** tab to see all observations stored for the active project. Add memories manually ("this project uses Supabase Edge Functions, not API routes"), or capture them automatically after a task completes.

Memories are injected into every new Claude session as a context block, so Claude always knows the important project-specific facts.

### Skills

Switch to the **Skills** tab to manage reusable `.md` skills from `~/.claude/skills/` and `<project>/.claude/skills/`. Skills are rendered as formatted markdown, not raw text. You can:
- Edit any skill in-place and save directly to disk
- Add a skill by pasting a GitHub URL (fetched automatically)
- Write a description and generate a skill using Claude

### Git

Switch to the **Git** tab for a VS Code-style source control panel:
- See staged and unstaged changes side by side
- Click any file to view its diff
- Stage/unstage individual files or all at once
- Write a commit message and commit
- Push, pull, create branches, checkout

---

## Project structure

```
src/
├── main/               # Electron main process
│   ├── index.ts        # App init, window creation
│   ├── ipc-handlers.ts # All IPC request handlers
│   ├── claude-manager.ts   # Spawn & monitor claude CLI processes
│   ├── git-manager.ts      # simple-git wrapper
│   ├── github-manager.ts   # Octokit PR/issue calls
│   ├── memory-manager.ts   # SQLite FTS5 memory CRUD
│   ├── skills-manager.ts   # Read/write skill .md files
│   └── db.ts               # SQLite connection + migrations
├── preload/
│   └── index.ts        # contextBridge IPC API
├── renderer/src/
│   ├── App.tsx
│   ├── components/     # KanbanBoard, TaskCard, TaskDetailPanel, …
│   ├── pages/          # Board, Skills, Docs, Memory, GitView, Outputs, Settings
│   └── store/          # Zustand stores (project, task, ui)
└── shared/
    └── types.ts        # Shared TypeScript types
```

---

## Tech stack

| Layer | Library |
|-------|---------|
| App shell | Electron 30 + electron-vite |
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| State | Zustand |
| Database | SQLite via better-sqlite3 (WAL + FTS5) |
| Git | simple-git |
| GitHub API | @octokit/rest |
| Markdown | react-markdown + remark-gfm |
| File watch | chokidar |

---

## Configuration

| Location | Purpose |
|----------|---------|
| `~/.claude/claudekanban.db` | App database (projects, tasks, messages, memories) |
| `~/.claude/github-token` | GitHub personal access token |
| `~/.claude/skills/` | Global skills available to all projects |
| `<project>/.claude/skills/` | Project-local skills |
| `<project>/.claude/memories.md` | Memory context file written for standalone Claude sessions |

---

## Contributing

Pull requests welcome. Please open an issue first for significant changes.

---

## License

MIT
