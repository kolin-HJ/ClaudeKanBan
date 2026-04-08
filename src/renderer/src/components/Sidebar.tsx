import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LayoutGrid, Zap, BookOpen, Brain, GitBranch, BarChart3, Settings } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { cn } from '../lib/utils'

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { activeProject } = useProjectStore()
  const project = activeProject()
  const [expanded, setExpanded] = useState(true)

  const navItems = [
    { id: 'board', label: 'Board', icon: LayoutGrid },
    { id: 'skills', label: 'Skills', icon: Zap },
    { id: 'docs', label: 'Docs', icon: BookOpen },
    { id: 'memory', label: 'Memory', icon: Brain },
    { id: 'git', label: 'Git', icon: GitBranch },
    { id: 'usage', label: 'Usage', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings }
  ]

  const isActive = (id: string) => location.pathname.includes(id)

  const handleNavClick = (id: string) => {
    navigate(`/${id}`)
  }

  return (
    <div className={cn(
      'flex flex-col border-r border-border bg-background transition-all',
      expanded ? 'w-48' : 'w-16'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-12 border-b border-border shrink-0">
        {expanded && <span className="text-xs font-semibold text-foreground">ClaudeKanBan</span>}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? '«' : '»'}
        </button>
      </div>

      {/* Project info */}
      {project && (
        <div className={cn(
          'px-3 py-2 border-b border-border text-xs',
          expanded ? '' : 'text-center'
        )}>
          <div className="text-muted-foreground truncate">
            {expanded ? project.name : project.name.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => handleNavClick(id)}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors',
              isActive(id)
                ? 'bg-primary/10 text-primary border-r-2 border-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            )}
            title={!expanded ? label : undefined}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {expanded && <span>{label}</span>}
          </button>
        ))}
      </nav>
    </div>
  )
}
