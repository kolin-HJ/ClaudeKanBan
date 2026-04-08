import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, Check, Trash2, Square, SendHorizontal, Play, FileText } from 'lucide-react'
import { useTaskStore } from '../store/taskStore'
import { useUiStore } from '../store/uiStore'
import { useProjectStore } from '../store/projectStore'
import { Message, Output } from '../../../shared/types'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { cn } from '../lib/utils'

export default function TaskDetailPanel() {
  const { selectedTaskId, selectTask, openOutputPreview } = useUiStore()
  const { tasks, messages, outputs, loadMessages, loadOutputs, spawnSession, sendMessage, terminateSession, updateTaskStatus, deleteTask, sessionStatuses } = useTaskStore()
  useProjectStore()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

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
    <div className="flex flex-col h-full bg-background border-l border-border w-[460px] shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-10 border-b border-border shrink-0">
        <button
          onClick={() => selectTask(null)}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-accent"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-foreground text-sm truncate">{task.title}</div>
        </div>
        <div className="flex items-center gap-1">
          {task.status !== 'done' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateTaskStatus(task.id, 'done')}
              className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 h-7 px-2"
            >
              <Check className="w-3.5 h-3.5" />
              Done
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              deleteTask(task.id)
              selectTask(null)
            }}
            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Description */}
      {task.description && (
        <div className="px-4 py-2 border-b border-border bg-muted/30">
          <p className="text-xs text-muted-foreground leading-relaxed">{task.description}</p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {taskMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <Play className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-3">No messages yet</p>
              {!isRunning && (
                <Button size="sm" onClick={handleSpawn}>
                  Start Session
                </Button>
              )}
            </div>
          </div>
        )}

        {taskMessages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex gap-2',
              msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
            )}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : msg.role === 'system'
                    ? 'bg-destructive/10 text-destructive border border-destructive/20 font-mono text-xs'
                    : 'bg-card text-foreground border border-border'
              )}
            >
              {msg.role === 'system' ? (
                <pre className="whitespace-pre-wrap break-all text-xs">{msg.content}</pre>
              ) : (
                <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              )}
              <div
                className={cn(
                  'text-xs mt-1 opacity-50',
                  msg.role === 'user' ? 'text-right' : ''
                )}
              >
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}

        {isRunning && (
          <div className="flex items-center gap-2 text-muted-foreground text-xs pl-1">
            <span className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1 h-1 rounded-full bg-amber-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
            <span>Claude is working</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Outputs */}
      {taskOutputs.length > 0 && (
        <div className="border-t border-border px-4 py-2">
          <div className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wider">
            Outputs
          </div>
          <div className="flex flex-wrap gap-1">
            {taskOutputs.map((out) => (
              <button
                key={out.id}
                onClick={() => openOutputPreview(out.filePath)}
                className="flex items-center gap-1 text-xs bg-secondary hover:bg-accent text-secondary-foreground px-2 py-1 rounded transition-colors"
              >
                <FileText className="w-3 h-3 shrink-0" />
                <span className="max-w-[100px] truncate">{out.fileName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reply box */}
      <div className="border-t border-border p-3">
        {isRunning ? (
          <div className="flex items-center justify-between">
            <span className="text-xs text-amber-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Session running
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => terminateSession(task.id)}
            >
              <Square className="w-3 h-3" />
              Stop
            </Button>
          </div>
        ) : (
          <>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Claude... (Ctrl+Enter to send)"
              rows={3}
              className="mb-2 text-sm"
            />
            <div className="flex items-center justify-between">
              {taskMessages.length === 0 ? (
                <Button variant="secondary" size="sm" onClick={handleSpawn}>
                  <Play className="w-3 h-3" />
                  Start Session
                </Button>
              ) : (
                <span />
              )}
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!input.trim()}
              >
                <SendHorizontal className="w-3.5 h-3.5" />
                Send
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
