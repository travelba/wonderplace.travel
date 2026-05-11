/**
 * AEO (Answer Engine Optimization) block builder — skill: geo-llm-optimization.
 *
 * AEO blocks are short, self-contained answer chunks (~40–60 words) that LLM
 * assistants quote verbatim. They appear in dedicated `<section data-aeo>`
 * blocks on guides, selections, and editorial pages.
 */
export const AEO_MIN_WORDS = 40;
export const AEO_MAX_WORDS = 80;

export type AeoValidationError =
  | { readonly kind: 'too_short'; readonly words: number; readonly min: number }
  | { readonly kind: 'too_long'; readonly words: number; readonly max: number }
  | { readonly kind: 'empty_question' }
  | { readonly kind: 'empty_answer' };

export interface AeoBlockInput {
  readonly question: string;
  readonly answer: string;
  readonly sourceUrl?: string;
  readonly updatedAt?: string;
}

export interface AeoBlock {
  readonly question: string;
  readonly answer: string;
  readonly wordCount: number;
  readonly sourceUrl: string | undefined;
  readonly updatedAt: string | undefined;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/u).length;
}

export type AeoBlockResult =
  | { readonly ok: true; readonly value: AeoBlock }
  | { readonly ok: false; readonly error: AeoValidationError };

/**
 * Validate an AEO block against the 40–80 word range and basic sanity checks.
 * Returns a Result so callers (Payload hooks, route handlers) can surface
 * actionable errors to editors rather than silently shipping bad blocks.
 */
export const buildAeoBlock = (input: AeoBlockInput): AeoBlockResult => {
  const question = input.question.trim();
  const answer = input.answer.trim();

  if (question.length === 0) {
    return { ok: false, error: { kind: 'empty_question' } };
  }
  if (answer.length === 0) {
    return { ok: false, error: { kind: 'empty_answer' } };
  }

  const wordCount = countWords(answer);
  if (wordCount < AEO_MIN_WORDS) {
    return { ok: false, error: { kind: 'too_short', words: wordCount, min: AEO_MIN_WORDS } };
  }
  if (wordCount > AEO_MAX_WORDS) {
    return { ok: false, error: { kind: 'too_long', words: wordCount, max: AEO_MAX_WORDS } };
  }

  return {
    ok: true,
    value: {
      question,
      answer,
      wordCount,
      sourceUrl: input.sourceUrl,
      updatedAt: input.updatedAt,
    },
  };
};
