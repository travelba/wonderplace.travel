/**
 * Tavily REST API client — search + extract.
 *
 * Endpoints used:
 *   - POST https://api.tavily.com/search   (Tavily Search)
 *   - POST https://api.tavily.com/extract  (Tavily Extract)
 *
 * Auth: Bearer token in Authorization header. Key validated by env schema.
 * Quotas (free tier): 1000 search-credits / month. `search_depth=advanced`
 * costs 2 credits; `extract_depth=advanced` costs 2 credits per URL.
 *
 * Why a hand-rolled REST client and not @tavily/core ?
 *   - Zero new dep, no transitive bundle for a Node-only CLI.
 *   - Full Zod validation of payloads, consistent with the rest of the pipeline.
 *   - Explicit retry + timeout policy.
 *
 * Doc: https://docs.tavily.com/documentation/api-reference
 */

import { z } from 'zod';
import { loadEnv } from '../env.js';

// ─── Public types ──────────────────────────────────────────────────────────

export interface TavilySearchOptions {
  /** Up to 400 chars per Tavily docs. */
  readonly query: string;
  /** `basic` (default) = 1 credit. `advanced` = 2 credits, much better recall. */
  readonly searchDepth?: 'basic' | 'advanced';
  /** Top N results to return (0-20). Default 5. */
  readonly maxResults?: number;
  /** Restrict to these domains (wildcards supported, e.g. `*.michelin.com`). Max 300. */
  readonly includeDomains?: readonly string[];
  /** Exclude these domains. Max 150. */
  readonly excludeDomains?: readonly string[];
  /** Boost results from this country (full English name, e.g. `france`). */
  readonly country?: string;
  /** When true, include the page's full markdown content in each result. */
  readonly includeRawContent?: boolean;
}

export interface TavilySearchResult {
  readonly title: string;
  readonly url: string;
  readonly content: string;
  readonly score: number;
  readonly rawContent: string | null;
}

export interface TavilySearchResponse {
  readonly query: string;
  readonly results: readonly TavilySearchResult[];
  readonly responseTime: number;
}

export interface TavilyExtractOptions {
  /** 1-20 URLs per call. */
  readonly urls: readonly string[];
  /** `basic` (1 credit per URL) or `advanced` (2 credits, dynamic/JS pages). */
  readonly extractDepth?: 'basic' | 'advanced';
  /** Reranks chunks by relevance to this query. Required to use chunks_per_source. */
  readonly query?: string;
  /** Chunks per source (1-5, max 500 chars each). Only with `query`. */
  readonly chunksPerSource?: number;
  /** Output format. Default markdown. */
  readonly format?: 'markdown' | 'text';
  /** Timeout in seconds (1-60). Default 20. */
  readonly timeoutSec?: number;
}

export interface TavilyExtractResult {
  readonly url: string;
  readonly rawContent: string;
}

export interface TavilyExtractFailure {
  readonly url: string;
  readonly error: string;
}

export interface TavilyExtractResponse {
  readonly results: readonly TavilyExtractResult[];
  readonly failedResults: readonly TavilyExtractFailure[];
  readonly responseTime: number;
}

// ─── Zod (lenient: Tavily occasionally returns extra fields) ───────────────

const SearchResultSchema = z
  .object({
    title: z.string().default(''),
    url: z.string().url(),
    content: z.string().default(''),
    score: z.number().default(0),
    raw_content: z.union([z.string(), z.null()]).optional(),
  })
  .passthrough();

const SearchResponseSchema = z
  .object({
    query: z.string(),
    results: z.array(SearchResultSchema),
    response_time: z.number().default(0),
  })
  .passthrough();

const ExtractResultSchema = z
  .object({
    url: z.string(),
    raw_content: z.string().default(''),
  })
  .passthrough();

const ExtractFailureSchema = z
  .object({
    url: z.string(),
    error: z.string().default('unknown error'),
  })
  .passthrough();

const ExtractResponseSchema = z
  .object({
    results: z.array(ExtractResultSchema).default([]),
    failed_results: z.array(ExtractFailureSchema).default([]),
    response_time: z.number().default(0),
  })
  .passthrough();

// ─── Low-level transport ───────────────────────────────────────────────────

const env = loadEnv();
const API_KEY = env.TAVILY_API_KEY;
const BASE_URL = 'https://api.tavily.com';

function requireKey(): string {
  if (!API_KEY) {
    throw new Error(
      '[tavily] TAVILY_API_KEY is missing. Get a free key at https://app.tavily.com/sign-in',
    );
  }
  return API_KEY;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function tavilyRequest<T>(endpoint: '/search' | '/extract', body: unknown): Promise<T> {
  const key = requireKey();
  const url = `${BASE_URL}${endpoint}`;
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        return (await res.json()) as T;
      }
      // 429 / 5xx → retry. 4xx → fail fast (likely bad key or quota).
      const errBody = await res.text();
      if (res.status >= 500 || res.status === 429) {
        lastError = new Error(`Tavily ${res.status} on ${endpoint}: ${errBody.slice(0, 200)}`);
        await sleep(800 * attempt);
        continue;
      }
      throw new Error(`Tavily ${res.status} on ${endpoint}: ${errBody.slice(0, 500)}`);
    } catch (e) {
      lastError = e as Error;
      if (attempt < 3) await sleep(800 * attempt);
    }
  }
  throw lastError ?? new Error('[tavily] unknown error');
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Run a Tavily search. Returns an array of results ordered by relevance score (desc).
 *
 * Use `searchDepth: 'advanced'` for important queries (e.g. dining / Michelin) —
 * recall is markedly better and the credit cost (2 vs 1) is negligible for ~28 hotels.
 */
