import type { HttpError } from '@cct/integrations/http';

export type MakcorpsError =
  | { readonly kind: 'http'; readonly error: HttpError }
  | { readonly kind: 'parse_failure'; readonly details: string };
