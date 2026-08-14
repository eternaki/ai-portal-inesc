import type { CollectionConfig } from 'payload'

import { adminOrEditor, anyone } from '../access'
import { slugField } from '../fields/slug'

// Paid research jobs — a PhD contract, a postdoc, a junior researcher post. Kept
// apart from `dissertations` because it is a different process with a different
// person at the door: an applicant here has a degree and wants a salary, while a
// dissertation topic is picked by a student already enrolled at the university.
export const OpenPositions: CollectionConfig = {
  slug: 'open-positions',
  labels: { singular: 'Open position', plural: 'Open positions' },
  admin: {
    useAsTitle: 'title',
    group: 'Opportunities',
    defaultColumns: ['title', 'kind', 'status', 'deadline'],
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
          required: true,
          defaultValue: 'phd',
          options: [
            { label: 'PhD position', value: 'phd' },
            { label: 'Postdoc', value: 'postdoc' },
            { label: 'Researcher', value: 'researcher' },
            { label: 'Internship', value: 'internship' },
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
            { label: 'Closed', value: 'closed' },
          ],
          admin: {
            width: '50%',
            description: 'Only open positions are shown on the site; closed ones stay for the record.',
          },
        },
      ],
    },
    {
      name: 'deadline',
      type: 'date',
      admin: {
        description: 'Application deadline, if the call has one.',
        date: { pickerAppearance: 'dayOnly' },
      },
    },
    {
      name: 'applyUrl',
      type: 'text',
      admin: { description: 'Where to apply — usually the Euraxess posting.' },
    },
    { name: 'description', type: 'richText' },
    {
      name: 'contactEmail',
      type: 'email',
      admin: { description: 'Shown on the position when there is no application link.' },
    },
  ],
}
