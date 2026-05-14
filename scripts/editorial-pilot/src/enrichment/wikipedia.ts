/**
 * Wikipedia REST API client (no auth, no quota strict, custom UA recommended).
 *
 * Used to pull a clean narrative summary (~500-800 words) for a hotel article.
 * The summary is *one* source among many — its facts must still be cross-
 * checked by the editorial pipeline's fact-check pass.
 *
 * Doc: https://en.wikipedia.org/api/rest_v1/
 */

import { z } from 'zod';

const USER_AGENT =
  'ConciergeTravelEditorialPilot/0.1 (https://conciergetravel.fr; reservations@conciergetravel.fr)';

export interface WpSummary {
  readonly title: string;
  readonly url: string;
  readonly lang: string;
  readonly description: string | null;
  readonly extract: string;
  readonly extractHtml: string | null;
}

const WpSummarySchema = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    extract: z.string(),
    extract_html: z.string().optional(),
    content_urls: z
      .object({
        desktop: z.object({ page: z.string() }).partial().optional(),
      })
      .partial()
      .optional(),
    lang: z.string().optional(),
  })
  .passthrough();

/**
 * Fetch a Wikipedia page summary by title and language.
 * @param title — page title (URL-encoded internally). Accepts the human form: "Hôtel Plaza Athénée".
 * @param lang  — wiki language code (default 'fr').
 */
export async function fetchSummary(
  title: string,
  lang: 'fr' | 'en' = 'fr',
): Promise<WpSummary | null> {
  const encoded = encodeURIComponent(title.replace(/\s/gu, '_'));
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `Wikipedia ${res.status} for ${title} (${lang}): ${(await res.text()).slice(0, 200)}`,
    );
  }
  const raw = await res.json();
  const parsed = WpSummarySchema.parse(raw);
  return {
    title: parsed.title,
    url: parsed.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encoded}`,
    lang: parsed.lang ?? lang,
    description: parsed.description ?? null,
    extract: parsed.extract,
    extractHtml: parsed.extract_html ?? null,
  };
}

/**
 * Convenience: try several title variants. Useful when the official hotel name
 * does not match the Wikipedia article exactly.
 * Stops at the first hit.
 */
export async function fetchSummaryWithFallbacks(
  candidates: readonly string[],
  lang: 'fr' | 'en' = 'fr',
): Promise<WpSummary | null> {
  for (const title of candidates) {
    if (!title.trim()) continue;
    const r = await fetchSummary(title, lang);
    if (r !== null) return r;
  }
  return null;
}
