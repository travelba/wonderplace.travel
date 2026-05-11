import { BookingRef, type BookingRef as BookingRefType } from '../shared/branded';
import type { Clock } from '../shared/clock';
import type { RandomSource } from '../shared/random';
import { err, type Result } from '../shared/result';
import type { DomainError } from '../shared/errors';

const REF_SUFFIX_LEN = 5;

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

/**
 * Generates a customer-facing booking reference of the shape
 * `CT-YYYYMMDD-XXXXX` (5 uppercase alphanumeric chars). The date portion is
 * UTC-based (no DST surprises in receipts / emails). Uniqueness is the
 * caller's responsibility — collisions retry one level up.
 */
export const generateBookingRef = (
  clock: Clock,
  random: RandomSource,
): Result<BookingRefType, DomainError> => {
  const now = clock.now();
  const datePart = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}`;
  const suffix = random.randomAlphanumeric(REF_SUFFIX_LEN);
  if (suffix.length !== REF_SUFFIX_LEN || !/^[A-Z0-9]{5}$/.test(suffix)) {
    return err({
      kind: 'invariant_violated',
      detail: `random source returned invalid suffix: ${JSON.stringify(suffix)}`,
    });
  }
  return BookingRef(`CT-${datePart}-${suffix}`);
};
