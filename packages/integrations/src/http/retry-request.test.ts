import { afterEach, describe, expect, it, vi } from 'vitest';

import { retryingJsonRequest } from './retry-request.js';

describe('retryingJsonRequest', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('parses JSON on 200 responses', async () => {
    const fetchMock = vi.fn(async (): Promise<Response> => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await retryingJsonRequest({
      url: 'https://example.test/resource',
      method: 'GET',
      body: { kind: 'none' },
      maxAttempts: 2,
      timeoutMs: 2_000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.ok && res.value.json).toEqual({ ok: true });
  });

  it('retries then succeeds on transient 503', async () => {
    let n = 0;
    const fetchMock = vi.fn(async (): Promise<Response> => {
      n += 1;
      if (n < 3) return new Response('bad', { status: 503 });
      return new Response(JSON.stringify({ done: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await retryingJsonRequest({
      url: 'https://example.test/retry-me',
      method: 'GET',
      body: { kind: 'none' },
      maxAttempts: 4,
      timeoutMs: 10_000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(res.ok && res.value.json).toEqual({ done: true });
  });
});
