import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

// Admin dashboard → AI publication-coverage report (per member: on-site vs known
// baseline vs OpenAlex). Same shape as /api/maintenance: Payload session auth
// (editor+), service token stays server-side. Read-only; OpenAlex lookup opt-in.
export async function GET(req: NextRequest) {
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

  const checkOpenalex = req.nextUrl.searchParams.get('openalex') === 'true'
  try {
    const res = await fetch(`${aiUrl}/coverage/report?check_openalex=${checkOpenalex}`, {
      headers: { 'X-Service-Token': token },
      // One OpenAlex request per member with an id; allow it more time.
      signal: AbortSignal.timeout(checkOpenalex ? 120000 : 30000),
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
