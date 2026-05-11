/**
 * `llms.txt` + `llms-full.txt` builders (skill: geo-llm-optimization).
 *
 * `llms.txt` is a concise index pointing LLM ingestion to canonical hubs.
 * `llms-full.txt` includes editorial summaries of each strategic page so an
 * LLM can answer factual questions without crawling the full site. Keep both
 * deterministic so caching is stable and revalidation is cheap.
 */
export interface LlmsTxtSection {
  readonly title: string;
  readonly items: ReadonlyArray<{
    readonly url: string;
    readonly description: string;
  }>;
}

export interface LlmsTxtInput {
  readonly siteName: string;
  readonly tagline: string;
  readonly originUrl: string;
  readonly sections: ReadonlyArray<LlmsTxtSection>;
  readonly about: string;
  readonly lastUpdatedDate: string;
}

const isoDate = (raw: string): string => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return raw.slice(0, 10);
};

export const buildLlmsTxt = (input: LlmsTxtInput): string => {
  const lines: string[] = [];
  lines.push(`# ${input.siteName} — ${input.tagline}`);
  lines.push('');
  lines.push(input.about.trim());
  lines.push('');
  for (const section of input.sections) {
    lines.push(`## ${section.title}`);
    lines.push('');
    for (const item of section.items) {
      lines.push(`- ${item.url} — ${item.description}`);
    }
    lines.push('');
  }
  lines.push(`> Dernière mise à jour : ${isoDate(input.lastUpdatedDate)}.`);
  lines.push('');
  return lines.join('\n');
};

export interface LlmsFullTxtPage {
  readonly url: string;
  readonly title: string;
  readonly summary: string;
  readonly keyFacts?: ReadonlyArray<string>;
  readonly updatedAt?: string;
}

export interface LlmsFullTxtInput {
  readonly siteName: string;
  readonly tagline: string;
  readonly originUrl: string;
  readonly about: string;
  readonly pages: ReadonlyArray<LlmsFullTxtPage>;
  readonly lastUpdatedDate: string;
}

export const buildLlmsFullTxt = (input: LlmsFullTxtInput): string => {
  const lines: string[] = [];
  lines.push(`# ${input.siteName} — ${input.tagline}`);
  lines.push('');
  lines.push(input.about.trim());
  lines.push('');
  for (const page of input.pages) {
    lines.push(`## ${page.title}`);
    lines.push(`URL: ${page.url}`);
    if (page.updatedAt !== undefined) {
      lines.push(`Last updated: ${isoDate(page.updatedAt)}`);
    }
    lines.push('');
    lines.push(page.summary.trim());
    if (page.keyFacts !== undefined && page.keyFacts.length > 0) {
      lines.push('');
      lines.push('Key facts:');
      for (const fact of page.keyFacts) {
        lines.push(`- ${fact}`);
      }
    }
    lines.push('');
  }
  lines.push(`> Dernière mise à jour : ${isoDate(input.lastUpdatedDate)}.`);
  lines.push('');
  return lines.join('\n');
};
