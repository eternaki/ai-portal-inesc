import type { CollectionConfig } from 'payload'

import { adminOrEditor, anyone } from '../access'
import { slugField } from '../fields/slug'

// MSc and PhD theses at every stage of their life: open for application, being
// written, defended. One collection rather than three, because a topic does not
// change identity when a student takes it — only its status does.
export const Dissertations: CollectionConfig = {
  slug: 'dissertations',
  labels: { singular: 'Dissertation', plural: 'Dissertations' },
  admin: {
    useAsTitle: 'title',
    group: 'Dissertations',
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
            { label: 'Open for application', value: 'open' },
            { label: 'Ongoing', value: 'ongoing' },
            { label: 'Finished', value: 'finished' },
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
