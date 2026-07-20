import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

const DEFAULT_SCOPE = ['publications', 'members', 'projects', 'news', 'software', 'thesisTopics']

export async function POST(req: NextRequest) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user || (user.role !== 'admin' && user.role !== 'editor')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const aiUrl = process.env.AI_SERVICE_URL
  const token = process.env.AI_SERVICE_TOKEN
  if (!aiUrl || !token) {
    return NextResponse.json({ error: 'AI service is not configured' }, { status: 503 })
  }

  const body = await req.json().catch(() => null)
  const question = String(body?.question || '').trim()
  if (!question) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 })
  }

  const scope = Array.isArray(body?.scope) ? body.scope : DEFAULT_SCOPE
  const comparisonModels = Array.isArray(body?.comparisonModels) ? body.comparisonModels : []

  try {
    const res = await fetch(`${aiUrl}/rag/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Token': token },
      body: JSON.stringify({
        question,
        scope,
        limit: Number.isFinite(Number(body?.limit)) ? Number(body.limit) : undefined,
        compareModels: body?.compareModels === true,
        comparisonModels,
      }),
      signal: AbortSignal.timeout(90000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.detail || `AI service returned ${res.status}` },
        { status: 502 },
      )
    }
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'AI service is unavailable' }, { status: 502 })
  }
}
