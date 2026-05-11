import type { FAQPage } from 'schema-dts';

export type FaqPageNode = Exclude<FAQPage, string>;

export interface FaqEntryInput {
  readonly question: string;
  readonly answer: string;
}

/**
 * FAQPage JSON-LD (skill: structured-data-schema-org).
 *
 * Important: each `acceptedAnswer.text` must match a visible answer on the page
 * verbatim (Google rich-results policy). Builders never transform the text.
 */
export const faqPageJsonLd = (entries: ReadonlyArray<FaqEntryInput>): FaqPageNode => ({
  '@type': 'FAQPage',
  mainEntity: entries.map((e) => ({
    '@type': 'Question',
    name: e.question,
    acceptedAnswer: { '@type': 'Answer', text: e.answer },
  })),
});
