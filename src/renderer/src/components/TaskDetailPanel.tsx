import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTaskStore } from '../store/taskStore'
import { useUiStore } from '../store/uiStore'
import { useProjectStore } from '../store/projectStore'
import { Message, Output } from '../../../shared/types'
import api from '../lib/ipc'

export default function TaskDetailPanel() {
  const { selectedTaskId, selectTask, openOutputPreview } = useUiStore()
  const { tasks, messages, outputs, loadMessages, loadOutputs, spawnSession, sendMessage, terminateSession, updateTaskStatus, deleteTask, sessionStatuses } = useTaskStore()
  useProjectStore()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [asanaConfirm, setAsanaConfirm] = useState(false)
  const [asanaSyncing, setAsanaSyncing] = useState(false)

  const task = tasks.find((t) => t.id === selectedTaskId)
  const taskMessages: Message[] = messages[selectedTaskId ?? ''] ?? []
  const taskOutputs: Output[] = outputs[selectedTaskId ?? ''] ?? []
  const sessionStatus = sessionStatuses[selectedTaskId ?? '']

  useEffect(() => {
    if (selectedTaskId) {
      loadMessages(selectedTaskId)
      loadOutputs(selectedTaskId)
    }
  }, [selectedTaskId])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [taskMessages.length])

  if (!task) return null

  const handleSend = async () => {
    if (!input.trim() || !selectedTaskId) return
    const msg = input.trim()
    setInput('')
    await sendMessage(selectedTaskId, msg)
  }

  const handleSpawn = async () => {
    if (!selectedTaskId) return
    await spawnSession(selectedTaskId)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSend()
    }
  }

  const isRunning = sessionStatus === 'running' || sessionStatus === 'spawning'

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-800 w-[480px] shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 bg-slate-900/90">
        <button
          onClick={() => selectTask(null)}
          className="text-slate-400 hover:text-slate-200 transition-colors"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-100 text-sm truncate">{task.title}</div>
          {task.description && (
            <div className="text-xs text-slate-500 truncate">{task.description}</div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {task.asanaGid && task.status !== 'done' && (
            <span className="text-xs text-blue-400 mr-1" title="Linked to Asana">Asana</span>
          )}
          {task.status !== 'done' && (
            <button
              onClick={() => {
                if (task.asanaGid) {
                  setAsanaConfirm(true)
                } else {
                  updateTaskStatus(task.id, 'done')
                }
              }}
              className="text-xs px-2 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded transition-colors"
            >
              Done
            </button>
          )}
          <button
            onClick={() => {
              deleteTask(task.id)
              selectTask(null)
            }}
            className="text-xs px-2 py-1 bg-slate-700 hover:bg-red-700 text-slate-300 hover:text-white rounded transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {taskMessages.length === 0 && (
          <div className="text-center text-slate-600 text-sm mt-8">
            <p className="mb-2">No messages yet.</p>
            {!isRunning && (
              <button
                onClick={handleSpawn}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm transition-colors"
              >
                Start Claude Session →
              </button>
            )}
          </div>
        )}

        {taskMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            <div
              className={`
                max-w-[85%] rounded-lg px-3 py-2 text-sm
                ${
                  msg.role === 'user'
                    ? 'bg-violet-700 text-white'
                    : 'bg-slate-800 text-slate-200 border border-slate-700'
                }
              `}
            >
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              </div>
              <div
                className={`text-xs mt-1 ${msg.role === 'user' ? 'text-violet-300' : 'text-slate-500'}`}
              >
                {new Date(msg.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}

        {isRunning && (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <span className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
            <span>Claude is working…</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Outputs */}
      {taskOutputs.length > 0 && (
        <div className="border-t border-slate-800 px-4 py-2">
          <div className="text-xs text-slate-500 mb-1 font-medium uppercase tracking-wide">
            Outputs
          </div>
          <div className="flex flex-wrap gap-1">
            {taskOutputs.map((out) => (
              <button
                key={out.id}
                onClick={() => openOutputPreview(out.filePath)}
                className="flex items-center gap-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded transition-colors"
              >
                <span>📄</span>
                <span className="max-w-[100px] truncate">{out.fileName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reply box */}
      <div className="border-t border-slate-800 p-3 bg-slate-900/80">
        {isRunning ? (
          <div className="flex items-center justify-between">
            <span className="text-xs text-amber-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Session running…
            </span>
            <button
              onClick={() => terminateSession(task.id)}
              className="text-xs px-2 py-1 bg-slate-700 hover:bg-red-700 text-slate-300 hover:text-white rounded transition-colors"
            >
              Stop
            </button>
          </div>
        ) : (
          <>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message… (Ctrl+Enter to send)"
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 resize-none focus:outline-none focus:border-violet-500 transition-colors"
            />
            <div className="flex items-center justify-between mt-2">
              {taskMessages.length === 0 ? (
                <button
                  onClick={handleSpawn}
                  className="text-xs px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
                >
                  Start Claude Session →
                </button>
              ) : (
                <span />
              )}
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="text-xs px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Send →
              </button>
            </div>
          </>
        )}
      </div>

      {/* Asana completion confirmation dialog */}
      {asanaConfirm && task?.asanaGid && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 w-80 shadow-2xl">
            <h3 className="text-sm font-semibold text-slate-100 mb-2">Complete on Asana?</h3>
            <p className="text-xs text-slate-400 mb-4">
              This task is linked to Asana. Would you like to mark it as completed on Asana too?
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setAsanaSyncing(true)
                  try {
                    await api.asana.completeTask(
                      task.asanaGid!,
                      `Completed via ClaudeKanBan`
                    )
                  } catch {
                    // Asana sync failure is non-blocking
                  }
                  await updateTaskStatus(task.id, 'done')
                  setAsanaConfirm(false)
                  setAsanaSyncing(false)
                }}
                disabled={asanaSyncing}
                className="flex-1 px-3 py-2 text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
              >
                {asanaSyncing ? 'Syncing...' : 'Yes, complete on Asana'}
              </button>
              <button
                onClick={async () => {
                  await updateTaskStatus(task.id, 'done')
                  setAsanaConfirm(false)
                }}
                className="flex-1 px-3 py-2 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
              >
                No, just locally
              </button>
            </div>
            <button
              onClick={() => setAsanaConfirm(false)}
              className="w-full mt-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
