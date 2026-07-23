import type { CollectionConfig } from 'payload'

import { adminOrEditor, anyone } from '../access'
import { slugField } from '../fields/slug'

export const ReadingGroups: CollectionConfig = {
  slug: 'reading-groups',
  admin: {
    useAsTitle: 'title',
    group: 'Content',
    defaultColumns: ['title', 'date', 'presenter'],
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
        { name: 'presenter', type: 'text', admin: { width: '50%' } },
      ],
    },
    { name: 'paperTitle', type: 'text', admin: { description: 'Paper or topic discussed' } },
    { name: 'description', type: 'richText' },
    {
      name: 'materials',
      type: 'array',
      admin: { description: 'Slides, papers, notes or supporting files uploaded manually.' },
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'file', type: 'upload', relationTo: 'media', required: true },
      ],
    },
    {
      name: 'relatedPublications',
      type: 'relationship',
      relationTo: 'publications',
      hasMany: true,
      admin: { description: 'Optional MLKD publications related to this session.' },
    },
  ],
}
