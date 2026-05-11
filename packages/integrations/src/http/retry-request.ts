import { err, ok, type Result } from '@cct/domain/shared';

import type { HttpError } from './http-error.js';

export type RequestBody =
  | { readonly kind: 'none' }
  | { readonly kind: 'json'; readonly value: unknown }
  | { readonly kind: 'form'; readonly pairs: Record<string, string> };

export interface RetryingRequestInit {
  readonly url: string;
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
  readonly headers?: Record<string, string>;
  readonly body: RequestBody;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly idempotencyKey?: string;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const jitteredBackoffMs = (attemptIndex: number, baseMs: number): number => {
  const exp = baseMs * 2 ** attemptIndex;
  return exp + Math.floor(Math.random() * 100);
};

const parseRetryAfterSec = (header: string | null): number | undefined => {
  if (!header) return undefined;
  const asInt = Number.parseInt(header, 10);
  if (!Number.isNaN(asInt)) return asInt;
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    const delta = Math.ceil((dateMs - Date.now()) / 1000);
    return delta > 0 ? delta : undefined;
  }
  return undefined;
};

const buildFetchBody = (body: RequestBody): { body: string | undefined; contentType?: string } => {
  switch (body.kind) {
    case 'none':
      return { body: undefined };
    case 'json':
      return {
        body: JSON.stringify(body.value),
        contentType: 'application/json',
      };
    case 'form': {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(body.pairs)) {
        params.set(k, v);
      }
      return {
        body: params.toString(),
        contentType: 'application/x-www-form-urlencoded',
      };
    }
  }
};

const shouldRetryStatus = (status: number): boolean =>
  status === 429 || status === 502 || status === 503 || status === 504;

const canRetryForMethod = (
  method: RetryingRequestInit['method'],
  idempotencyKey: string | undefined,
): boolean => {
  const m = method ?? 'GET';
  if (m === 'GET' || m === 'HEAD') return true;
  return idempotencyKey !== undefined && idempotencyKey.length > 0;
};

/**
 * Edge-safe `fetch` with timeout, exponential backoff + jitter, `Retry-After` respect.
 * Returns parsed JSON when response body is non-empty; `json` is `undefined` on empty 2xx.
 */
export async function retryingJsonRequest(init: RetryingRequestInit): Promise<
  Result<
    {
      readonly status: number;
      readonly headers: Headers;
      readonly json: unknown | undefined;
    },
    HttpError
  >
> {
  const method = init.method ?? 'GET';
  const timeoutMs = init.timeoutMs ?? 8_000;
  const maxAttempts = init.maxAttempts ?? 3;
  const { body: rawBody, contentType } = buildFetchBody(init.body);

  const headerRecord: Record<string, string> = { ...init.headers };
  if (contentType !== undefined) {
    headerRecord['Content-Type'] = contentType;
  }
  if (init.idempotencyKey !== undefined) {
    headerRecord['Idempotency-Key'] = init.idempotencyKey;
  }

  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    let response: Response;
    try {
      const requestInit: RequestInit = {
        method,
        headers: headerRecord,
        signal: controller.signal,
      };
      if (rawBody !== undefined) {
        requestInit.body = rawBody;
      }
      response = await fetch(init.url, requestInit);
    } catch (cause) {
      clearTimeout(timer);
      if (cause instanceof Error && cause.name === 'AbortError') {
        if (attempt >= maxAttempts) {
          return err({ kind: 'timeout' });
        }
        await sleep(jitteredBackoffMs(attempt - 1, 200));
        continue;
      }
      if (attempt >= maxAttempts) {
        return err({ kind: 'network', cause });
      }
      await sleep(jitteredBackoffMs(attempt - 1, 200));
      continue;
    } finally {
      clearTimeout(timer);
    }

    const retryAfterSec = parseRetryAfterSec(response.headers.get('Retry-After'));
    const text = await response.text();

    if (response.ok) {
      let json: unknown | undefined;
      if (text.length > 0) {
        try {
          const parsedOk: unknown = JSON.parse(text);
          json = parsedOk;
        } catch {
          return err({
            kind: 'parse_failure',
            details: 'response body is not valid JSON',
          });
        }
      }
      return ok({
        status: response.status,
        headers: response.headers,
        json,
      });
    }

    if (
      shouldRetryStatus(response.status) &&
      canRetryForMethod(method, init.idempotencyKey) &&
      attempt < maxAttempts
    ) {
      const waitMs =
        retryAfterSec !== undefined ? retryAfterSec * 1000 : jitteredBackoffMs(attempt - 1, 200);
      await sleep(waitMs);
      continue;
    }

    let errBody: unknown | undefined;
    if (text.length > 0) {
      try {
        const parsedErr: unknown = JSON.parse(text);
        errBody = parsedErr;
      } catch {
        errBody = undefined;
      }
    }

    if (response.status === 401) {
      return err({ kind: 'auth_failed' });
    }
    if (response.status === 404) {
      return err({ kind: 'not_found' });
    }
    if (response.status === 429) {
      if (retryAfterSec !== undefined) {
        return err({ kind: 'rate_limited', retryAfterSec });
      }
      return err({ kind: 'rate_limited' });
    }
    if (response.status >= 500) {
      return err({ kind: 'upstream_5xx', status: response.status });
    }
    return err({
      kind: 'upstream_4xx',
      status: response.status,
      body: errBody,
    });
  }

  return err({ kind: 'network', cause: new Error('max attempts exceeded') });
}
