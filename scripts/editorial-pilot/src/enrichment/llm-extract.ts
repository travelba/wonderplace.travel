/**
 * llm-extract.ts — generic structured extraction helper for Tavily-extracted content.
 *
 * Pattern : take some web markdown content + a Zod schema of the expected shape,
 * and return either parsed structured data or null (never throw on extraction
 * failures — let the caller decide whether to fall back to AUTO_DRAFT).
 *
 * Uses OpenAI gpt-4o-mini by default (≈10× cheaper than gpt-4o, sufficient for
 * structured extraction from clean Tavily markdown).
 *
 * Anti-hallucination contract (prompted into the system message):
 *   - If a field is not explicitly stated in the content → return null
 *   - Never guess, never infer beyond what the content literally says
 *   - Quote the verbatim source phrase in an `evidence_quote` field when present
 */

import OpenAI from 'openai';
import type { z } from 'zod';
import { loadEnv } from '../env.js';

const env = loadEnv();
const OPENAI_KEY = env.OPENAI_API_KEY;

const EXTRACTION_MODEL = 'gpt-4o-mini-2024-07-18';

function requireOpenai(): OpenAI {
  if (!OPENAI_KEY) {
    throw new Error(
      '[llm-extract] OPENAI_API_KEY missing — required for Tavily-driven structured extraction.',
    );
  }
  return new OpenAI({ apiKey: OPENAI_KEY });
}

const ANTI_HALLUCINATION_RULES = `STRICT EXTRACTION RULES — NO HALLUCINATION:
1. Extract ONLY information explicitly stated in the provided SOURCE_CONTENT below.
2. If a field is not literally present → return null for that field (never guess, never combine sources).
3. Numbers must be quoted verbatim from the source (e.g. "208 rooms" → 208, but "200+ rooms" → null since it's approximate).
4. Names must be spelled exactly as in the source.
5. When a piece of information is ambiguous or contradicted across the source, return null.
6. Output a single JSON object matching the requested schema. No prose, no markdown fences.
7. For each non-null field you populate, include where you found it via an "evidence_quote" sibling field when the schema asks for one.`;

export interface LlmExtractOptions<Schema extends z.ZodTypeAny> {
  /** Tavily-extracted markdown (or any clean text) used as the only source of truth. */
  readonly content: string;
  /** Short context for the LLM (e.g. "Plaza Athénée — extract dining outlets"). */
  readonly context: string;
  /** JSON-schema-like description of the expected output, written for the LLM. */
  readonly schemaDescription: string;
  /** Zod schema validating the final parsed object. */
  readonly schema: Schema;
  /** Override the default extraction model. */
  readonly model?: string;
}

export interface LlmExtractResult<T> {
  readonly data: T;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
  readonly model: string;
}

/**
 * Run a structured extraction. Returns `null` if the LLM cannot extract anything
 * useful or if the parsed object fails Zod validation (e.g. all fields null).
 */
export async function llmExtract<Schema extends z.ZodTypeAny>(
  opts: LlmExtractOptions<Schema>,
): Promise<LlmExtractResult<z.infer<Schema>> | null> {
  if (opts.content.trim().length < 50) {
    return null;
  }
  const client = requireOpenai();
  const model = opts.model ?? EXTRACTION_MODEL;

  const systemPrompt = [
    'You are a precise information extractor for an editorial pipeline.',
    'Your output MUST be a single JSON object with the EXACT shape below.',
    'Field semantics:',
    opts.schemaDescription,
    '',
    ANTI_HALLUCINATION_RULES,
  ].join('\n');

  const userPrompt = [
    `CONTEXT: ${opts.context}`,
    '',
    'SOURCE_CONTENT (Tavily markdown):',
    '"""',
    opts.content,
    '"""',
    '',
    'Return ONLY the JSON object now.',
  ].join('\n');

  const response = await client.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const choice = response.choices[0];
  if (!choice || !choice.message.content) {
    return null;
  }

  let json: unknown;
  try {
    json = JSON.parse(choice.message.content);
  } catch {
    console.warn(`[llm-extract] JSON parse failed for context="${opts.context}"`);
    return null;
  }

  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) {
    console.warn(
      `[llm-extract] schema validation failed for context="${opts.context}":`,
      parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    );
    return null;
  }

  return {
    data: parsed.data as z.infer<Schema>,
    usage: {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    },
    model,
  };
}
