import type { HttpError } from '@cct/integrations/http';

export type ApifyError =
  | { readonly kind: 'http'; readonly error: HttpError }
  | { readonly kind: 'not_configured' };
