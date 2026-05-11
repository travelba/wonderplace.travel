import { describe, expect, it } from 'vitest';
import { buildCspHeader, generateNonce } from './csp';

describe('buildCspHeader', () => {
  it('emits a single-line header with semicolon-separated directives', () => {
    const header = buildCspHeader({ nonce: 'abc123', isDev: false });

    expect(header.split('\n').length).toBe(1);
    expect(header).toMatch(/^default-src 'self';/);
    expect(header).toContain('upgrade-insecure-requests');
  });

  it('injects the nonce into script-src with strict-dynamic', () => {
    const header = buildCspHeader({ nonce: 'XYZ', isDev: false });

    expect(header).toContain("script-src 'self' 'nonce-XYZ' 'strict-dynamic'");
  });

  it('relaxes script-src in dev mode (HMR eval) but omits upgrade-insecure-requests', () => {
    const header = buildCspHeader({ nonce: 'dev', isDev: true });

    expect(header).toContain("'unsafe-eval'");
    expect(header).toContain("'wasm-unsafe-eval'");
    expect(header).not.toContain('upgrade-insecure-requests');
  });

  it('denies framing via frame-ancestors none', () => {
    const header = buildCspHeader({ nonce: 'n', isDev: false });
    expect(header).toContain("frame-ancestors 'none'");
  });

  it('whitelists the Amadeus payment iframe host', () => {
    const header = buildCspHeader({ nonce: 'n', isDev: false });
    expect(header).toContain('https://*.amadeus.com');
  });

  it('whitelists Supabase + Upstash + Algolia for connect-src', () => {
    const header = buildCspHeader({ nonce: 'n', isDev: false });
    expect(header).toContain('https://*.supabase.co');
    expect(header).toContain('https://*.upstash.io');
    expect(header).toContain('https://*.algolia.net');
  });

  it('allows Cloudinary for img-src and media-src', () => {
    const header = buildCspHeader({ nonce: 'n', isDev: false });
    expect(header).toMatch(/img-src[^;]*https:\/\/res\.cloudinary\.com/);
    expect(header).toMatch(/media-src[^;]*https:\/\/res\.cloudinary\.com/);
  });
});

describe('generateNonce', () => {
  it('returns base64-like strings of 22 characters (16 bytes, unpadded)', () => {
    const a = generateNonce();
    const b = generateNonce();

    expect(a).toMatch(/^[A-Za-z0-9+/]+$/);
    expect(a).toHaveLength(22);
    expect(a).not.toBe(b);
  });
});
