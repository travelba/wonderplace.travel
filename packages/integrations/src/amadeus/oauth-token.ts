import { err, ok, type Result } from '@cct/domain/shared';
import { z } from 'zod';

import { retryingJsonRequest, type RequestBody } from '../http/index.js';
import {
  redisGetString,
  redisSetStringWithTtl,
  runWithRedisLock,
  type IntegrationRedis,
} from '../redis/cache-helpers.js';

import { amadeusAuthLockKey, amadeusAuthTokenKey } from './cache-keys.js';
import type { AmadeusError } from './errors.js';
import { AmadeusOAuthTokenSchema } from './types.js';

const TOKEN_SKEW_MS = 60_000;

const CachedTokenEnvelopeSchema = z.object({
  accessToken: z.string(),
  expiresAtMs: z.number(),
});

export type AmadeusOAuthConfig = {
  readonly baseUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redis: IntegrationRedis;
};

async function readCachedToken(redis: IntegrationRedis): Promise<string | null> {
  const raw = await redisGetString(redis, amadeusAuthTokenKey());
  if (raw === null) return null;
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = CachedTokenEnvelopeSchema.safeParse(parsedJson);
  if (!parsed.success) return null;
  if (parsed.data.expiresAtMs <= Date.now() + TOKEN_SKEW_MS) return null;
  return parsed.data.accessToken;
}

async function postClientCredentials(
  cfg: AmadeusOAuthConfig,
): Promise<Result<{ readonly accessToken: string; readonly expiresInSec: number }, AmadeusError>> {
  const url = new URL('/v1/security/oauth2/token', cfg.baseUrl);
  const body: RequestBody = {
    kind: 'form',
    pairs: {
      grant_type: 'client_credentials',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    },
  };

  const res = await retryingJsonRequest({
    url: url.toString(),
    method: 'POST',
    body,
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) return err({ kind: 'http', error: res.error });
  if (res.value.status < 200 || res.value.status >= 300) {
    return err({ kind: 'oauth_rejected', details: `status ${res.value.status}` });
  }
  if (res.value.json === undefined) {
    return err({ kind: 'parse_failure', details: 'empty oauth response' });
  }
  const token = AmadeusOAuthTokenSchema.safeParse(res.value.json);
  if (!token.success) {
    return err({ kind: 'parse_failure', details: 'oauth response shape' });
  }
  return ok({
    accessToken: token.data.access_token,
    expiresInSec: token.data.expires_in,
  });
}

async function storeToken(
  redis: IntegrationRedis,
  token: string,
  expiresInSec: number,
): Promise<void> {
  const envelope = {
    accessToken: token,
    expiresAtMs: Date.now() + expiresInSec * 1000,
  };
  const ttlSec = Math.max(60, Math.floor(expiresInSec) - 60);
  await redisSetStringWithTtl(redis, amadeusAuthTokenKey(), JSON.stringify(envelope), ttlSec);
}

/**
 * Returns a valid Amadeus access token, using Redis as a shared cache (Upstash-compatible).
 */
export async function getAmadeusAccessToken(
  cfg: AmadeusOAuthConfig,
): Promise<Result<string, AmadeusError>> {
  const hit = await readCachedToken(cfg.redis);
  if (hit !== null) return ok(hit);

  let oauthFail: AmadeusError | undefined;

  try {
    await runWithRedisLock(
      cfg.redis,
      amadeusAuthLockKey(),
      15,
      async () => {
        const hit2 = await readCachedToken(cfg.redis);
        if (hit2 !== null) return;
        const fresh = await postClientCredentials(cfg);
        if (!fresh.ok) {
          oauthFail = fresh.error;
          return;
        }
        await storeToken(cfg.redis, fresh.value.accessToken, fresh.value.expiresInSec);
      },
      { maxWaitMs: 8_000, spinMs: 100 },
    );
  } catch {
    return err({ kind: 'oauth_rejected', details: 'lock wait timeout' });
  }

  if (oauthFail !== undefined) return err(oauthFail);

  const final = await readCachedToken(cfg.redis);
  if (final !== null) return ok(final);
  return err({ kind: 'oauth_rejected', details: 'token missing after refresh' });
}
