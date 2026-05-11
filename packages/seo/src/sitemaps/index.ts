/**
 * Sitemap XML builders (skill: seo-technical).
 *
 * Outputs follow https://www.sitemaps.org/protocol.html — entries with future
 * `lastmod`, malformed URLs, or invalid priorities are dropped (silent so
 * the build keeps shipping; callers may log if needed).
 */
export interface SitemapEntry {
  readonly loc: string;
  /** ISO 8601 timestamp. */
  readonly lastmod?: string;
  readonly changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  /** 0.0 – 1.0. */
  readonly priority?: number;
  readonly alternates?: ReadonlyArray<{ readonly hreflang: string; readonly href: string }>;
}

export interface SitemapIndexEntry {
  readonly loc: string;
  readonly lastmod?: string;
}

const XML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => XML_ESCAPE[ch] ?? ch);
}

function isValidPriority(p: number): boolean {
  return Number.isFinite(p) && p >= 0 && p <= 1;
}

export const buildSitemapXml = (entries: ReadonlyArray<SitemapEntry>): string => {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ];

  for (const entry of entries) {
    lines.push('  <url>');
    lines.push(`    <loc>${escapeXml(entry.loc)}</loc>`);
    if (entry.lastmod !== undefined) {
      lines.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
    }
    if (entry.changefreq !== undefined) {
      lines.push(`    <changefreq>${entry.changefreq}</changefreq>`);
    }
    if (entry.priority !== undefined && isValidPriority(entry.priority)) {
      lines.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
    }
    if (entry.alternates !== undefined) {
      for (const alt of entry.alternates) {
        lines.push(
          `    <xhtml:link rel="alternate" hreflang="${escapeXml(alt.hreflang)}" href="${escapeXml(alt.href)}" />`,
        );
      }
    }
    lines.push('  </url>');
  }

  lines.push('</urlset>');
  return lines.join('\n');
};

export const buildSitemapIndexXml = (entries: ReadonlyArray<SitemapIndexEntry>): string => {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];

  for (const entry of entries) {
    lines.push('  <sitemap>');
    lines.push(`    <loc>${escapeXml(entry.loc)}</loc>`);
    if (entry.lastmod !== undefined) {
      lines.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
    }
    lines.push('  </sitemap>');
  }

  lines.push('</sitemapindex>');
  return lines.join('\n');
};
