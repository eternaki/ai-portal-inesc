import type { Access, FieldAccess } from 'payload'

export const anyone: Access = () => true

export const adminOnly: Access = ({ req: { user } }) => user?.role === 'admin'

export const adminOrEditor: Access = ({ req: { user } }) =>
  user?.role === 'admin' || user?.role === 'editor'

// A group member can edit only their own profile (member.user === req.user);
// admin/editor can edit any.
export const adminEditorOrSelf: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'editor') return true
  return { user: { equals: user.id } }
}

export const adminOnlyField: FieldAccess = ({ req: { user } }) => user?.role === 'admin'

// Public read of reviewable content: everyone sees only `published`; admin/editor
// see every editorial state (so the review queue works). Defense-in-depth for the
// REST/GraphQL API — the frontend also filters explicitly, but this guards direct
// API access. Members are group members, not reviewers, so they see published only.
export const publishedOrPrivileged: Access = ({ req: { user } }) => {
  if (user?.role === 'admin' || user?.role === 'editor') return true
  return { status: { equals: 'published' } }
}
