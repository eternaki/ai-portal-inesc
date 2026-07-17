import type { CollectionConfig } from 'payload'

import { adminOrEditor, anyone } from '../access'
import { slugField } from '../fields/slug'
import { autoProcessPublication } from '../hooks/autoProcessPublication'

export const Publications: CollectionConfig = {
  slug: 'publications',
  hooks: {
    afterChange: [autoProcessPublication],
  },
  admin: {
    useAsTitle: 'title',
    group: 'Research',
    defaultColumns: ['title', 'year', 'venue', 'type', 'aiSummaryStatus'],
    listSearchableFields: ['title', 'venue', 'doi'],
  },
  access: {
    read: anyone,
    create: adminOrEditor,
    update: adminOrEditor,
    delete: adminOrEditor,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    slugField('title'),
    {
      type: 'row',
      fields: [
        { name: 'year', type: 'number', required: true, index: true, admin: { width: '25%' } },
        {
          name: 'type',
          type: 'select',
          required: true,
          defaultValue: 'conference',
          options: [
            { label: 'Journal', value: 'journal' },
            { label: 'Conference', value: 'conference' },
            { label: 'Workshop', value: 'workshop' },
            { label: 'Book / Chapter', value: 'book' },
            { label: 'Preprint', value: 'preprint' },
            { label: 'Other', value: 'other' },
          ],
          admin: { width: '25%' },
        },
        { name: 'venue', type: 'text', admin: { width: '50%' } },
      ],
    },
    {
      // Author order matters; external co-authors are just a string, unlinked
      name: 'authors',
      type: 'array',
      labels: { singular: 'Author', plural: 'Authors' },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'member', type: 'relationship', relationTo: 'members' },
      ],
    },
    {
      name: 'abstract',
      type: 'textarea',
    },
    {
      type: 'row',
      fields: [
        { name: 'doi', type: 'text', unique: true, index: true, admin: { width: '50%' } },
        { name: 'openalexId', type: 'text', unique: true, index: true, admin: { width: '50%' } },
      ],
    },
    {
      // Landing page of the original publication (arXiv / journal / DOI page).
      // Filled from OpenAlex on ingest; falls back to DOI / PDF on the page.
      name: 'originalUrl',
      type: 'text',
      admin: { description: 'Link to the original publication (arXiv / journal / DOI page)' },
    },
    {
      type: 'row',
      fields: [
        { name: 'pdfUrl', type: 'text', admin: { width: '70%' } },
        { name: 'citationCount', type: 'number', admin: { width: '30%' } },
      ],
    },
    {
      // Materials attached to the paper: code, documents, images, data, links.
      // Each item is either an uploaded file (image/pdf/doc) or an external URL
      // (e.g. a GitHub repo). Shown with previews on the publication page.
      name: 'attachments',
      type: 'array',
      labels: { singular: 'Attachment', plural: 'Attachments' },
      admin: { description: 'Code, documents, images, datasets or links for this publication' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'label', type: 'text', required: true, admin: { width: '55%' } },
            {
              name: 'kind',
              type: 'select',
              required: true,
              defaultValue: 'file',
              options: [
                { label: 'Code (repo)', value: 'code' },
                { label: 'Document', value: 'document' },
                { label: 'Image / Figure', value: 'image' },
                { label: 'Dataset', value: 'dataset' },
                { label: 'File', value: 'file' },
                { label: 'Link', value: 'link' },
              ],
              admin: { width: '45%' },
            },
          ],
        },
        {
          name: 'file',
          type: 'upload',
          relationTo: 'media',
          admin: { description: 'Upload a file, or leave empty and use an external URL below' },
        },
        {
          name: 'url',
          type: 'text',
          admin: { description: 'External URL (e.g. GitHub repo) — used when no file is uploaded' },
        },
      ],
    },
    {
      // OpenAlex IDs of works this paper references — for the related-citations block
      name: 'referencedWorks',
      type: 'text',
      hasMany: true,
      admin: { hidden: true },
    },
    {
      name: 'verified',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'Verified by a human (authorship/metadata are correct)',
      },
    },
    {
      // alphaxiv "Blog mode" format
      name: 'aiSummary',
      type: 'group',
      admin: { description: 'AI summary; after editing by hand, set the status to edited' },
      fields: [
        { name: 'tldr', type: 'textarea', label: 'TL;DR' },
        { name: 'problem', type: 'textarea' },
        { name: 'method', type: 'textarea' },
        { name: 'results', type: 'textarea' },
        { name: 'takeaways', type: 'textarea' },
        {
          name: 'industry',
          type: 'textarea',
          admin: { description: 'Non-technical description for industry' },
        },
        {
          name: 'impact',
          type: 'textarea',
          admin: { description: 'Impact narrative: significance, applications' },
        },
      ],
    },
    {
      name: 'aiSummaryStatus',
      type: 'select',
      defaultValue: 'none',
      index: true,
      options: [
        { label: 'No summary', value: 'none' },
        { label: 'AI-generated', value: 'generated' },
        { label: 'Edited by a human', value: 'edited' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'generateSnippet',
      type: 'ui',
      admin: {
        components: { Field: '/components/admin/GenerateSnippetButton#GenerateSnippetButton' },
      },
    },
    {
      name: 'socialSnippet',
      type: 'textarea',
      admin: { description: 'Ready-to-post text for LinkedIn/X (generated on demand)' },
    },
  ],
}
