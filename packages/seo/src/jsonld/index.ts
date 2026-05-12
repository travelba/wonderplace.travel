/**
 * JSON-LD builders — see structured-data-schema-org skill.
 * Each builder returns a typed Schema.org object; rendering is done by
 * the `<JsonLd>` component in `apps/web` (a thin wrapper around
 * `<script type="application/ld+json">`).
 */
export * from './aggregate-rating';
export * from './article';
export * from './breadcrumb';
export * from './faq';
export * from './hotel';
export * from './hotel-room';
export * from './item-list';
export * from './offer';
export * from './travel-agency';

/**
 * Wrap any JSON-LD object with the Schema.org context. Use this right before
 * serialization in `<script type="application/ld+json">{...}</script>`.
 *
 * Top-level JSON-LD nodes must be objects, so callers should pass a `*Node`
 * type from the builders (e.g. `TravelAgencyNode`), not the raw schema-dts
 * union (which includes a bare IRI string).
 */
export const withSchemaOrgContext = <T extends object>(
  node: T,
): T & { readonly '@context': 'https://schema.org' } => ({
  '@context': 'https://schema.org' as const,
  ...node,
});
