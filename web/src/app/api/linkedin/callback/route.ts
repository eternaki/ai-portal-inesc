import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import {
  downloadPhoto,
  exchangeCodeForToken,
  fetchProfile,
  linkedinConfig,
  namesPlausiblyMatch,
  profilePatch,
} from '@/lib/linkedin'

import { STATE_COOKIE } from '../start/route'

/** Back to the member's admin page, with a short status the button renders. */
function backToMember(req: NextRequest, memberId: string | null, status: string) {
  const target = memberId
    ? `/admin/collections/members/${memberId}?linkedin=${status}`
    : `/admin?linkedin=${status}`
  const res = NextResponse.redirect(new URL(target, req.nextUrl.origin))
  res.cookies.delete(STATE_COOKIE)
  return res
}

/**
 * Finish "Connect LinkedIn": exchange the code, read the member's own lite
 * profile, and copy the photo (plus any name/email we were missing) onto their
 * member record.
 *
 * Fills gaps only — an editor's corrections here always win, because LinkedIn is
 * the person's own page, not the group's record of them.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const raw = req.cookies.get(STATE_COOKIE)?.value
  let memberId: string | null = null

  try {
    if (params.get('error')) return backToMember(req, null, 'denied')
    if (!raw) return backToMember(req, null, 'expired')

    const { nonce, memberId: cookieMemberId } = JSON.parse(raw) as {
      nonce: string
      memberId: string
    }
    memberId = cookieMemberId
    // The state we get back must match the nonce we issued; otherwise this is a
    // response to a request we never made.
    if (!nonce || params.get('state') !== nonce) return backToMember(req, memberId, 'badstate')

    const code = params.get('code')
    if (!code) return backToMember(req, memberId, 'nocode')

    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: req.headers })
    if (!user) return backToMember(req, memberId, 'unauthorized')

    const { clientId, clientSecret, redirectUri } = linkedinConfig()
    const callback =
      redirectUri || new URL('/api/linkedin/callback', req.nextUrl.origin).toString()

    const token = await exchangeCodeForToken({
      code,
      clientId,
      clientSecret,
      redirectUri: callback,
    })
    const profile = await fetchProfile(token)

    const member = await payload.findByID({ collection: 'members', id: memberId, depth: 0 })

    // Refuse unless the account that authorised is plausibly this member. LinkedIn
    // returns whoever signed in, and no member here has a login account yet, so in
    // practice an admin runs this — without the check, their own face and email
    // would be published under someone else's name.
    if (!namesPlausiblyMatch(profile.name || '', member.name || '')) {
      console.warn(
        `[linkedin] refused: signed in as "${profile.name}" while importing "${member.name}"`,
      )
      return backToMember(req, memberId, 'mismatch')
    }

    const patch = profilePatch(profile, { name: member.name, email: member.email })

    // Only upload a photo if the profile has none: a picture someone chose here
    // outranks whatever LinkedIn currently shows.
    if (!member.photo && profile.picture) {
      const photo = await downloadPhoto(profile.picture)
      if (photo) {
        const media = await payload.create({
          collection: 'media',
          data: { alt: `${member.name} — profile photo` },
          file: { data: photo.data, mimetype: photo.mimetype, name: photo.name, size: photo.data.length },
          overrideAccess: true,
        })
        patch.photo = media.id
      }
    }

    if (Object.keys(patch).length) {
      await payload.update({
        collection: 'members',
        id: memberId,
        data: patch,
        overrideAccess: true,
      })
    }
    return backToMember(req, memberId, Object.keys(patch).length ? 'ok' : 'nothing')
  } catch (err) {
    console.error('[linkedin] callback failed', err)
    return backToMember(req, memberId, 'failed')
  }
}
