import { headers } from 'next/headers';
import type { ReactElement } from 'react';

/**
 * Server Component that emits a `<script type="application/ld+json">` tag
 * with the per-request CSP nonce injected by `middleware.ts`.
 *
 * - JSON-LD payloads are built from typed inputs (Zod-validated upstream)
 *   so `dangerouslySetInnerHTML` is safe by construction.
 * - When the nonce header is missing (e.g. CI smoke build with the
 *   middleware disabled or fetches from a route excluded from the matcher),
 *   the `nonce` attribute is simply omitted and the script still validates
 *   against any 'self'-allowed CSP.
 *
 * Skill: structured-data-schema-org + security-engineering (CSP).
 */
interface JsonLdScriptProps {
  readonly data: unknown;
}

export async function JsonLdScript({ data }: JsonLdScriptProps): Promise<ReactElement> {
  const requestHeaders = await headers();
  const nonce = requestHeaders.get('x-nonce') ?? undefined;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
