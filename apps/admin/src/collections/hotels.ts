import type { CollectionConfig } from 'payload';

/**
 * Hotels — Payload-managed editorial mirror of `public.hotels`.
 *
 * Phase 8 chantier D. ADR: docs/adr/0010-payload-dual-table-mirror.md.
 *
 * - Lives in the **`cms` schema** (`cms.hotels`) — never overlaps the
 *   canonical `public.hotels` table managed by SQL migrations.
 * - Field shape mirrors `public.hotels` 1:1 (including JSONB structures)
 *   so the eventual `afterChange` sync hook (Phase 8.1) is a straight
 *   UPSERT into `public.hotels`.
 * - For now, edits are stored only in `cms.hotels`. The public site
 *   keeps reading `public.hotels`, so editorial changes are NOT yet
 *   visible until the sync hook ships.
 *
 * RBAC:
 *   - read: any authenticated Payload user (admin/editor/seo/operator).
 *   - create/update: admin + editor.
 *   - delete: admin only (palaces are P0 content — no accidental deletes).
 *
 * Skill: backoffice-cms + content-modeling.
 */
const PRIORITY_OPTIONS = [
  { label: 'P0 — Palace flagship', value: 'P0' },
  { label: 'P1 — Premium', value: 'P1' },
  { label: 'P2 — Standard', value: 'P2' },
] as const;

const BOOKING_MODE_OPTIONS = [
  { label: 'Amadeus GDS (online booking)', value: 'amadeus' },
  { label: 'Little Hotelier (online booking)', value: 'little' },
  { label: 'Email request (concierge)', value: 'email' },
  { label: 'Display only (vitrine)', value: 'display_only' },
] as const;

interface PayloadUserRole {
  readonly role?: string;
}

function hasRole(user: unknown, roles: readonly string[]): boolean {
  if (user === null || typeof user !== 'object') return false;
  const role = (user as PayloadUserRole).role;
  return typeof role === 'string' && roles.includes(role);
}