export async function tavilySearch(opts: TavilySearchOptions): Promise<TavilySearchResponse> {
  if (opts.query.length === 0 || opts.query.length > 400) {
    throw new Error(`[tavily] query must be 1-400 chars (got ${opts.query.length})`);
  }
  const body: Record<string, unknown> = {
    query: opts.query,
    search_depth: opts.searchDepth ?? 'basic',
    max_results: opts.maxResults ?? 5,
    include_raw_content: opts.includeRawContent ?? false,
  };
  if (opts.includeDomains && opts.includeDomains.length > 0) {
    body['include_domains'] = opts.includeDomains;
  }
  if (opts.excludeDomains && opts.excludeDomains.length > 0) {
    body['exclude_domains'] = opts.excludeDomains;
  }
  if (opts.country) {
    body['country'] = opts.country;
  }

  const raw = await tavilyRequest<unknown>('/search', body);
  const parsed = SearchResponseSchema.parse(raw);

  return {
    query: parsed.query,
    responseTime: parsed.response_time,
    results: parsed.results
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
        rawContent: r.raw_content ?? null,
      })),
  };
}

/**
 * Extract content from up to 20 URLs. When `query` is provided, the response is
 * reranked into top-N chunks (≤500 chars each) joined by `[...]`, which keeps
 * the prompt small for downstream LLM calls.
 */
export async function tavilyExtract(opts: TavilyExtractOptions): Promise<TavilyExtractResponse> {
  if (opts.urls.length === 0) {
    throw new Error('[tavily] extract: urls must be non-empty');
  }
  if (opts.urls.length > 20) {
    throw new Error(`[tavily] extract: max 20 URLs per call (got ${opts.urls.length})`);
  }
  const body: Record<string, unknown> = {
    urls: opts.urls,
    extract_depth: opts.extractDepth ?? 'basic',
    format: opts.format ?? 'markdown',
  };
  if (opts.query) {
    body['query'] = opts.query;
    if (opts.chunksPerSource) body['chunks_per_source'] = opts.chunksPerSource;
  }
  if (opts.timeoutSec) {
    body['timeout'] = opts.timeoutSec;
  }

  const raw = await tavilyRequest<unknown>('/extract', body);
  const parsed = ExtractResponseSchema.parse(raw);

  return {
    responseTime: parsed.response_time,
    results: parsed.results.map((r) => ({ url: r.url, rawContent: r.raw_content })),
    failedResults: parsed.failed_results.map((f) => ({ url: f.url, error: f.error })),
  };
}

/**
 * Search + Extract one-shot helper.
 *
 * 1. Searches with the given query.
 * 2. Filters results by score >= `minScore` (default 0.5).
 * 3. Extracts the top N results (default 3) with reranked chunks.
 *
 * Returns the extracted content joined with their source URLs for downstream
 * LLM consumption (one structured object per source so quotes can be attributed).
 */
export async function tavilySearchAndExtract(opts: {
  readonly query: string;
  readonly extractQuery?: string;
  readonly includeDomains?: readonly string[];
  readonly excludeDomains?: readonly string[];
  readonly searchDepth?: 'basic' | 'advanced';
  readonly extractDepth?: 'basic' | 'advanced';
  readonly maxSearchResults?: number;
  readonly maxExtractUrls?: number;
  readonly chunksPerSource?: number;
  readonly minScore?: number;
}): Promise<{
  readonly query: string;
  readonly extracted: ReadonlyArray<{ url: string; title: string; content: string; score: number }>;
  readonly failed: readonly TavilyExtractFailure[];
}> {
  const search = await tavilySearch({
    query: opts.query,
    searchDepth: opts.searchDepth ?? 'advanced',
    maxResults: opts.maxSearchResults ?? 8,
    ...(opts.includeDomains ? { includeDomains: opts.includeDomains } : {}),
    ...(opts.excludeDomains ? { excludeDomains: opts.excludeDomains } : {}),
  });
  const minScore = opts.minScore ?? 0.5;
  const candidates = search.results.filter((r) => r.score >= minScore);
  if (candidates.length === 0) {
    return { query: opts.query, extracted: [], failed: [] };
  }
  const urls = candidates.slice(0, opts.maxExtractUrls ?? 3).map((r) => r.url);
  const titles = new Map(candidates.map((r) => [r.url, r.title]));
  const scores = new Map(candidates.map((r) => [r.url, r.score]));

  const extract = await tavilyExtract({
    urls,
    extractDepth: opts.extractDepth ?? 'advanced',
    query: opts.extractQuery ?? opts.query,
    chunksPerSource: opts.chunksPerSource ?? 3,
    format: 'markdown',
  });

  return {
    query: opts.query,
    extracted: extract.results.map((r) => ({
      url: r.url,
      title: titles.get(r.url) ?? '',
      content: r.rawContent,
      score: scores.get(r.url) ?? 0,
    })),
    failed: extract.failedResults,
  };
}
