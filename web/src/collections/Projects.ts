import type { CollectionConfig } from 'payload'

import { adminOrEditor, anyone } from '../access'
import { slugField } from '../fields/slug'

export const Projects: CollectionConfig = {
  slug: 'projects',
  admin: {
    useAsTitle: 'title',
    group: 'Research',
    defaultColumns: ['title', 'kind', 'yearStart', 'yearEnd'],
  },
  access: {
    read: anyone,
    create: adminOrEditor,
    update: adminOrEditor,
    delete: adminOrEditor,
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField('title'),
    {
      type: 'row',
      fields: [
        {
          name: 'kind',
          type: 'select',
          defaultValue: 'national',
          options: [
            { label: 'National', value: 'national' },
            { label: 'International', value: 'international' },
            { label: 'Industry', value: 'industry' },
          ],
          admin: { width: '34%' },
        },
        { name: 'yearStart', type: 'number', admin: { width: '33%' } },
        { name: 'yearEnd', type: 'number', admin: { width: '33%' } },
      ],
    },
    { name: 'funding', type: 'text', admin: { description: 'Funding source / grant' } },
    { name: 'url', type: 'text' },
    { name: 'description', type: 'richText' },
    { name: 'members', type: 'relationship', relationTo: 'members', hasMany: true },
    { name: 'themes', type: 'relationship', relationTo: 'research-themes', hasMany: true },
  ],
}
