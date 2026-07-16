import type { CollectionConfig } from 'payload'

import { adminOrEditor } from '../access'

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    group: 'Content',
  },
  access: {
    read: () => true,
    create: adminOrEditor,
    update: adminOrEditor,
    delete: adminOrEditor,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: {
    imageSizes: [
      { name: 'thumbnail', width: 300, height: 300, position: 'centre' },
      { name: 'card', width: 800, height: undefined },
    ],
    mimeTypes: ['image/*', 'application/pdf'],
  },
}
