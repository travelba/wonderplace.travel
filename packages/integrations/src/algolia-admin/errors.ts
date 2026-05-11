export type AlgoliaIndexingError =
  | { readonly kind: 'algolia_upstream'; readonly message: string; readonly status?: number }
  | { readonly kind: 'invalid_hotel_payload'; readonly details: string };
