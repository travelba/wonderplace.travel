---
name: domain-driven-design
description: Apply DDD bounded contexts and pure domain modeling for ConciergeTravel.fr. Use when adding business logic (booking rules, loyalty tiers, pricing comparison, editorial slugs, hotel publication state) or creating new entities, value objects, or domain services.
---

# Domain-driven design — ConciergeTravel.fr

The codebase is organized by **bounded contexts** in `packages/domain/`. Domain code is **pure TypeScript** — zero framework dependencies, zero I/O. All side effects (Supabase, Amadeus, Brevo, Algolia, Redis) live in `packages/integrations/`.

## Triggers

Invoke this skill when:
- Writing new business rules (cancellation policy parsing, loyalty benefits calculation, price comparison scenarios, slug computation, hreflang resolution).
- Adding entities, value objects, aggregates, or domain services.
- A piece of logic might be tempted to live "inline" in a route handler or React component.

## Bounded contexts

| Context | Path | Responsibilities |
|---|---|---|
| `hotels` | `packages/domain/hotels` | Hotel entity, Room entity, BookingMode VO, publication state, slug rules |
| `booking` | `packages/domain/booking` | Booking aggregate, state machine (idle → offer_locked → guest_collected → payment_pending → confirmed/failed), CancellationPolicy parser |
| `loyalty` | `packages/domain/loyalty` | Tier rules, benefits calculation, eligibility (Little catalog vs all hotels) |
| `pricing` | `packages/domain/pricing` | Comparator normalization (Makcorps → unified shape), scenario decision (cheaper / equal_with_benefits / more_expensive) |
| `editorial` | `packages/domain/editorial` | Editorial page state, slug/hreflang/canonical, AEO block validation, FAQ schema |
| `shared` | `packages/domain/shared` | `Result<T,E>`, branded types, errors, IDs |

## Non-negotiable rules

- **Pure**: no `import 'next/...'`, no `import '@supabase/...'`, no `fetch`, no `Date.now()` inside domain (inject a clock).
- **Use `Result<T, DomainError>`** for fallible operations rather than throwing. Throwing is reserved for programmer errors (assertions).
- **Branded types** for IDs and slugs: `type HotelId = string & { __brand: 'HotelId' }`. Construction via factory functions that validate.
- **Value objects are immutable** with `readonly`. Equality by value, not reference.
- **Aggregates protect invariants**. A `Booking` cannot be `confirmed` without a captured payment ref. A `LoyaltyMember` cannot upgrade to `premium` without a paid subscription.
- **No magic strings**. Use literal unions and `as const`: `type BookingMode = 'amadeus' | 'little' | 'email' | 'display_only'`.

## Workflow

1. Identify which bounded context owns the rule. If unclear, ask before adding.
2. Define types first (entity/VO/error).
3. Write the pure function/service. Inject ports for any required side-effect (e.g. `clock: () => Date`).
4. Write Vitest unit tests next to the source (`*.test.ts`).
5. The integration layer (`packages/integrations/`) implements ports.
6. The app layer (`apps/web`, `apps/admin`) wires ports to concrete implementations.

## Anti-patterns to refuse

- Adding `@supabase/...` or `next/...` imports inside `packages/domain/`.
- Throwing instead of returning a typed `Result`.
- Sharing types across contexts via `packages/domain/shared` when they only serve one context.
- Cross-context calls bypassing public surfaces (e.g. `pricing` reaching into `booking` internals).
- Smart anemic models: business rules leaking into route handlers or React components.

## Example shape

```ts
// packages/domain/booking/state-machine.ts
export type BookingState =
  | { kind: 'idle' }
  | { kind: 'offer_locked'; offerId: AmadeusOfferId; lockedUntil: Date }
  | { kind: 'guest_collected'; offerId: AmadeusOfferId; guest: Guest }
  | { kind: 'payment_pending'; bookingRef: BookingRef }
  | { kind: 'confirmed'; bookingRef: BookingRef; paymentRef: PaymentRef }
  | { kind: 'failed'; reason: BookingFailure };

export const lockOffer = (
  state: BookingState,
  cmd: { offerId: AmadeusOfferId; lockedUntil: Date }
): Result<BookingState, BookingError> => { /* ... */ };
```

## References

- Cahier des charges v3.0 §4 (data model), §7 (booking flow), §8 (loyalty).
- Eric Evans / Vaughn Vernon DDD canon — adapted to TypeScript.
- `docs/01-architecture.md`
