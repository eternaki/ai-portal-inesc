'use client'

import React, { useEffect, useRef, useState } from 'react'
import type { Dictionary } from '@/i18n/messages'

// Floating chatbot about the group's publications. Mounted in the (frontend)
// layout only, so it never appears in the admin. Strings arrive as props from
// the server layout (client components can't read the locale cookie dictionary).
type ChatStrings = Dictionary['chat']

type Source = { n: number; title: string; slug?: string | null; year?: number | null }
type Msg = { role: 'user' | 'assistant'; content: string; sources?: Source[] }
type ApiError = { code?: string; message?: string; hint?: string; requestId?: string }

const errorText = (error: ApiError | string | undefined, fallback: string) => {
  if (typeof error === 'string') return error
  switch (error?.code) {
    case 'LLM_NOT_CONFIGURED':
      return 'The chatbot is not configured yet. Add Gemini or OpenRouter credentials on the server.'
    case 'MODEL_NOT_CONFIGURED':
      return 'The chatbot model is not configured. Check the server model setting.'
    case 'INVALID_API_KEY':
      return 'The configured language-model credential was rejected.'
    case 'PROVIDER_RATE_LIMITED':
      return 'The language-model provider is temporarily rate-limited. Try again later.'
    case 'PROVIDER_QUOTA_EXCEEDED':
      return 'The free language-model quota was exceeded. Try again later.'
    case 'OLLAMA_UNAVAILABLE':
      return 'The local Ollama service is not running or cannot be reached.'
    case 'OLLAMA_MODEL_NOT_FOUND':
    case 'MODEL_NOT_FOUND':
      return 'The configured model is unavailable. Check the model name.'
    case 'LLM_TIMEOUT':
      return 'The language-model request timed out. Try again.'
    default:
      return error?.message || fallback
  }
}

export function ChatWidget({ t }: { t: ChatStrings }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, busy])

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    const message = input.trim()
    if (!message || busy) return
    setInput('')
    const nextMessages: Msg[] = [...messages, { role: 'user', content: message }]
    setMessages(nextMessages)
    setBusy(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: nextMessages.slice(-7, -1).map(({ role, content }) => ({ role, content })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const text = res.status === 429 ? t.rateLimited : errorText(data?.error, t.error)
        setMessages((m) => [...m, { role: 'assistant', content: text }])
      } else {
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: data.answer ?? '', sources: data.sources ?? [] },
        ])
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: t.error }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="chat-root">
      {open && (
        <div className="chat-panel" role="dialog" aria-label={t.title}>
          <div className="chat-head">
            <strong>{t.title}</strong>
            <span className="badge badge-ai">{t.aiNote}</span>
            <button
              type="button"
              className="chat-close"
              aria-label={t.close}
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          <div className="chat-list" ref={listRef}>
            {messages.length === 0 && <p className="chat-intro">{t.intro}</p>}
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg chat-msg-${m.role}`}>
                <div>{m.content}</div>
                {m.sources && m.sources.length > 0 && (
                  <div className="chat-sources">
                    {t.sources}:{' '}
                    {m.sources.map((s) => (
                      <a key={s.n} href={s.slug ? `/publications/${s.slug}` : '#'}>
                        [{s.n}]
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="chat-msg chat-msg-assistant">{t.thinking}</div>}
          </div>
          <form className="chat-form" onSubmit={send}>
            <input
              type="text"
              value={input}
              maxLength={500}
              placeholder={t.placeholder}
              onChange={(e) => setInput(e.target.value)}
              aria-label={t.placeholder}
            />
            <button className="btn" type="submit" disabled={busy || !input.trim()}>
              {t.send}
            </button>
          </form>
        </div>
      )}
      <button type="button" className="chat-fab" onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="6" cy="16" r="2.2" fill="currentColor" />
          <circle cx="16" cy="6" r="2.2" fill="currentColor" />
          <circle cx="18" cy="17" r="1.6" fill="currentColor" opacity="0.7" />
          <path d="M6 16 L16 6 M16 6 L18 17" stroke="currentColor" strokeWidth="1" opacity="0.5" />
        </svg>
        {t.open}
      </button>
    </div>
  )
}
