import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';

function withLocalePrefix(locale: 'fr' | 'en', path: string): string {
  if (locale === 'fr') return path;
  if (path === '/') return '/en';
  return `/en${path}`;
}

/**
 * Auto-links named entities (Palaces, cities, brands, categories,
 * rankings) inside a long-form body text. The component is the
 * cornerstone of the "maillage interne très puissant" requirement:
 * every editorial paragraph weaves its way back into the site's
 * navigation graph without manual hand-rolling per article.
 *
 * Entities are passed in via the `linkMap` prop — a build-time
 * dictionary { displayName → href } prepared by the page-level
 * server component (cf. `apps/web/src/server/editorial/build-link-map.ts`).
 *
 * Implementation:
 *   - Splits the body on whitespace-preserving regex.
 *   - Replaces FIRST occurrence of each linkable entity per paragraph
 *     (rule: never link the same entity twice in the same paragraph
 *     to avoid over-linking — Google penalty signal).
 *   - Skips matches inside hrefs (already linked) — handled by the
 *     fact that linkMap entries don't contain HTML.
 *
 * Skill: seo-technical §internal-linking, performance-engineering.
 */

interface Props {
  readonly body: string;
  readonly locale: 'fr' | 'en';
  readonly linkMap: ReadonlyMap<string, string>;
  /** Cap on auto-links per paragraph (default 4 — avoid over-linking). */
  readonly maxLinksPerParagraph?: number;
}

interface MatchRange {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly href: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * Find all candidate matches in a paragraph. Each entity is matched
 * case-INSENSITIVELY but its surface form keeps the original casing
 * from the text. Word-boundary check uses Unicode-aware delimiters
 * (handles French accents, hyphens, apostrophes).
 */
function findMatches(paragraph: string, linkMap: ReadonlyMap<string, string>): MatchRange[] {
  const results: MatchRange[] = [];
  const used = new Set<string>();

  // Sort entries by descending name length so we match longer strings
  // first ("Plaza Athénée" before "Plaza").
  const entries = Array.from(linkMap.entries()).sort((a, b) => b[0].length - a[0].length);

  for (const [name, href] of entries) {
    if (used.has(name.toLowerCase())) continue;
    if (name.length < 3) continue;
    const pattern = new RegExp(
      `(?<=^|[^\\p{L}\\p{N}])${escapeRegex(name)}(?=[^\\p{L}\\p{N}]|$)`,
      'iu',
    );
    const m = pattern.exec(paragraph);
    if (m === null) continue;
    const start = m.index;
    const end = start + name.length;

    // Skip if overlaps an already-claimed range.
    let overlap = false;
    for (const r of results) {
      if (start < r.end && end > r.start) {
        overlap = true;
        break;
      }
    }
    if (overlap) continue;

    results.push({ start, end, text: paragraph.slice(start, end), href });
    used.add(name.toLowerCase());
  }

  return results.sort((a, b) => a.start - b.start);
}

function renderParagraph(
  paragraph: string,
  linkMap: ReadonlyMap<string, string>,
  locale: 'fr' | 'en',
  maxLinks: number,
  keyBase: string,
): ReactNode {
  const matches = findMatches(paragraph, linkMap).slice(0, maxLinks);
  if (matches.length === 0) return paragraph;

  const out: ReactNode[] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    if (m.start > cursor) out.push(paragraph.slice(cursor, m.start));
    const href = m.href.startsWith('/') ? withLocalePrefix(locale, m.href) : m.href;
    out.push(
      <Link
        key={`${keyBase}-${i}`}
        href={href}
        className="text-fg decoration-fg/30 hover:decoration-fg underline underline-offset-2"
      >
        {m.text}
      </Link>,
    );
    cursor = m.end;
  });
  if (cursor < paragraph.length) out.push(paragraph.slice(cursor));
  return out;
}

export function EnrichedText({
  body,
  locale,
  linkMap,
  maxLinksPerParagraph = 4,
}: Props): ReactElement {
  // Split on blank lines to render proper paragraphs.
  const paragraphs = body
    .split(/\n{2,}/u)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <div className="text-fg/90 space-y-4 leading-relaxed">
      {paragraphs.map((p, i) => (
        <p key={i}>{renderParagraph(p, linkMap, locale, maxLinksPerParagraph, `p${i}`)}</p>
      ))}
    </div>
  );
}
