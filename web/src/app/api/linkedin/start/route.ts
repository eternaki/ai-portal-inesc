import crypto from 'node:crypto'

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import { authorizationUrl, isConfigured, linkedinConfig } from '@/lib/linkedin'

export const STATE_COOKIE = 'linkedin_oauth_state'

/**
 * Begin "Connect LinkedIn" for one member.
 *
 * Only the member themselves (or an admin/editor) may start it: the flow ends by
 * writing a name, email and photo onto that profile, so whoever starts it must
 * already be allowed to edit it. The signed state cookie carries the member id,
 * so the callback cannot be pointed at somebody else's profile.
 */
export async function GET(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get('member')
  if (!memberId) {
    return NextResponse.json({ error: 'member is required' }, { status: 400 })
  }

  // Authenticate before anything else, so an anonymous caller gets 401 rather
  // than a report on how this deployment is configured.
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  if (!isConfigured()) {
    return NextResponse.json(
      { error: 'LinkedIn is not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.' },
      { status: 503 },
    )
  }

  const member = await payload
    .findByID({ collection: 'members', id: memberId, depth: 0 })
    .catch(() => null)
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  const ownsProfile =
    typeof member.user === 'object' ? member.user?.id === user.id : member.user === user.id
  const privileged = user.role === 'admin' || user.role === 'editor'
  if (!ownsProfile && !privileged) {
    return NextResponse.json({ error: 'Not allowed to edit this profile' }, { status: 403 })
  }

  const { clientId, redirectUri } = linkedinConfig()
  const callback = redirectUri || new URL('/api/linkedin/callback', req.nextUrl.origin).toString()
  const nonce = crypto.randomBytes(16).toString('hex')

  const res = NextResponse.redirect(
    authorizationUrl({ clientId, redirectUri: callback, state: nonce }),
  )
  // The member id lives in the cookie, not the state parameter, so a tampered
  // redirect back from LinkedIn cannot retarget the write.
  res.cookies.set(STATE_COOKIE, JSON.stringify({ nonce, memberId }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: 600, // ten minutes is plenty for a consent screen
  })
  return res
}