export const Hotels: CollectionConfig = {
  slug: 'hotels',
  // Owns `cms.hotels` — NEVER public.hotels (canonical SQL-migrated table).
  // See ADR 0010 for the dual-table sync strategy.
  dbName: 'hotels',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'city', 'priority', 'is_published', 'updated_at'],
    description:
      'Editorial mirror of public.hotels. Phase 8 scaffolding — edits do not yet sync to live. See ADR-0010.',
    listSearchableFields: ['name', 'slug', 'city'],
  },
  access: {
    read: ({ req: { user } }) => hasRole(user, ['admin', 'editor', 'seo', 'operator']),
    create: ({ req: { user } }) => hasRole(user, ['admin', 'editor']),
    update: ({ req: { user } }) => hasRole(user, ['admin', 'editor']),
    delete: ({ req: { user } }) => hasRole(user, ['admin']),
  },
  fields: [
    // -----------------------------------------------------------------
    // Identity & routing
    // -----------------------------------------------------------------
    {
      type: 'collapsible',
      label: 'Identity & routing',
      admin: { initCollapsed: false },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'slug', type: 'text', required: true, unique: true, admin: { width: '50%' } },
            { name: 'slug_en', type: 'text', unique: true, admin: { width: '50%' } },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'name', type: 'text', required: true, admin: { width: '50%' } },
            { name: 'name_en', type: 'text', admin: { width: '50%' } },
          ],
        },
      ],
    },

    // -----------------------------------------------------------------
    // Classification
    // -----------------------------------------------------------------
    {
      type: 'collapsible',
      label: 'Classification',
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'stars',
              type: 'number',
              required: true,
              defaultValue: 5,
              min: 5,
              max: 5,
              admin: { width: '33%', description: 'CDC v3.0: 5★ only.' },
            },
            {
              name: 'is_palace',
              type: 'checkbox',
              defaultValue: false,
              admin: { width: '33%', description: 'Atout France distinction.' },
            },
            {
              name: 'priority',
              type: 'select',
              required: true,
              defaultValue: 'P1',
              options: [...PRIORITY_OPTIONS],
              admin: { width: '34%' },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'booking_mode',
              type: 'select',
              required: true,
              defaultValue: 'email',
              options: [...BOOKING_MODE_OPTIONS],
              admin: { width: '50%' },
            },
            {
              name: 'is_published',
              type: 'checkbox',
              defaultValue: false,
              admin: { width: '50%', description: 'Toggles public visibility.' },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'is_little_catalog',
              type: 'checkbox',
              defaultValue: false,
              admin: { width: '50%', description: 'Eligible to FREE loyalty tier.' },
            },
            {
              name: 'atout_france_id',
              type: 'text',
              admin: { width: '50%' },
            },
          ],
        },
      ],
    },

    // -----------------------------------------------------------------
    // Location
    // -----------------------------------------------------------------
    {
      type: 'collapsible',
      label: 'Location',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'region', type: 'text', required: true, admin: { width: '50%' } },
            { name: 'department', type: 'text', admin: { width: '50%' } },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'city', type: 'text', required: true, admin: { width: '50%' } },
            { name: 'district', type: 'text', admin: { width: '50%' } },
          ],
        },
        { name: 'address', type: 'text' },
        {
          type: 'row',
          fields: [
            {
              name: 'postal_code',
              type: 'text',
              admin: {
                width: '50%',
                description:
                  'Postal code only. Format-checked at write time (FR: NNNNN, EU shapes accepted).',
              },
            },
            {
              name: 'phone_e164',
              type: 'text',
              admin: {
                width: '50%',
                description:
                  'Front-desk phone in E.164 (e.g. "+33158122888"). Surfaces in JSON-LD and click-to-call.',
              },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'latitude',
              type: 'number',
              admin: { width: '50%', step: 0.000001 },
              min: -90,
              max: 90,
            },
            {
              name: 'longitude',
              type: 'number',
              admin: { width: '50%', step: 0.000001 },
              min: -180,
              max: 180,
            },
          ],
        },
        {
          name: 'points_of_interest',
          type: 'json',
          admin: {
            description:
              'Array of nearby POIs: { name, type, distance_m, walking_time_min?, latitude?, longitude?, sameAs? }. Sorted by distance ascending.',
          },
        },
        {
          name: 'transports',
          type: 'json',
          admin: {
            description:
              'Array of transport links: { mode: metro|rer|tram|bus|train|airport_shuttle, line?, name, distance_m, walk_min? }.',
          },
        },
      ],
    },

    // -----------------------------------------------------------------
    // Vendor IDs
    // -----------------------------------------------------------------
    {
      type: 'collapsible',
      label: 'Vendor IDs',
      admin: { initCollapsed: true },
      fields: [
        { name: 'amadeus_hotel_id', type: 'text' },
        { name: 'little_hotel_id', type: 'text' },
        { name: 'makcorps_hotel_id', type: 'text' },
        { name: 'google_place_id', type: 'text' },
      ],
    },

    // -----------------------------------------------------------------
    // Editorial content
    // -----------------------------------------------------------------
    {
      type: 'collapsible',
      label: 'Editorial content',
      fields: [
        {
          type: 'tabs',
          tabs: [
            {
              label: 'French',
              fields: [
                {
                  name: 'description_fr',
                  type: 'textarea',
                  admin: { rows: 8 },
                },
                {
                  name: 'meta_title_fr',
                  type: 'text',
                  maxLength: 60,
                  admin: { description: '50–60 chars.' },
                },
                {
                  name: 'meta_desc_fr',
                  type: 'textarea',
                  maxLength: 160,
                  admin: { rows: 3, description: '140–160 chars.' },
                },
              ],
            },
            {
              label: 'English',
              fields: [
                { name: 'description_en', type: 'textarea', admin: { rows: 8 } },
                { name: 'meta_title_en', type: 'text', maxLength: 60 },
                {
                  name: 'meta_desc_en',
                  type: 'textarea',
                  maxLength: 160,
                  admin: { rows: 3 },
                },
              ],
            },
          ],
        },
      ],
    },

    // -----------------------------------------------------------------
    // Media (Cloudinary public_ids)
    // -----------------------------------------------------------------
    {
      type: 'collapsible',
      label: 'Media',
      fields: [
        {
          name: 'hero_image',
          type: 'text',
          admin: {
            description: 'Cloudinary public_id (e.g. cct/hotels/peninsula-paris/exterior-1).',
          },
        },
        {
          name: 'gallery_images',
          type: 'json',
          admin: {
            description:
              'Array of { public_id, alt_fr?, alt_en?, category? }. See packages/db/scripts/seed-peninsula-paris.ts for shape.',
          },
        },
      ],
    },

    // -----------------------------------------------------------------
    // Structured editorial JSONB
    // -----------------------------------------------------------------
    {
      type: 'collapsible',
      label: 'Structured data',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'highlights',
          type: 'json',
          admin: {
            description:
              'Array of { key, label_fr, label_en } or plain strings — short editorial highlights.',
          },
        },
        {
          name: 'amenities',
          type: 'json',
          admin: { description: 'Same shape as highlights — services & equipments.' },
        },
        {
          name: 'faq_content',
          type: 'json',
          admin: {
            description:
              'Array of { question_fr, question_en, answer_fr, answer_en } for the FAQ block.',
          },
        },
        {
          name: 'restaurant_info',
          type: 'json',
          admin: {
            description:
              'Object: { count, michelin_stars, venues: [{ name, type_fr, type_en, michelin_stars?, chef?, ... }] }.',
          },
        },
        {
          name: 'spa_info',
          type: 'json',
          admin: {
            description:
              'Object: { name, surface_sqm?, treatment_rooms?, features_fr[], features_en[] }.',
          },
        },
        {
          name: 'signature_experiences',
          type: 'json',
          admin: {
            description:
              'Array of signature experiences: { title_fr, title_en, body_fr, body_en, icon? }.',
          },
        },
        {
          name: 'long_description_sections',
          type: 'json',
          admin: {
            description:
              'Array of long-form story sections: { anchor (kebab-case), title_fr?, title_en?, body_fr?, body_en? }. Renders as <h3 id> + paragraphs.',
          },
        },
        {
          name: 'policies',
          type: 'json',
          admin: {
            description:
              'Object: { check_in, check_out, cancellation, pets, children, city_tax, wifi, payment_methods }. HH:MM regex enforced on times.',
          },
        },
        {
          name: 'awards',
          type: 'json',
          admin: {
            description:
              'Array of awards: { name, issuer, year, schema_type? }. Surfaces in HotelDistinctions UI + JSON-LD Hotel.award[].',
          },
        },
        {
          name: 'featured_reviews',
          type: 'json',
          admin: {
            description:
              'Array of editorial pull-quotes: { source, source_url?, author?, quote, rating?, max_rating?, date? }. Capped at 5 in JSON-LD.',
          },
        },
      ],
    },

    // -----------------------------------------------------------------
    // Inventory & history
    // -----------------------------------------------------------------
    {
      type: 'collapsible',
      label: 'Inventory & history',
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'number_of_rooms',
              type: 'number',
              min: 1,
              admin: {
                width: '50%',
                step: 1,
                description:
                  'Total bookable units (all categories). Maps to Schema.org numberOfRooms.',
              },
            },
            {
              name: 'number_of_suites',
              type: 'number',
              min: 0,
              admin: {
                width: '50%',
                step: 1,
                description: 'Editorial count of suites (subset of total rooms).',
              },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'opened_at',
              type: 'date',
              admin: {
                width: '50%',
                date: { pickerAppearance: 'dayOnly' },
                description:
                  'Original opening date. Year surfaces as Schema.org foundingDate + HotelFactSheet history line.',
              },
            },
            {
              name: 'last_renovated_at',
              type: 'date',
              admin: {
                width: '50%',
                date: { pickerAppearance: 'dayOnly' },
                description:
                  'Date of the most recent significant renovation. Must be >= opened_at.',
              },
            },
          ],
        },
        {
          name: 'virtual_tour_url',
          type: 'text',
          maxLength: 512,
          admin: {
            description:
              'External immersive 3D / 360° tour URL. Allowed hosts: https://my.matterport.com or https://kuula.co (CSP + DB CHECK enforce this — any other host is rejected at write time).',
            placeholder: 'https://my.matterport.com/show/?m=…',
          },
          validate: (value: unknown): true | string => {
            if (value === null || value === undefined || value === '') return true;
            if (typeof value !== 'string') return 'Must be a string.';
            if (value.length > 512) return 'Maximum 512 characters.';
            try {
              const url = new URL(value);
              if (url.protocol !== 'https:') return 'Must use https://.';
              if (url.hostname !== 'my.matterport.com' && url.hostname !== 'kuula.co') {
                return 'Host must be my.matterport.com or kuula.co.';
              }
            } catch {
              return 'Invalid URL.';
            }
            return true;
          },
        },
      ],
    },

    // -----------------------------------------------------------------
    // Reviews snapshot
    // -----------------------------------------------------------------
    {
      type: 'collapsible',
      label: 'Reviews snapshot',
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'google_rating',
              type: 'number',
              min: 0,
              max: 5,
              admin: { width: '33%', step: 0.1 },
            },
            {
              name: 'google_reviews_count',
              type: 'number',
              min: 0,
              admin: { width: '33%', step: 1 },
            },
            {
              name: 'last_reviews_sync',
              type: 'date',
              admin: { width: '34%', date: { pickerAppearance: 'dayAndTime' } },
            },
          ],
        },
      ],
    },
  ],
  hooks: {
    afterChange: [
      ({ doc, operation }) => {
        // Phase 8.1 TODO: sync `cms.hotels` row into `public.hotels`
        // (UPSERT by slug), then call the apps/web revalidate endpoint
        // with `tag = "hotel-${slug}"`. For now we log only so the
        // editorial team can experiment without touching live data.
        if (process.env['NODE_ENV'] !== 'production') {
          // eslint-disable-next-line no-console
          console.info(
            `[cms.hotels:${operation}] ${(doc as { slug?: string }).slug ?? '?'} — sync to public.hotels is Phase 8.1.`,
          );
        }
        return doc;
      },
    ],
  },
  timestamps: true,
};
