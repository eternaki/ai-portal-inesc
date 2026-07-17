import type { CollectionConfig } from 'payload'

import { adminOrEditor, anyone } from '../access'
import { slugField } from '../fields/slug'

// Seminars, talks and workshops — mirrors the "Events" section of the current
// MLKD site.
export const Events: CollectionConfig = {
  slug: 'events',
  admin: {
    useAsTitle: 'title',
    group: 'Content',
    defaultColumns: ['title', 'date', 'location'],
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
          name: 'date',
          type: 'date',
          required: true,
          index: true,
          admin: { width: '50%', date: { pickerAppearance: 'dayAndTime' } },
        },
        { name: 'location', type: 'text', admin: { width: '50%' } },
      ],
    },
    { name: 'speaker', type: 'text', admin: { description: 'Speaker / organiser (optional)' } },
    { name: 'description', type: 'richText' },
    { name: 'link', type: 'text', admin: { description: 'External link (registration, recording…)' } },
  ],
}
