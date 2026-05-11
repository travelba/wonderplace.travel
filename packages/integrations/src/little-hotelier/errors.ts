import type { HttpError } from '@cct/integrations/http';

export type LittleHotelierError =
  | { readonly kind: 'http'; readonly error: HttpError }
  | { readonly kind: 'parse_failure'; readonly details: string };
