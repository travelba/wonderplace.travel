import 'server-only';

import type { BookingDraft } from '@cct/domain/booking';

import { redis } from '@/lib/redis';

const REDIS_KEY_PREFIX = 'booking:draft:';
const DEFAULT_TTL_SEC = 10 * 60;
const MIN_TTL_SEC = 30;
const MAX_TTL_SEC = 30 * 60;

const VALID_STATES = new Set([
  'idle',
  'searching',
  'results',
  'offer_locked',
  'guest_collected',
  'recap',
  'payment_pending',
  'confirmed',
  'failed',
]);
const VALID_MODES = new Set(['amadeus', 'little', 'email', 'display_only']);

/** Side-data persisted next to the domain draft for convenient rendering. */
export interface DraftHotelSnapshot {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly region: string;
}

export interface PersistedDraft {
  readonly draft: BookingDraft;
  readonly hotel: DraftHotelSnapshot;
  readonly locale: 'fr' | 'en';
  /** ISO timestamp at which the slot was first written; informational only. */
  readonly storedAt: string;
}

const redisKey = (id: string): string => `${REDIS_KEY_PREFIX}${id}`;

function clampTtl(ttlSec: number | undefined): number {
  if (ttlSec === undefined || !Number.isFinite(ttlSec)) return DEFAULT_TTL_SEC;
  const floored = Math.floor(ttlSec);
  if (floored < MIN_TTL_SEC) return MIN_TTL_SEC;
  if (floored > MAX_TTL_SEC) return MAX_TTL_SEC;
  return floored;
}

/** Lightweight defensive validation — Redis is trusted but never fully so. */
function isPersistedDraft(value: unknown): value is PersistedDraft {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v['storedAt'] !== 'string') return false;
  if (v['locale'] !== 'fr' && v['locale'] !== 'en') return false;
  const draft = v['draft'];
  if (typeof draft !== 'object' || draft === null) return false;
  const d = draft as Record<string, unknown>;
  if (typeof d['id'] !== 'string') return false;
  if (typeof d['state'] !== 'string' || !VALID_STATES.has(d['state'])) return false;
  if (typeof d['mode'] !== 'string' || !VALID_MODES.has(d['mode'])) return false;
  const hotel = v['hotel'];
  if (typeof hotel !== 'object' || hotel === null) return false;
  const h = hotel as Record<string, unknown>;
  return (
    typeof h['id'] === 'string' &&
    typeof h['name'] === 'string' &&
    typeof h['city'] === 'string' &&
    typeof h['region'] === 'string'
  );
}

export async function saveDraft(
  payload: Omit<PersistedDraft, 'storedAt'>,
  ttlSec?: number,
): Promise<void> {
  const stored: PersistedDraft = { ...payload, storedAt: new Date().toISOString() };
  await redis.set(redisKey(payload.draft.id), JSON.stringify(stored), {
    ex: clampTtl(ttlSec),
  });
}

export async function loadDraft(id: string): Promise<PersistedDraft | null> {
  const raw = await redis.get<string | PersistedDraft>(redisKey(id));
  if (raw === null || raw === undefined) return null;
  // Upstash returns parsed JSON automatically for objects, but plain strings
  // are returned verbatim. Handle both.
  const value: unknown = typeof raw === 'string' ? safeJson(raw) : raw;
  if (!isPersistedDraft(value)) return null;
  if (value.draft.id !== id) return null;
  return value;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function deleteDraft(id: string): Promise<void> {
  await redis.del(redisKey(id));
}
