import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

// Proxy from the admin "Import publication" form to the AI service. Auth is the
// Payload session (editor+); the AI service token never leaves the server.
// Two actions: `lookup` (preview + duplicate check, creates nothing) and
// `create` (draft in the editorial queue — never published directly).
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
  const action = body?.action === 'create' ? 'create' : 'lookup'
  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : ''
  if (identifier.length < 3) {
    return NextResponse.json({ error: 'Enter a DOI, URL, OpenAlex id, or title' }, { status: 400 })
  }

  try {
    const res = await fetch(`${aiUrl}/ingest/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Token': token },
      body: JSON.stringify({ identifier }),
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
