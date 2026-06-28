'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageCircle, X, Send, Loader2, ThumbsUp, ThumbsDown } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  id?: string
}

interface Source {
  source: string
  title: string
  url?: string
}

export default function GuideChatbot() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [feedbackMap, setFeedbackMap] = useState<Record<string, 'up' | 'down'>>({})
  const contextMapRef = useRef<Map<string, { question: string; sources: Source[] }>>(new Map())
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      if (messages.length === 0) {
        setMessages([{
          role: 'assistant',
          content: '안녕하세요! 공공데이터 평가 절차, 품질 기준, 제출 방법 등 궁금한 점을 물어보세요.',
        }])
      }
    }
  }, [open, messages.length])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = useCallback(async () => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    setError(null)
    setSources([])

    const userMsg: Message = { role: 'user', content: msg }
    const history = messages.slice(1)
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    try {
      const res = await fetch('/api/guide-chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '오류가 발생했습니다')
      } else {
        const assistantId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const responseSources: Source[] = data.sources ?? []
        contextMapRef.current.set(assistantId, { question: msg, sources: responseSources })
        setMessages((prev) => [...prev, { role: 'assistant', content: data.content, id: assistantId }])
        if (responseSources.length) setSources(responseSources)
      }
    } catch {
      setError('네트워크 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages])

  const submitFeedback = useCallback(async (msgId: string, helpful: boolean) => {
    const ctx = contextMapRef.current.get(msgId)
    if (!ctx) return
    setFeedbackMap((prev) => ({ ...prev, [msgId]: helpful ? 'up' : 'down' }))
    try {
      await fetch('/api/feedback/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: ctx.question, sources_used: ctx.sources, helpful }),
      })
    } catch {
      // 피드백 전송 실패는 사용자에게 노출하지 않음
    }
  }, [])

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <>
      {/* 플로팅 버튼 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 hover:shadow-xl hover:-translate-y-0.5 text-white shadow-lg flex items-center justify-center transition-all duration-150"
          aria-label="AI 안내 챗봇 열기"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {/* 채팅 패널 */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-80 sm:w-96 flex flex-col bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              <span className="text-sm font-semibold">EUM 안내 AI</span>
            </div>
            <button onClick={() => setOpen(false)} className="hover:opacity-70 transition-opacity duration-150" aria-label="닫기">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 메시지 목록 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 max-h-80">
            {messages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                  }`}
                >
                  {msg.content}
                </div>
                {msg.role === 'assistant' && msg.id && (
                  <div className="flex items-center gap-1 mt-1 pl-1">
                    {feedbackMap[msg.id] ? (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {feedbackMap[msg.id] === 'up' ? '도움이 됐어요' : '도움이 안 됐어요'}
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => submitFeedback(msg.id!, true)}
                          className="p-1 rounded text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-150"
                          aria-label="도움이 됐어요"
                        >
                          <ThumbsUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => submitFeedback(msg.id!, false)}
                          className="p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-150"
                          aria-label="도움이 안 됐어요"
                        >
                          <ThumbsDown className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded-xl">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                </div>
              </div>
            )}

            {error && (
              <div className="text-xs text-red-500 dark:text-red-400 text-center py-1">{error}</div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* 출처 */}
          {sources.length > 0 && (
            <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">참고 출처</p>
              <div className="space-y-0.5">
                {sources.slice(0, 3).map((s, i) => (
                  <div key={i} className="text-xs text-indigo-600 dark:text-indigo-400 truncate">
                    {s.url ? (
                      <a href={s.url} className="hover:underline transition-colors duration-150">{s.title}</a>
                    ) : (
                      s.title
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 입력창 */}
          <div className="flex items-center gap-2 px-3 py-3 border-t border-gray-100 dark:border-gray-700">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="궁금한 점을 입력하세요..."
              className="flex-1 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
              maxLength={300}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white flex items-center justify-center transition-colors"
              aria-label="전송"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
