import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

// Proxy from the admin to the AI service: auth is the Payload session (editor+),
// and the AI service token never leaves the server.
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
  const collection = body?.collection
  const id = Number(body?.id)
  if (!['publications', 'news'].includes(collection) || !Number.isFinite(id)) {
    return NextResponse.json({ error: 'collection must be publications|news, id numeric' }, { status: 400 })
  }

  try {
    const res = await fetch(`${aiUrl}/generate/snippet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Token': token },
      body: JSON.stringify({ collection, id, save: true }),
      signal: AbortSignal.timeout(60000),
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
