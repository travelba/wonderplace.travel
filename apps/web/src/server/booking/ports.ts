import 'server-only';

import { realClock, type Clock, type RandomSource } from '@cct/domain/shared';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Web-Crypto-backed `RandomSource` for booking-ref generation. Returns
 * uppercase alphanumeric strings of arbitrary length. Cryptographically
 * uniform (uses rejection sampling to avoid modulo bias).
 */
export const webCryptoRandomSource: RandomSource = {
  randomAlphanumeric(length) {
    if (length <= 0) return '';
    // 256 % 36 = 4 → reject high bytes to keep a uniform mapping.
    const cutoff = 256 - (256 % ALPHABET.length);
    const out: string[] = [];
    while (out.length < length) {
      const need = length - out.length;
      const buf = new Uint8Array(need * 2);
      crypto.getRandomValues(buf);
      for (let i = 0; i < buf.length && out.length < length; i += 1) {
        const v = buf[i];
        if (v === undefined || v >= cutoff) continue;
        out.push(ALPHABET[v % ALPHABET.length] as string);
      }
    }
    return out.join('');
  },
};

/** Real wall-clock — every booking server action gets the same instance. */
export const serverClock: Clock = realClock();
