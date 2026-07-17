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
      // Required for images (accessibility); optional for documents/code/data
      type: 'text',
    },
  ],
  upload: {
    imageSizes: [
      { name: 'thumbnail', width: 300, height: 300, position: 'centre' },
      { name: 'card', width: 800, height: undefined },
    ],
    // Publication attachments: images, PDFs, documents, code, and data files
    mimeTypes: [
      'image/*',
      'application/pdf',
      'text/*',
      'application/zip',
      'application/json',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/octet-stream',
    ],
  },
}
