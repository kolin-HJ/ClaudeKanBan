import { useUiStore, Page } from '../store/uiStore'

type NavItem = {
  id: Page
  label: string
  icon: string
}

const navItems: NavItem[] = [
  { id: 'board', label: 'Board', icon: '⊞' },
  { id: 'skills', label: 'Skills', icon: '⚡' },
  { id: 'docs', label: 'Docs', icon: '📄' },
  { id: 'memory', label: 'Memory', icon: '🧠' },
  { id: 'usage', label: 'Usage', icon: '📊' },
  { id: 'git', label: 'Git', icon: '⑂' },
  { id: 'outputs', label: 'Outputs', icon: '📁' }
]

export default function Sidebar() {
  const { currentPage, setPage } = useUiStore()

  return (
    <aside className="w-14 flex flex-col items-center bg-slate-950 border-r border-slate-800 py-2 pt-10 gap-1 shrink-0">
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => setPage(item.id)}
          title={item.label}
          className={`
            no-drag w-10 h-10 rounded-lg flex flex-col items-center justify-center text-xs gap-0.5
            transition-colors cursor-pointer
            ${
              currentPage === item.id
                ? 'bg-violet-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }
          `}
        >
          <span className="text-base leading-none">{item.icon}</span>
          <span className="text-[9px] leading-none">{item.label}</span>
        </button>
      ))}

      <div className="flex-1" />

      <button
        onClick={() => setPage('settings')}
        title="Settings"
        className={`
          no-drag w-10 h-10 rounded-lg flex flex-col items-center justify-center text-xs gap-0.5
          transition-colors cursor-pointer
          ${
            currentPage === 'settings'
              ? 'bg-violet-600 text-white'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }
        `}
      >
        <span className="text-base leading-none">⚙</span>
        <span className="text-[9px] leading-none">Settings</span>
      </button>
    </aside>
  )
}
