import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

// Admin dashboard → AI maintenance report. Auth is the Payload session (editor+);
// the AI service token never leaves the server. Read-only; link-checking opt-in.
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

  const checkLinks = req.nextUrl.searchParams.get('links') === 'true'
  try {
    const res = await fetch(`${aiUrl}/maintenance/report?check_links=${checkLinks}`, {
      headers: { 'X-Service-Token': token },
      // Link-checking hits many external URLs; allow it more time.
      signal: AbortSignal.timeout(checkLinks ? 120000 : 30000),
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
