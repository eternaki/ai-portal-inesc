import type { CollectionConfig } from 'payload'

import { adminOnly, adminOnlyField } from '../access'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    group: 'Система',
  },
  // useAPIKey: сервисный аккаунт AI-пайплайнов ходит в REST API по ключу
  auth: {
    useAPIKey: true,
  },
  access: {
    // Аккаунты создаёт/удаляет только админ; свой профиль пользователь читает и правит сам
    create: adminOnly,
    delete: adminOnly,
    read: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      return { id: { equals: user.id } }
    },
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      return { id: { equals: user.id } }
    },
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'member',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        { label: 'Member', value: 'member' },
      ],
      // Роли раздаёт только админ — иначе member повысил бы сам себя
      access: {
        create: adminOnlyField,
        update: adminOnlyField,
      },
    },
  ],
}
