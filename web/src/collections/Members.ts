import type { CollectionConfig } from 'payload'

import { adminEditorOrSelf, adminOrEditor, anyone } from '../access'
import { slugField } from '../fields/slug'

export const Members: CollectionConfig = {
  slug: 'members',
  admin: {
    useAsTitle: 'name',
    group: 'Люди',
    defaultColumns: ['name', 'role', 'orcid'],
  },
  access: {
    read: anyone,
    create: adminOrEditor,
    // Член группы правит свой профиль сам (связь через поле user)
    update: adminEditorOrSelf,
    delete: adminOrEditor,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    slugField('name'),
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      unique: true,
      admin: {
        position: 'sidebar',
        description: 'Аккаунт для self-edit профиля',
      },
      access: {
        update: ({ req: { user } }) => user?.role === 'admin' || user?.role === 'editor',
      },
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Faculty', value: 'faculty' },
        { label: 'Researcher', value: 'researcher' },
        { label: 'PhD student', value: 'phd' },
        { label: 'MSc student', value: 'msc' },
        { label: 'Alumni', value: 'alumni' },
      ],
    },
    {
      name: 'photo',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'bio',
      type: 'richText',
    },
    {
      name: 'bioAiDraft',
      type: 'textarea',
      admin: {
        description:
          'AI-черновик био. Генерируется пайплайном; владелец профиля переносит нужное в bio.',
      },
    },
    {
      name: 'researchInterests',
      type: 'text',
      hasMany: true,
    },
    {
      type: 'row',
      fields: [
        { name: 'orcid', type: 'text', admin: { width: '33%' } },
        { name: 'openalexId', type: 'text', admin: { width: '33%' } },
        { name: 'dblpKey', type: 'text', admin: { width: '33%' } },
      ],
    },
    {
      name: 'links',
      type: 'group',
      fields: [
        {
          name: 'linkedin',
          type: 'text',
          admin: { description: 'LinkedIn или страница Técnico — по ТЗ обязательно' },
        },
        { name: 'tecnicoPage', type: 'text' },
        { name: 'personalPage', type: 'text' },
        { name: 'googleScholar', type: 'text' },
        { name: 'github', type: 'text' },
      ],
    },
    {
      name: 'email',
      type: 'email',
    },
    {
      name: 'showEmail',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Показывать email на сайте (согласие владельца)' },
    },
    {
      name: 'careerTrajectory',
      type: 'textarea',
      admin: {
        description: 'Карьерная траектория (для alumni)',
        condition: (data) => data?.role === 'alumni',
      },
    },
  ],
}
