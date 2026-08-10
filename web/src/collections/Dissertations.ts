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
    {
      // Same shape as Publications.authors: the name is the fact and always
      // renders; the member link is a bonus when we can resolve the person. Of 37
      // legacy authors only 17 match a member, so a bare relationship would drop
      // the attribution on the other 20.
      name: 'supervisors',
      type: 'array',
      labels: { singular: 'Supervisor', plural: 'Supervisors' },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'member', type: 'relationship', relationTo: 'members' },
      ],
    },
    {
      name: 'author',
      type: 'group',
      admin: { description: 'The student writing or having written the thesis. Empty while the topic is open.' },
      fields: [
        { name: 'name', type: 'text' },
        { name: 'member', type: 'relationship', relationTo: 'members' },
      ],
    },
    { name: 'description', type: 'richText' },
    {
      name: 'requisites',
      type: 'richText',
      admin: { description: 'What a student needs to apply. Shown as its own block on the page.' },
    },
    {
      name: 'fenixUrl',
      type: 'text',
      admin: { description: 'Link to the defended thesis in the Fenix repository.' },
    },
    {
      name: 'sourceUrl',
      type: 'text',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Legacy page this record was imported from. Set by the importer.',
      },
    },
    { name: 'themes', type: 'relationship', relationTo: 'research-themes', hasMany: true },
  ],
}
