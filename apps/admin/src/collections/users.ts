import type { CollectionConfig } from 'payload';

/**
 * Payload-managed users (admin / editor / operator / seo).
 * Distinct from Supabase Auth users (front public). Skill: auth-role-management.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    tokenExpiration: 60 * 60 * 8, // 8h
    cookies: {
      sameSite: 'Strict',
      secure: process.env['NODE_ENV'] === 'production',
    },
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['name', 'email', 'role'],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'editor',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        { label: 'SEO', value: 'seo' },
        { label: 'Operator', value: 'operator' },
      ],
    },
  ],
  access: {
    read: ({ req: { user } }) => (user?.['role'] === 'admin' ? true : { id: { equals: user?.id } }),
    create: ({ req: { user } }) => user?.['role'] === 'admin',
    update: ({ req: { user } }) => user?.['role'] === 'admin',
    delete: ({ req: { user } }) => user?.['role'] === 'admin',
  },
};
