import type { CollectionConfig } from 'payload'

import { adminOrEditor, anyone } from '../access'
import { slugField } from '../fields/slug'

export const ThesisTopics: CollectionConfig = {
  slug: 'thesis-topics',
  admin: {
    useAsTitle: 'title',
    group: 'Opportunities',
    defaultColumns: ['title', 'level', 'status'],
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
          name: 'level',
          type: 'select',
          required: true,
          options: [
            { label: 'MSc', value: 'msc' },
            { label: 'PhD', value: 'phd' },
          ],
          admin: { width: '50%' },
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'open',
          index: true,
          options: [
            { label: 'Open', value: 'open' },
            { label: 'Assigned', value: 'assigned' },
            { label: 'Completed', value: 'completed' },
          ],
          admin: { width: '50%' },
        },
      ],
    },
    { name: 'advisors', type: 'relationship', relationTo: 'members', hasMany: true },
    { name: 'description', type: 'richText' },
    { name: 'themes', type: 'relationship', relationTo: 'research-themes', hasMany: true },
  ],
}
