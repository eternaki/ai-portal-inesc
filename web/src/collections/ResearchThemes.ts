import type { CollectionConfig } from 'payload'

import { adminOrEditor, anyone } from '../access'
import { slugField } from '../fields/slug'

export const ResearchThemes: CollectionConfig = {
  slug: 'research-themes',
  admin: {
    useAsTitle: 'name',
    group: 'Research',
  },
  access: {
    read: anyone,
    create: adminOrEditor,
    update: adminOrEditor,
    delete: adminOrEditor,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    slugField('name'),
    { name: 'description', type: 'richText' },
    { name: 'members', type: 'relationship', relationTo: 'members', hasMany: true },
    {
      name: 'keyPublications',
      type: 'relationship',
      relationTo: 'publications',
      hasMany: true,
    },
  ],
}
