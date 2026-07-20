import type { Field } from 'payload'

// Editorial workflow states (from the Final Implementation Plan). Nothing an
// automated pipeline creates goes live: ingest/AI produce drafts, a human moves
// them to `published`. Public pages show only `published` (see access helpers).
//
//   imported        — created by a pipeline, not yet triaged
//   pending_review  — waiting for a human decision (the review queue)
//   approved        — accepted, staged to publish
//   published       — live on the public site
//   rejected        — declined by a reviewer (kept for the record)
//   failed          — a pipeline step failed (e.g. lookup/enrichment error)
export const EDITORIAL_STATES = [
  { label: 'Imported', value: 'imported' },
  { label: 'Pending review', value: 'pending_review' },
  { label: 'Approved', value: 'approved' },
  { label: 'Published', value: 'published' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Failed', value: 'failed' },
] as const

export type EditorialState = (typeof EDITORIAL_STATES)[number]['value']

// Fields added to any reviewable collection. `status` drives visibility;
// `reviewHistory` is an append-only audit trail written by recordEditorialDecision.
export const editorialFields: Field[] = [
  {
    name: 'status',
    type: 'select',
    required: true,
    defaultValue: 'pending_review',
    index: true,
    options: [...EDITORIAL_STATES],
    admin: {
      position: 'sidebar',
      description: 'Editorial state. Only "Published" is visible on the public site.',
    },
  },
  {
    // Set automatically to the user who last changed the status.
    name: 'reviewer',
    type: 'relationship',
    relationTo: 'users',
    admin: {
      position: 'sidebar',
      readOnly: true,
      description: 'Last reviewer (set automatically on status change).',
    },
  },
  {
    name: 'reviewNote',
    type: 'textarea',
    admin: {
      position: 'sidebar',
      description: 'Reason for the current decision (e.g. why rejected). Recorded in history.',
    },
  },
  {
    // Append-only decision log. Written by the recordEditorialDecision hook; not
    // meant to be hand-edited, but left visible so the trail is auditable.
    name: 'reviewHistory',
    type: 'array',
    labels: { singular: 'Decision', plural: 'Decision history' },
    admin: {
      readOnly: true,
      description: 'Automatic audit trail of editorial decisions.',
      initCollapsed: true,
    },
    fields: [
      { name: 'status', type: 'text' },
      { name: 'note', type: 'text' },
      { name: 'reviewer', type: 'text' },
      { name: 'at', type: 'date' },
    ],
  },
]
