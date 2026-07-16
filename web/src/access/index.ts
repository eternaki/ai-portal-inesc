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
