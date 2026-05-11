import { describe, expect, it } from 'vitest';

import { AEO_MAX_WORDS, AEO_MIN_WORDS, buildAeoBlock } from './aeo';

const wordsOfLength = (n: number): string =>
  Array.from({ length: n }, (_, i) => `mot${i}`).join(' ');

describe('buildAeoBlock', () => {
  it('rejects empty question', () => {
    const r = buildAeoBlock({ question: '  ', answer: wordsOfLength(50) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('empty_question');
  });

  it('rejects empty answer', () => {
    const r = buildAeoBlock({ question: 'Q?', answer: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('empty_answer');
  });

  it('rejects too-short answers', () => {
    const r = buildAeoBlock({ question: 'Q?', answer: wordsOfLength(AEO_MIN_WORDS - 1) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('too_short');
  });

  it('rejects too-long answers', () => {
    const r = buildAeoBlock({ question: 'Q?', answer: wordsOfLength(AEO_MAX_WORDS + 1) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('too_long');
  });

  it('accepts answers within range and returns word count', () => {
    const r = buildAeoBlock({
      question: 'Question ?',
      answer: wordsOfLength(50),
      sourceUrl: 'https://example.com',
      updatedAt: '2026-05-11',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.wordCount).toBe(50);
      expect(r.value.question).toBe('Question ?');
      expect(r.value.sourceUrl).toBe('https://example.com');
    }
  });
});
