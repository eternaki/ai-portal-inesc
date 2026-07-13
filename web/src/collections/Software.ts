import type { CollectionConfig } from 'payload'

import { adminOrEditor, anyone } from '../access'
import { slugField } from '../fields/slug'

export const Software: CollectionConfig = {
  slug: 'software',
  labels: { singular: 'Software / Dataset', plural: 'Software & Datasets' },
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
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'software',
      options: [
        { label: 'Software / Tool', value: 'software' },
        { label: 'Dataset', value: 'dataset' },
      ],
    },
    { name: 'description', type: 'textarea' },
    { name: 'repoUrl', type: 'text', admin: { description: 'GitHub / Zenodo / …' } },
    { name: 'publications', type: 'relationship', relationTo: 'publications', hasMany: true },
    { name: 'members', type: 'relationship', relationTo: 'members', hasMany: true },
  ],
}
