import { describe, expect, it } from 'vitest';

import { faqPageJsonLd } from './faq';

describe('faqPageJsonLd', () => {
  it('maps entries to Question / Answer nodes verbatim', () => {
    const node = faqPageJsonLd([
      { question: 'Q1', answer: 'A1' },
      { question: 'Q2', answer: 'A2' },
    ]);
    expect(node['@type']).toBe('FAQPage');
    expect(node.mainEntity).toHaveLength(2);
    const first = node.mainEntity?.[0];
    expect(first).toMatchObject({
      '@type': 'Question',
      name: 'Q1',
      acceptedAnswer: { '@type': 'Answer', text: 'A1' },
    });
  });
});
