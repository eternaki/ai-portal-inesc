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
      // Порядок авторов важен; внешние соавторы — просто строкой без связи
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
      type: 'row',
      fields: [
        { name: 'pdfUrl', type: 'text', admin: { width: '70%' } },
        { name: 'citationCount', type: 'number', admin: { width: '30%' } },
      ],
    },
    {
      // OpenAlex ID работ, на которые ссылается статья — для блока related citations
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
        description: 'Проверено человеком (авторство/метаданные корректны)',
      },
    },
    {
      // Формат alphaxiv "Blog mode"
      name: 'aiSummary',
      type: 'group',
      admin: { description: 'AI-саммари; после ручной правки поставьте статус edited' },
      fields: [
        { name: 'tldr', type: 'textarea', label: 'TL;DR' },
        { name: 'problem', type: 'textarea' },
        { name: 'method', type: 'textarea' },
        { name: 'results', type: 'textarea' },
        { name: 'takeaways', type: 'textarea' },
        {
          name: 'industry',
          type: 'textarea',
          admin: { description: 'Нетехническое описание для индустрии' },
        },
        {
          name: 'impact',
          type: 'textarea',
          admin: { description: 'Импакт-нарратив: значимость, применения' },
        },
      ],
    },
    {
      name: 'aiSummaryStatus',
      type: 'select',
      defaultValue: 'none',
      index: true,
      options: [
        { label: 'Нет саммари', value: 'none' },
        { label: 'Сгенерировано AI', value: 'generated' },
        { label: 'Отредактировано человеком', value: 'edited' },
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
      admin: { description: 'Готовый текст поста для LinkedIn/X (генерируется по запросу)' },
    },
  ],
}
