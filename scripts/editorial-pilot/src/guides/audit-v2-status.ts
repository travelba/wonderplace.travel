/**
 * CLI to audit which `editorial_guides` / `editorial_rankings` rows
 * already have v2 content (TOC anchors populated) vs still on the
 * legacy v1 shape. Used to scope the scale-up phase.
 *
 * Usage:
 *   pnpm --filter @cct/editorial-pilot exec tsx \
 *     src/guides/audit-v2-status.ts
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadDotenv({ path: path.resolve(__dirname, '../../../../.env.local') });
loadDotenv({ path: path.resolve(__dirname, '../../../../.env') });

interface GuideRow {
  slug: string;
  is_v2: boolean;
  total_words_fr: number;
  is_published: boolean;
}

interface RankingRow {
  slug: string;
  is_v2: boolean;
  total_words_fr: number;
  is_published: boolean;
}

function countWords(text: unknown): number {
  if (typeof text !== 'string') return 0;
  return text
    .trim()
    .split(/\s+/u)
    .filter((w) => w.length > 0).length;
}

async function main(): Promise<void> {
  const pgModule = (await import('pg')) as typeof import('pg');
  const conn =
    process.env['DATABASE_URL'] ??
    process.env['SUPABASE_DB_POOLER_URL'] ??
    process.env['SUPABASE_DB_URL'];
  if (!conn) throw new Error('Missing DATABASE_URL / SUPABASE_DB_POOLER_URL');
  // Strip `sslmode=*` so the new `pg` (>= 8.16) doesn't force verify-full —
  // the explicit `ssl: { rejectUnauthorized: false }` below is enough to
  // get the handshake through Supabase's self-signed pool cert.
  const cleaned = conn.replace(/[?&]sslmode=[^&]*/giu, '');
  const client = new pgModule.Client({
    connectionString: cleaned,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    // ── Guides ──────────────────────────────────────────────────────────
    const guides = await client.query<{
      slug: string;
      is_published: boolean;
      toc_anchors: unknown;
      sections: unknown;
      highlights: unknown;
      faq: unknown;
      summary_fr: string | null;
    }>(
      `select slug, is_published, toc_anchors, sections, highlights, faq, summary_fr
       from public.editorial_guides
       order by slug`,
    );

    const guideRows: GuideRow[] = guides.rows.map((g) => {
      const tocAnchors = Array.isArray(g.toc_anchors) ? g.toc_anchors : [];
      const isV2 = tocAnchors.length > 0;
      const sections = Array.isArray(g.sections) ? (g.sections as Array<{ body_fr?: string }>) : [];
      const highlights = Array.isArray(g.highlights)
        ? (g.highlights as Array<{ description_fr?: string }>)
        : [];
      const faq = Array.isArray(g.faq) ? (g.faq as Array<{ answer_fr?: string }>) : [];
      const bodyW = sections.reduce((a, s) => a + countWords(s.body_fr), 0);
      const hlW = highlights.reduce((a, h) => a + countWords(h.description_fr), 0);
      const faqW = faq.reduce((a, f) => a + countWords(f.answer_fr), 0);
      return {
        slug: g.slug,
        is_v2: isV2,
        total_words_fr: bodyW + hlW + faqW,
        is_published: g.is_published,
      };
    });

    // ── Rankings ────────────────────────────────────────────────────────
    const rankings = await client.query<{
      slug: string;
      is_published: boolean;
      toc_anchors: unknown;
      intro_fr: string | null;
      outro_fr: string | null;
      editorial_sections: unknown;
      faq: unknown;
    }>(
      `select slug, is_published, toc_anchors, intro_fr, outro_fr, editorial_sections, faq
       from public.editorial_rankings
       order by slug`,
    );

    const entriesRow = await client.query<{ ranking_id: string; justification_fr: string }>(
      `select ranking_id, justification_fr from public.editorial_ranking_entries`,
    );
    const justifWordsByRanking = new Map<string, number>();
    for (const r of entriesRow.rows) {
      const acc = justifWordsByRanking.get(r.ranking_id) ?? 0;
      justifWordsByRanking.set(r.ranking_id, acc + countWords(r.justification_fr));
    }
    const rankingIds = await client.query<{ id: string; slug: string }>(
      `select id, slug from public.editorial_rankings`,
    );
    const slugById = new Map(rankingIds.rows.map((r) => [r.id, r.slug]));

    const rankingRows: RankingRow[] = rankings.rows.map((r) => {
      const tocAnchors = Array.isArray(r.toc_anchors) ? r.toc_anchors : [];
      const isV2 = tocAnchors.length > 0;
      const sections = Array.isArray(r.editorial_sections)
        ? (r.editorial_sections as Array<{ body_fr?: string }>)
        : [];
      const faq = Array.isArray(r.faq) ? (r.faq as Array<{ answer_fr?: string }>) : [];
      const introW = countWords(r.intro_fr);
      const outroW = countWords(r.outro_fr);
      const sectionsW = sections.reduce((a, s) => a + countWords(s.body_fr), 0);
      const faqW = faq.reduce((a, f) => a + countWords(f.answer_fr), 0);
      const id = rankingIds.rows.find((x) => x.slug === r.slug)?.id;
      const entriesW = id ? (justifWordsByRanking.get(id) ?? 0) : 0;
      return {
        slug: r.slug,
        is_v2: isV2,
        total_words_fr: introW + outroW + sectionsW + faqW + entriesW,
        is_published: r.is_published,
      };
    });

    // Suppress unused warning
    void slugById;

    // ── Output ──────────────────────────────────────────────────────────
    console.log('\n=== GUIDES ===');
    console.log('slug                              v2?    words  published');
    for (const g of guideRows) {
      const pad = (s: string, n: number) => s.padEnd(n);
      console.log(
        `${pad(g.slug, 34)}${pad(g.is_v2 ? '✓' : '✗', 7)}${pad(String(g.total_words_fr), 7)}${g.is_published ? '✓' : '✗'}`,
      );
    }
    const v2Guides = guideRows.filter((g) => g.is_v2);
    const v1Guides = guideRows.filter((g) => !g.is_v2);
    console.log(`\nGuides v2: ${v2Guides.length} | v1 (à régénérer): ${v1Guides.length}`);
    if (v1Guides.length > 0) {
      console.log('→ slugs à régénérer en v2 :');
      console.log(`  ${v1Guides.map((g) => g.slug).join(', ')}`);
    }

    console.log('\n=== RANKINGS ===');
    console.log('slug                              v2?    words  published');
    for (const r of rankingRows) {
      const pad = (s: string, n: number) => s.padEnd(n);
      console.log(
        `${pad(r.slug, 34)}${pad(r.is_v2 ? '✓' : '✗', 7)}${pad(String(r.total_words_fr), 7)}${r.is_published ? '✓' : '✗'}`,
      );
    }
    const v2Rankings = rankingRows.filter((r) => r.is_v2);
    const v1Rankings = rankingRows.filter((r) => !r.is_v2);
    console.log(`\nRankings v2: ${v2Rankings.length} | v1 (à régénérer): ${v1Rankings.length}`);
    if (v1Rankings.length > 0) {
      console.log('→ slugs à régénérer en v2 :');
      console.log(`  ${v1Rankings.map((r) => r.slug).join(', ')}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
