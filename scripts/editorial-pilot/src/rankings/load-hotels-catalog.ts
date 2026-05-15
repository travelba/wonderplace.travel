import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HotelRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  slug_en: z.string().nullable(),
  name: z.string(),
  name_en: z.string().nullable(),
  stars: z.number().int(),
  is_palace: z.boolean(),
  city: z.string(),
  region: z.string(),
  description_fr: z.string().nullable(),
  address: z.string().nullable(),
  postal_code: z.string().nullable(),
  latitude: z.union([z.string(), z.number()]).nullable(),
  longitude: z.union([z.string(), z.number()]).nullable(),
});

export type HotelCatalogRow = z.infer<typeof HotelRowSchema>;

export async function loadHotelsCatalog(): Promise<readonly HotelCatalogRow[]> {
  const p = path.resolve(__dirname, '../../out/hotels-catalog.json');
  const raw = await fs.readFile(p, 'utf8');
  const parsed = z.array(HotelRowSchema).safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(
      `[load-hotels-catalog] invalid JSON: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
    );
  }
  return parsed.data;
}
