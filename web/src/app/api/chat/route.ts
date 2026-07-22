import { NextRequest, NextResponse } from 'next/server'

// Public proxy for the site chatbot: keeps the AI service on loopback and
// forwards the client IP so the AI service can rate-limit per visitor.
export async function POST(req: NextRequest) {
  const aiUrl = process.env.AI_SERVICE_URL
  if (!aiUrl) {
    return NextResponse.json({ error: 'chat is not configured' }, { status: 503 })
  }

  const body = await req.json().catch(() => null)
  const message = typeof body?.message === 'string' ? body.message.slice(0, 500) : ''
  const history = Array.isArray(body?.history) ? body.history.slice(-6) : []
  if (!message.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'

  try {
    const res = await fetch(`${aiUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-IP': clientIp },
      body: JSON.stringify({ message, history }),
      signal: AbortSignal.timeout(60000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const error = data?.error || data?.detail?.error || {
        code: 'LLM_INTERNAL_ERROR',
        message: data?.detail || 'chat is temporarily unavailable',
      }
      return NextResponse.json({ error }, { status: res.status })
    }
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'PROVIDER_UNAVAILABLE',
          message: 'chat is temporarily unavailable',
        },
      },
      { status: 502 },
    )
  }
}
