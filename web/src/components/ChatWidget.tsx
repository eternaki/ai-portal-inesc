'use client'

import React, { useEffect, useRef, useState } from 'react'
import type { Dictionary } from '@/i18n/messages'

// Floating chatbot about the group's publications. Mounted in the (frontend)
// layout only, so it never appears in the admin. Strings arrive as props from
// the server layout (client components can't read the locale cookie dictionary).
type ChatStrings = Dictionary['chat']

type Source = {
  n: number
  title: string
  slug?: string | null
  year?: number | null
  // Which section the citation belongs to, and where it points. Sent by the AI
  // service because it knows the entity type; `url` is optional so an older
  // response still renders (falling back to the publications route).
  entity_type?: string
  url?: string
  // First couple of lines of the entry. Only rendered in extractive mode, where
  // the entries are the answer rather than a footnote to one.
  snippet?: string
}
// How the answer was produced. 'extractive' means no model was available and the
// service returned the retrieved entries instead — the widget must not present
// those as if something had reasoned over them.
type Mode = 'llm' | 'extractive' | 'none'
type Msg = { role: 'user' | 'assistant'; content: string; sources?: Source[]; mode?: Mode }
type ApiError = { code?: string; message?: string; hint?: string; requestId?: string }

// Provider failures no longer surface here: /chat degrades to the extractive
// answer for every LLMError, because by then it already holds grounded sources.
// What is left is the chat being switched off, the AI service being unreachable,
// or a malformed request — none of which have a friendlier phrasing than their own.
const errorText = (error: ApiError | string | undefined, fallback: string) =>
  typeof error === 'string' ? error : error?.message || fallback

// The service sends the collection slug ("publications"). Fall back to it if a
// new collection reaches the chat before its label does — "software" is still
// more use to a visitor than nothing.
const kindLabel = (entityType: string | undefined, t: ChatStrings) =>
  t.kinds[entityType as keyof ChatStrings['kinds']] ?? entityType ?? ''

// Extractive mode has no prose to cite from, so the entries stop being footnote
// markers and become the answer: title, what kind of thing it is, and the opening
// of the entry itself.
function Matches({ sources, t }: { sources: Source[]; t: ChatStrings }) {
  return (
    <ol className="chat-matches">
      {sources.map((s) => (
        <li key={s.n}>
          <a href={s.url ?? (s.slug ? `/publications/${s.slug}` : '#')}>{s.title}</a>
          <span className="chat-match-kind">
            {kindLabel(s.entity_type, t)}
            {s.year ? ` · ${s.year}` : ''}
          </span>
          {s.snippet && <p className="chat-match-snippet">{s.snippet}</p>}
        </li>
      ))}
    </ol>
  )
}

export function ChatWidget({ t }: { t: ChatStrings }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // The header disclaimer has to describe the answer actually on screen. Left
  // static, it announced "AI-generated answers" directly above a message saying
  // no model had answered — the two modes contradicting each other in one panel.
  const lastAnswer = messages.filter((m) => m.role === 'assistant').at(-1)
  const cameFromAI = lastAnswer?.mode !== 'extractive' && lastAnswer?.mode !== 'none'

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
          {
            role: 'assistant',
            content: data.answer ?? '',
            sources: data.sources ?? [],
            mode: data.mode ?? 'llm',
          },
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
            <span className={`badge ${cameFromAI ? 'badge-ai' : ''}`}>
              {cameFromAI ? t.aiNote : t.noAiNote}
            </span>
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
                {m.mode === 'extractive' && m.sources?.length ? (
                  // Deliberately not `m.content`: the service composes an English
                  // plain-text version for direct API callers, but visible copy
                  // here has to come from the dictionary to stay bilingual.
                  <div className="chat-nomodel">
                    <p>{t.noModelNote}</p>
                    <Matches sources={m.sources} t={t} />
                  </div>
                ) : (
                  <>
                    {/* The refusal is written by the service in English for
                        direct API callers; on screen it comes from the
                        dictionary, same rule as the extractive note above. */}
                    <div>{m.mode === 'none' ? t.noMatch : m.content}</div>
                    {m.sources && m.sources.length > 0 && (
                      <div className="chat-sources">
                        {t.sources}:{' '}
                        {/* The service sends the public URL per source: the chat now
                            cites people, projects and dissertations too, so the widget
                            can no longer assume every citation is a publication. */}
                        {m.sources.map((s) => (
                          <a key={s.n} href={s.url ?? (s.slug ? `/publications/${s.slug}` : '#')}>
                            [{s.n}]
                          </a>
                        ))}
                      </div>
                    )}
                  </>
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
