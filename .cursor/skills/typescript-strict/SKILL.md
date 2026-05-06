---
name: typescript-strict
description: TypeScript strict-mode rules for ConciergeTravel.fr. Use when configuring tsconfig, declaring types, parsing vendor responses, defining IDs/slugs, or whenever you would be tempted to use `any`, `as`, or non-null assertions.
---

# TypeScript strict — ConciergeTravel.fr

The cahier des charges mandates **TypeScript strict** because Amadeus, Little Hotelier and Makcorps responses must be typed end-to-end (CDC v3.0 §2). Type safety is contractual.

## Triggers

Invoke when:
- Creating or editing a `tsconfig*.json`.
- Declaring DTOs from vendor APIs.
- Designing data layer types.
- About to write `any`, `as Foo`, or `value!`.

## tsconfig baseline (packages/config/typescript/tsconfig.base.json)

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "useDefineForClassFields": true
  }
}
```

## Non-negotiable rules

- **No `any`**. Use `unknown` and narrow with type guards or Zod.
- **No `as Foo`** unless the value comes from a Zod parse or a type-guard. Casting to satisfy the compiler is forbidden.
- **No non-null assertion `!`**. If a value can be undefined, handle it.
- **No `// @ts-ignore` / `@ts-expect-error`** without a comment justifying and a linked issue.
- **Vendor responses are validated with Zod schemas** in `packages/integrations/<vendor>/types.ts`. The Zod parse is the source of truth — no manual type assertions.
- **Branded types** for IDs and slugs (`type HotelId = string & { __brand: 'HotelId' }`).
- **Discriminated unions** for state and results. `{ ok: true; data } | { ok: false; error }`.
- **Exhaustive switch** with `never`-returning helper:

```ts
const exhaustive = (x: never): never => { throw new Error('Unhandled: ' + JSON.stringify(x)); };
```

## Vendor response parsing pattern

```ts
// packages/integrations/amadeus/types.ts
import { z } from 'zod';

export const HotelOfferZ = z.object({
  type: z.literal('hotel-offers'),
  hotel: z.object({ hotelId: z.string(), name: z.string() }),
  offers: z.array(z.object({
    id: z.string(),
    rateCode: z.string(),
    price: z.object({ currency: z.string(), total: z.string() }),
    policies: z.object({ cancellations: z.array(z.unknown()) }).optional(),
  })),
});
export type HotelOffer = z.infer<typeof HotelOfferZ>;

export const parseHotelOffer = (raw: unknown) => HotelOfferZ.safeParse(raw);
```

## Anti-patterns to refuse

- Wide DTO types like `Record<string, any>` for vendor responses.
- `as unknown as Foo` double-cast tricks.
- Optional chaining stacked deeply without narrowing (`a?.b?.c?.d?.e`) — refactor to typed guards.
- Implicit `any` returns from inferred async functions calling untyped APIs.
- Returning generic `Error` objects from domain services — use typed errors.

## React 19 typing notes

- Server Components return `Promise<JSX.Element>` — typing inferred, no need to annotate.
- `React.FC` is discouraged; prefer `function Component(props: Props) {}`.
- Event handlers typed via React types: `React.MouseEvent<HTMLButtonElement>`, etc.

## References

- CDC v3.0 §2 (TypeScript strict obligatoire).
- TypeScript handbook — strict modes.
- `domain-driven-design`, `api-integration` skills.
