import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useProjectStore } from '../store/projectStore'

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
      <div className="flex items-center justify-center h-full text-slate-600 text-sm">
        Select a project to view docs
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Doc list */}
      <div className="w-48 shrink-0 border-r border-slate-800 flex flex-col">
        <div className="p-3 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-200">Docs</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {docs.map((doc) => (
            <button
              key={doc.path}
              onClick={() => selectDoc(doc)}
              className={`
                w-full text-left px-3 py-2 rounded-lg text-sm transition-colors
                ${selected?.path === doc.path
                  ? 'bg-violet-700/30 border border-violet-600 text-slate-100'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'
                }
              `}
            >
              {doc.name}
            </button>
          ))}
          {docs.length === 0 && (
            <div className="text-xs text-slate-600 text-center mt-8">
              No docs found in this project
            </div>
          )}
        </div>
      </div>

      {/* Doc content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-slate-200 flex-1">{selected.name}</h2>
              <span className="text-xs text-slate-500 truncate max-w-[300px]">{selected.path}</span>
              {saved && <span className="text-xs text-emerald-400">Saved ✓</span>}
              {editing ? (
                <>
                  <button
                    onClick={handleSave}
                    className="text-xs px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setEditing(false); setEditContent(content) }}
                    className="text-xs px-3 py-1 text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {editing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-full min-h-[400px] bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono resize-none focus:outline-none focus:border-violet-500"
                />
              ) : content ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                </div>
              ) : (
                <div className="text-slate-600 text-sm">File is empty</div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-600 text-sm">
            Select a document to view it
          </div>
        )}
      </div>
    </div>
  )
}
