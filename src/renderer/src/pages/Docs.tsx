import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { Button } from '../components/ui/button'
import { cn } from '../lib/utils'

interface DocFile {
  name: string
  path: string
}

export default function Docs() {
  const { activeProjectId } = useProjectStore()
  const [docs, setDocs] = useState<DocFile[]>([])
  const [selected, setSelected] = useState<DocFile | null>(null)
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saved, setSaved] = useState(false)

  const loadDocs = async () => {
    if (!activeProjectId) return
    const list = await window.electronAPI.docs.list(activeProjectId)
    setDocs(list)
    if (list.length > 0 && !selected) {
      selectDoc(list[0])
    }
  }

  const selectDoc = async (doc: DocFile) => {
    setSelected(doc)
    setEditing(false)
    const c = await window.electronAPI.docs.read(doc.path)
    setContent(c ?? '')
    setEditContent(c ?? '')
  }

  useEffect(() => {
    loadDocs()
  }, [activeProjectId])

  const handleSave = async () => {
    if (!selected) return
    await window.electronAPI.docs.update(selected.path, editContent)
    setContent(editContent)
    setEditing(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!activeProjectId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground/40 text-sm">
        Select a project to view docs
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Doc list */}
      <div className="w-48 shrink-0 border-r border-border flex flex-col">
        <div className="px-3 h-10 flex items-center border-b border-border shrink-0">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Docs</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {docs.map((doc) => (
            <button
              key={doc.path}
              onClick={() => selectDoc(doc)}
              className={cn(
                'w-full text-left px-2.5 py-2 rounded-md text-xs transition-colors',
                selected?.path === doc.path
                  ? 'bg-primary/10 border border-primary/20 text-foreground'
                  : 'border border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {doc.name}
            </button>
          ))}
          {docs.length === 0 && (
            <div className="text-xs text-muted-foreground/40 text-center mt-8">
              No docs found
            </div>
          )}
        </div>
      </div>

      {/* Doc content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="flex items-center gap-2 px-4 h-10 border-b border-border shrink-0">
              <span className="text-sm font-medium text-foreground flex-1 truncate">
                {selected.name}
              </span>
              <span className="text-xs text-muted-foreground/50 font-mono truncate max-w-[300px] hidden lg:block">
                {selected.path}
              </span>
              {saved && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <Check className="w-3 h-3" />
                  Saved
                </span>
              )}
              {editing ? (
                <>
                  <Button size="sm" onClick={handleSave} className="h-7">
                    <Check className="w-3 h-3" />
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setEditing(false); setEditContent(content) }}
                    className="h-7"
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditing(true)}
                  className="h-7"
                >
                  Edit
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {editing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-full min-h-[400px] bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                />
              ) : content ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                </div>
              ) : (
                <div className="text-muted-foreground/40 text-sm">File is empty</div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground/40 text-sm">
            Select a document to view it
          </div>
        )}
      </div>
    </div>
  )
}
