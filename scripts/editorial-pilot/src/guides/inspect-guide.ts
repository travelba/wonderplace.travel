/**
 * CLI to inspect a single guide's generated content. Useful to QA
 * v2 pilot output before deciding to scale up.
 *
 * Usage:
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/guides/inspect-guide.ts paris
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadDotenv({ path: path.resolve(__dirname, '../../../../.env.local') });
loadDotenv({ path: path.resolve(__dirname, '../../../../.env') });

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/u)
    .filter((w) => w.length > 0).length;
}

interface Section {
  type: string;
  title_fr: string;
  body_fr: string;
  body_en?: string;
}
interface Faq {
  question_fr: string;
  answer_fr: string;
  section_anchor?: string | null;
  category?: string;
}
interface Highlight {
  name_fr: string;
  type: string;
  description_fr: string;
}
interface Table {
  kind: string;
  title_fr: string;
  headers: ReadonlyArray<{ label_fr: string }>;
  rows: ReadonlyArray<Record<string, unknown>>;
}
interface Callout {
  kind: string;
  title_fr: string;
  body_fr: string;
}
interface Source {
  url: string;
  type: string;
  label_fr: string;
}

async function main(): Promise<void> {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: tsx src/guides/inspect-guide.ts <slug>');
    process.exit(1);
  }
  const pgModule = (await import('pg')) as typeof import('pg');
  const conn =
    process.env['DATABASE_URL'] ??
    process.env['SUPABASE_DB_POOLER_URL'] ??
    process.env['SUPABASE_DB_URL'];
  if (!conn) {
    console.error('Set DATABASE_URL or SUPABASE_DB_POOLER_URL.');
    process.exit(1);
  }
  const cleaned = conn.replace(/[?&]sslmode=[^&]*/giu, '');
  const client = new pgModule.Client({
    connectionString: cleaned,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const r = await client.query(
      'select slug, name_fr, sections, faq, highlights, tables, glossary, external_sources, editorial_callouts from public.editorial_guides where slug=$1',
      [slug],
    );
    if (r.rows.length === 0) {
      console.error(`No guide with slug "${slug}".`);
      process.exit(1);
    }
    const g = r.rows[0];
    const sections = g.sections as Section[];
    const faq = g.faq as Faq[];
    const highlights = g.highlights as Highlight[];
    const tables = (g.tables ?? []) as Table[];
    const glossary = (g.glossary ?? []) as Array<{ term_fr: string; definition_fr: string }>;
    const sources = (g.external_sources ?? []) as Source[];
    const callouts = (g.editorial_callouts ?? []) as Callout[];

    let totalWordsFr = 0;
    console.log(`\n=== ${g.name_fr} (${g.slug}) ===\n`);
    console.log(`SECTIONS (${sections.length}):`);
    for (const s of sections) {
      const w = countWords(s.body_fr);
      totalWordsFr += w;
      console.log(
        `  [${s.type.padEnd(15)}] ${w.toString().padStart(4)} mots — ${s.title_fr.slice(0, 70)}`,
      );
    }
    const wHl = highlights.reduce((a, h) => a + countWords(h.description_fr), 0);
    const wFq = faq.reduce((a, f) => a + countWords(f.answer_fr ?? ''), 0);
    const wGl = glossary.reduce((a, g2) => a + countWords(g2.definition_fr ?? ''), 0);
    const wCo = callouts.reduce((a, c) => a + countWords(c.body_fr ?? ''), 0);
    totalWordsFr += wHl + wFq + wGl + wCo;

    console.log(`\nHIGHLIGHTS (${highlights.length}): ${wHl} mots`);
    console.log(`FAQ (${faq.length}): ${wFq} mots`);
    console.log(`  - globales : ${faq.filter((f) => !f.section_anchor).length}`);
    console.log(`  - contextuelles : ${faq.filter((f) => Boolean(f.section_anchor)).length}`);
    console.log(`GLOSSARY (${glossary.length}): ${wGl} mots`);
    console.log(`CALLOUTS (${callouts.length}): ${wCo} mots`);
    console.log(`TABLES (${tables.length}):`);
    for (const t of tables) {
      console.log(
        `  [${t.kind.padEnd(20)}] ${t.title_fr} — ${t.headers.length} cols × ${t.rows.length} rows`,
      );
    }
    console.log(`SOURCES (${sources.length}):`);
    const byType = new Map<string, number>();
    for (const s of sources) byType.set(s.type, (byType.get(s.type) ?? 0) + 1);
    for (const [t, n] of byType.entries()) console.log(`  ${t}: ${n}`);

    console.log(`\nTOTAL FR ≈ ${totalWordsFr} mots (cible ≥ 3500)`);
    console.log(`Verdict: ${totalWordsFr >= 3500 ? '✓ OK' : '⚠ trop court'}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
