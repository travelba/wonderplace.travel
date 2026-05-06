/**
 * Base discriminated-union error envelope used by domain services.
 * Each bounded context extends this with its own kinds.
 */
export type DomainError =
  | { kind: 'validation'; field: string; message: string }
  | { kind: 'not_found'; resource: string; id: string }
  | { kind: 'invariant_violated'; detail: string }
  | { kind: 'forbidden'; reason: string }
  | { kind: 'conflict'; detail: string };

export const validationError = (field: string, message: string): DomainError => ({
  kind: 'validation',
  field,
  message,
});

export const notFound = (resource: string, id: string): DomainError => ({
  kind: 'not_found',
  resource,
  id,
});

export const invariant = (detail: string): DomainError => ({
  kind: 'invariant_violated',
  detail,
});
