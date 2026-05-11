import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { IntegrationRedis } from '../redis/cache-helpers.js';
import { getAmadeusAccessToken } from './oauth-token.js';

function createMemoryRedis(): IntegrationRedis {
  const store = new Map<string, string>();
  return {
    get: async (key) => store.get(key) ?? null,
    set: async (key, value, opts) => {
      if (opts?.nx === true && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    },
    del: async (...keys) => {
      let removed = 0;
      for (const k of keys) {
        if (store.delete(k)) removed += 1;
      }
      return removed;
    },
  };
}

let oauthPostCount = 0;

const server = setupServer(
  http.post('https://test.api.amadeus.com/v1/security/oauth2/token', async () => {
    oauthPostCount += 1;
    return HttpResponse.json({
      access_token: 'unit-test-token',
      expires_in: 3600,
      token_type: 'Bearer',
    });
  }),
);

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

beforeEach(() => {
  oauthPostCount = 0;
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe('getAmadeusAccessToken', () => {
  it('fetches OAuth token once and reuses Redis cache', async () => {
    const redis = createMemoryRedis();

    const cfg = {
      baseUrl: 'https://test.api.amadeus.com',
      clientId: 'dummy',
      clientSecret: 'dummy',
      redis,
    };

    const first = await getAmadeusAccessToken(cfg);
    const second = await getAmadeusAccessToken(cfg);

    expect(first.ok && first.value).toBe('unit-test-token');
    expect(second.ok && second.value).toBe('unit-test-token');
    expect(oauthPostCount).toBe(1);
  });
});
