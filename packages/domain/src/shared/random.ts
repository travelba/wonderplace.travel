/**
 * Random source port — injected so domain services stay pure (no `Math.random`,
 * no Node `crypto`). Real implementation lives in `apps/web` /
 * `packages/integrations` and wraps Web Crypto.
 */
export interface RandomSource {
  /** Returns `length` uppercase alphanumeric characters (A-Z 0-9). */
  randomAlphanumeric(length: number): string;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Deterministic random source for tests. `seed` is consumed character-by-
 * character (wrapping) so consecutive calls remain reproducible.
 */
export const fixedRandomSource = (seed: string): RandomSource => {
  let cursor = 0;
  return {
    randomAlphanumeric(length) {
      let out = '';
      for (let i = 0; i < length; i += 1) {
        const ch = seed.charCodeAt(cursor % seed.length);
        const idx = ch % ALPHABET.length;
        out += ALPHABET[idx];
        cursor += 1;
      }
      return out;
    },
  };
};
