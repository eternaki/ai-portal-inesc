import type { CollectionConfig } from 'payload'

import { adminOnly, adminOnlyField } from '../access'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    group: 'System',
  },
  // useAPIKey: the AI pipelines' service account calls the REST API with a key
  auth: {
    useAPIKey: true,
  },
  access: {
    // Only an admin creates/deletes accounts; a user reads and edits only their own
    create: adminOnly,
    delete: adminOnly,
    read: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      return { id: { equals: user.id } }
    },
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      return { id: { equals: user.id } }
    },
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'member',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        { label: 'Member', value: 'member' },
      ],
      // Only an admin assigns roles — otherwise a member could promote themselves
      access: {
        create: adminOnlyField,
        update: adminOnlyField,
      },
    },
  ],
}
