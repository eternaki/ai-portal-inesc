'use client'

import React from 'react'
import { Button, useDocumentInfo } from '@payloadcms/ui'

// Admin button on a member profile: import the photo, name and email from that
// person's own LinkedIn account via Sign In with LinkedIn (OpenID Connect).
//
// LinkedIn profiles cannot be read without the member's consent — this is the
// consent. One click replaces "find a photo, crop it, upload it", which is why
// most profiles here still show initials.

const MESSAGES: Record<string, { text: string; tone: 'ok' | 'warn' | 'error' }> = {
  ok: { text: 'Imported from LinkedIn. Reload the document to see the photo.', tone: 'ok' },
  nothing: { text: 'Nothing to import — this profile already has a photo and details.', tone: 'warn' },
  mismatch: {
    text:
      'That LinkedIn account is a different person — nothing was changed. Each member must run this from their own LinkedIn login.',
    tone: 'error',
  },
  denied: { text: 'LinkedIn access was declined.', tone: 'warn' },
  expired: { text: 'The request timed out. Try again.', tone: 'warn' },
  badstate: { text: 'Security check failed. Start again from this page.', tone: 'error' },
  nocode: { text: 'LinkedIn did not return an authorisation code.', tone: 'error' },
  unauthorized: { text: 'Your session expired — sign in and retry.', tone: 'error' },
  failed: { text: 'Import failed. Check the server logs.', tone: 'error' },
}

const TONE_COLOR = { ok: '#2e7d32', warn: '#b26a00', error: '#b32d0f' } as const

export const ConnectLinkedInButton: React.FC = () => {
  const { id } = useDocumentInfo()
  // Read once on render: the callback redirects back here with ?linkedin=<status>.
  const status =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('linkedin')
      : null
  const message = status ? MESSAGES[status] : null

  if (!id) return null // profile not saved yet — nothing to attach a photo to

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <Button
        onClick={() => {
          window.location.href = `/api/linkedin/start?member=${id}`
        }}
        size="small"
        buttonStyle="secondary"
      >
        Import photo &amp; details from LinkedIn
      </Button>
      <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--theme-elevation-500)' }}>
        Opens LinkedIn to ask this member for permission. Only fills fields that are
        empty — an existing photo or name is never replaced.
      </div>
      {message && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: TONE_COLOR[message.tone] }}>
          {message.text}
        </div>
      )}
    </div>
  )
}
