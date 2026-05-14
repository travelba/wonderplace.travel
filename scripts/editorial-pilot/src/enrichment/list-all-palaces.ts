/**
 * list-all-palaces.ts — discover every Atout France Palace from DATAtourisme.
 *
 * Strategy (no review-URI filter — DATAtourisme query syntax for nested
 * review values is undocumented, so we crawl by department instead):
 *
 *   1. For each "palace-bearing" department, fetch hotels with page_size=250.
 *   2. Keep only those whose classification.isPalace === true (computed from
 *      hasReview[].hasReviewValue.key === 'LabelRating_Palace').
 *   3. Dedupe by UUID across departments.
 *   4. Print a stable JSON list ready to feed into build-brief CLI.
 *
 * The Atout France Palace list (~32 hotels in 2026) is geographically
 * concentrated. Departments below cover 100% of historic and current
 * Palace holders (Paris, French Riviera, Alps, Bordeaux, Reims, Lyon).
 */

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { listHotelsInDepartment } from './datatourisme.js';
import { slugify } from './brief-builder.js';

const PALACE_BEARING_DEPARTMENTS: Array<{ insee: string; label: string }> = [
  { insee: '75', label: 'Paris' },
  { insee: '92', label: 'Hauts-de-Seine' },
  { insee: '06', label: 'Alpes-Maritimes (Riviera)' },
  { insee: '83', label: 'Var (Saint-Tropez)' },
  { insee: '13', label: 'Bouches-du-Rhône' },
  { insee: '33', label: 'Gironde (Bordeaux)' },
  { insee: '17', label: 'Charente-Maritime' },
  { insee: '51', label: 'Marne (Reims)' },
  { insee: '69', label: 'Rhône (Lyon)' },
  { insee: '73', label: 'Savoie (Courchevel / Méribel)' },
  { insee: '74', label: 'Haute-Savoie (Megève / Évian)' },
];

async function main(): Promise<void> {
  const found = new Map<string, FoundPalace>();

  for (const dept of PALACE_BEARING_DEPARTMENTS) {
    console.log(`\n[dept ${dept.insee} — ${dept.label}] crawling full hotel catalog…`);
    try {
      const all = await listHotelsInDepartment(dept.insee, { pageSize: 250 });
      const palaces = all.filter((h) => h.classification.isPalace);
      console.log(`  ${all.length} accommodations total → ${palaces.length} palace(s)`);
      for (const p of palaces) {
        if (found.has(p.uuid)) continue;
        found.set(p.uuid, {
          uuid: p.uuid,
          slug: slugify(p.name),
          name: p.name,
          city: p.location.city,
          postal_code: p.location.postalCode,
          department: dept.insee,
          website: p.contact.website ?? null,
        });
        console.log(`    + ${p.name}`);
      }
    } catch (err) {
      console.warn(`  dept ${dept.insee} — ERROR: ${(err as Error).message}`);
    }
    await sleep(500);
  }

  const sorted = [...found.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  console.log(`\n━━━ ${sorted.length} unique palaces discovered ━━━`);
  for (const p of sorted) {
    console.log(`  ${p.slug.padEnd(40)} ${p.name} — ${p.city} (${p.department})`);
  }

  const outPath = resolve(process.cwd(), 'briefs-auto', '_palaces-discovered.json');
  await writeFile(outPath, JSON.stringify(sorted, null, 2), 'utf-8');
  console.log(`\n✓ Wrote ${sorted.length} entries to ${outPath}`);
}

interface FoundPalace {
  readonly uuid: string;
  readonly slug: string;
  readonly name: string;
  readonly city: string;
  readonly postal_code: string;
  readonly department: string;
  readonly website: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error(`[list-all-palaces] FAILED:`, err);
  process.exit(1);
});
