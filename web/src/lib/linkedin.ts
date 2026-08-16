// Sign In with LinkedIn (OpenID Connect) — the only sanctioned way to read a
// member's LinkedIn name and profile picture.
//
// LinkedIn profiles are auth-walled (an unauthenticated fetch returns HTTP 999)
// and scraping them breaks their terms, so a member's photo can only reach us if
// that member authorises it. This flow is that authorisation: they click once,
// LinkedIn asks them, and we receive a lite profile. It cannot be used to collect
// anyone who has not personally consented — by design, not by limitation.
//
// Pure helpers only: URL building and HTTP calls, no Payload and no cookies, so
// the flow's logic can be tested without a browser.

export const AUTHORIZATION_URL = 'https://www.linkedin.com/oauth/v2/authorization'
export const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'
export const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo'

// `profile` carries the picture, `email` the address most of our members are
// missing. `openid` is what makes the response an OIDC id_token at all.
export const SCOPES = ['openid', 'profile', 'email'] as const

/** A LinkedIn photo is a short-lived CDN URL, so we always download the bytes. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

export type LinkedInProfile = {
  sub: string
  name?: string
  given_name?: string
  family_name?: string
  picture?: string
  email?: string
  email_verified?: boolean
  locale?: string
}

export function linkedinConfig() {
  return {
    clientId: process.env.LINKEDIN_CLIENT_ID || '',
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
    redirectUri: process.env.LINKEDIN_REDIRECT_URI || '',
  }
}

export function isConfigured(): boolean {
  const { clientId, clientSecret } = linkedinConfig()
  return Boolean(clientId && clientSecret)
}

/** Where to send the member to grant consent. `state` guards against CSRF. */
export function authorizationUrl({
  clientId,
  redirectUri,
  state,
}: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: SCOPES.join(' '),
  })
  return `${AUTHORIZATION_URL}?${params.toString()}`
}

export async function exchangeCodeForToken({
  code,
  clientId,
  clientSecret,
  redirectUri,
}: {
  code: string
  clientId: string
  clientSecret: string
  redirectUri: string
}): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  })
  if (!res.ok) throw new Error(`LinkedIn token exchange failed (${res.status})`)
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) throw new Error('LinkedIn returned no access token')
  return data.access_token
}

export async function fetchProfile(accessToken: string): Promise<LinkedInProfile> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`LinkedIn userinfo failed (${res.status})`)
  return (await res.json()) as LinkedInProfile
}

/**
 * Download the profile picture. Returns null rather than throwing: a missing or
 * oversized photo should still leave the name and email we just imported intact.
 */
export async function downloadPhoto(
  url: string,
): Promise<{ data: Buffer; mimetype: string; name: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const mimetype = res.headers.get('content-type') || 'image/jpeg'
    if (!mimetype.startsWith('image/')) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    if (!buffer.length || buffer.length > MAX_PHOTO_BYTES) return null
    const extension = mimetype.includes('png') ? 'png' : 'jpg'
    return { data: buffer, mimetype, name: `linkedin-photo.${extension}` }
  } catch {
    return null
  }
}

/**
 * The fields we are willing to copy onto a member profile.
 *
 * Deliberately conservative: only fills what is empty, so a name an editor
 * corrected here is never overwritten by whatever the person happens to have on
 * LinkedIn. The photo is handled separately (it needs an upload).
 */
export function profilePatch(
  profile: LinkedInProfile,
  member: { name?: string | null; email?: string | null },
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (!member.email && profile.email) patch.email = profile.email
  if (!member.name && profile.name) patch.name = profile.name
  return patch
}
