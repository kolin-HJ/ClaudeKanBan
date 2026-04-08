import { LayoutGrid, Zap, BookOpen, Brain, GitBranch, FolderOpen, Settings } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { cn } from '../lib/utils'

type NavItem = {
  id: 'board' | 'skills' | 'docs' | 'memory' | 'git' | 'outputs' | 'settings'
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const navItems: NavItem[] = [
  { id: 'board', label: 'Board', icon: LayoutGrid },
  { id: 'skills', label: 'Skills', icon: Zap },
  { id: 'docs', label: 'Docs', icon: BookOpen },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'git', label: 'Git', icon: GitBranch },
  { id: 'outputs', label: 'Outputs', icon: FolderOpen }
]

export default function Sidebar() {
  const { currentPage, setPage } = useUiStore()

  const NavButton = ({ item }: { item: NavItem }) => {
    const Icon = item.icon
    const active = currentPage === item.id
    return (
      <button
        onClick={() => setPage(item.id)}
        title={item.label}
        className={cn(
          'no-drag w-9 h-9 rounded-md flex items-center justify-center transition-colors cursor-pointer',
          active
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        )}
      >
        <Icon className="w-4 h-4" />
      </button>
    )
  }

  return (
    <aside className="w-13 flex flex-col items-center bg-[hsl(0,0%,5%)] border-r border-border py-2 pt-10 gap-1 shrink-0" style={{ width: '52px' }}>
      {navItems.map((item) => (
        <NavButton key={item.id} item={item} />
      ))}

      <div className="flex-1" />

      <button
        onClick={() => setPage('settings')}
        title="Settings"
        className={cn(
          'no-drag w-9 h-9 rounded-md flex items-center justify-center transition-colors cursor-pointer',
          currentPage === 'settings'
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        )}
      >
        <Settings className="w-4 h-4" />
      </button>
    </aside>
  )
}
