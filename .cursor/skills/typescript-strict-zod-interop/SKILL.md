---
name: typescript-strict-zod-interop
description: Type-level interop between Zod schemas, React component props, and `exactOptionalPropertyTypes: true` for ConciergeTravel.fr. Use whenever defining a Zod schema that will flow into React props, designing optional fields on shared types, or fixing `Type 'undefined' is not assignable to type X` compile errors caused by strict TS settings.
---

# TypeScript strict × Zod interop — ConciergeTravel.fr

The repo runs with `strict: true` **and** `exactOptionalPropertyTypes: true` (see `packages/config/typescript/tsconfig.base.json`). That latter flag is non-negotiable per CDC §2, but it creates a class of compile errors at the Zod ↔ React boundary that the standard `typescript-strict` skill does not cover. This skill is the playbook.

## Triggers

Invoke when:

- Designing a Zod schema whose `z.infer<typeof X>` will be used as a React component prop.
- Fixing a `Type 'T | undefined' is not assignable to type 'T'` error on an optional field.
- Adding an optional field to a shared editorial type (`GuideRow`, `RankingRow`, `Hotel`, `EditorialTable`, `EditorialCallout`, …).
- Hooking up LLM-generated content (string-typed enums) to a front-end component that wants a literal union.

## Rule 1 — Understand `exactOptionalPropertyTypes`

With this flag, an optional field declared as `field?: T` does **not** automatically allow `undefined`:

```ts
interface Props {
  readonly level?: 2 | 3; // ⚠ this is `level: 2 | 3` (not present) or `level: 2 | 3` (present)
}

const obj = { level: undefined };
const x: Props = obj;
// ❌ Error: Type 'undefined' is not assignable to type '2 | 3'.
```

Two valid fixes:

```ts
// Option A — accept undefined explicitly (preferred for props that flow from Zod)
interface Props {
  readonly level?: 2 | 3 | undefined;
}

// Option B — never set the property when unknown (preferred for hand-rolled object literals)
const obj: Props = {}; // omit `level` entirely
```

## Rule 2 — Zod `.optional()` produces `T | undefined`

```ts
const Schema = z.object({
  level: z.union([z.literal(2), z.literal(3)]).optional(),
});
type Inferred = z.infer<typeof Schema>;
// → { level?: 2 | 3 | undefined }
```

Note the `| undefined`. If a React component declares `level?: 2 | 3` (no `| undefined`) and tries to consume `Inferred`, TS refuses the assignment under `exactOptionalPropertyTypes`.

**The rule: any prop type that accepts a Zod-inferred value MUST include `| undefined` on every optional field.**

```ts
// ✅ in `apps/web/src/components/editorial/toc-sidebar.tsx`
export interface TocAnchor {
  readonly anchor: string;
  readonly label_fr: string;
  readonly label_en: string;
  readonly level?: 2 | 3 | undefined; // ← explicit | undefined for Zod compat
}
```

## Rule 3 — Nested optionals: same rule, recursive

```ts
const Cell = z.object({
  text: z.string(),
  href: z.string().nullish(), // null | string | undefined
});
type Cell = z.infer<typeof Cell>;
// → { text: string; href?: string | null | undefined }

// Consumer must accept undefined on href:
export type TableCell =
  | string
  | number
  | null
  | { readonly text: string; readonly href?: string | null | undefined };
```

Missing the `| undefined` on `href` causes the parent component to fail when assigning a `readonly Cell[]` from Zod into `readonly TableCell[]`.

## Rule 4 — Free-form `string` for LLM-driven enums, narrow at render

LLMs produce enum _variants_ (`encyclopedia` instead of `wikipedia`, `concierge` instead of `concierge_tip`). Two layers:

### Layer 1 — Schema accepts `string`

```ts
// apps/web/src/server/guides/get-guide-by-slug.ts
const CalloutSchema = z.object({
  kind: z.string(), // permissive, no enum
  title_fr: z.string(),
  body_fr: z.string(),
});
```

### Layer 2 — Component normalizes via a small allow-list + fallback

```ts
// apps/web/src/components/editorial/editorial-callout.tsx
export type CalloutKind = 'did_you_know' | 'concierge_tip' | 'warning' | 'pro_tip' | 'fact';
const KNOWN: readonly CalloutKind[] = [
  'did_you_know',
  'concierge_tip',
  'warning',
  'pro_tip',
  'fact',
];
function isKnown(value: string): value is CalloutKind {
  return (KNOWN as readonly string[]).includes(value);
}

export interface EditorialCalloutData {
  readonly kind: string; // ← permissive, from Zod
  readonly title_fr: string;
  readonly body_fr: string;
}

export function EditorialCallout({ callout }: { callout: EditorialCalloutData }) {
  const safeKind: CalloutKind = isKnown(callout.kind) ? callout.kind : 'fact';
  // … use safeKind to lookup CSS tones and labels.
}
```

The DB accepts every variant; the UI silently degrades to a neutral fallback when the LLM drifts. **No `as CalloutKind` cast anywhere**, matches the `typescript-strict` rule "no `as Foo`".

## Rule 5 — `z.preprocess` to canonicalise _before_ a strict enum

When you DO need a strict `z.enum` (e.g. database column constraint), preprocess synonyms before the enum check:

```ts
const SECTION_TYPES = ['intro', 'history', 'gastronomy', 'practical'] as const;

const SectionSchema = z.object({
  type: z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    const alias: Record<string, string> = {
      overview: 'intro',
      introduction: 'intro',
      food: 'gastronomy',
      cuisine: 'gastronomy',
    };
    return alias[v] ?? v;
  }, z.enum(SECTION_TYPES)),
});
```

`z.infer<typeof SectionSchema>['type']` is the strict union `'intro' | 'history' | 'gastronomy' | 'practical'` — no `string` leaks out.

## Rule 6 — `callLlm` generic signature for inference

The helper that calls the LLM and parses must use a generic so call-sites get full inference:

```ts
async function callLlm<S extends z.ZodTypeAny>(
  client: OpenAI,
  system: string,
  user: string,
  schema: S,
  tag: string,
): Promise<z.infer<S>> {
  /* … */
}

// Call site:
const guide = await callLlm(client, SYS, prompt, GuideSchema, 'paris');
// `guide` is typed as z.infer<typeof GuideSchema> — no manual annotation.
```

Avoid the temptation to write `Promise<unknown>` and force consumers to cast — that round-trip through `unknown` violates `no `as``from the`typescript-strict` skill.

## Rule 7 — Don't paper over with `as`

If the compiler refuses an assignment between Zod-inferred and prop type, **fix the prop type**, never cast:

```ts
// ❌ forbidden
<TocSidebar anchors={guide.toc_anchors as readonly TocAnchor[]} />

// ✅ widen the prop type to accept the Zod-inferred shape
export interface TocAnchor {
  readonly anchor: string;
  readonly level?: 2 | 3 | undefined; // ← here
}
```

Casts hide schema drift; widening the prop type makes the contract explicit.

## Rule 8 — `noUncheckedIndexedAccess` × array access

This other strict flag means `arr[0]` is typed as `T | undefined`. Combine with `exactOptionalPropertyTypes` carefully:

```ts
const first = items[0]; // T | undefined
if (first === undefined) return null;
// first is now narrowed to T

// Or with `!` it's forbidden by `typescript-strict` — use a guard:
const first = items[0] ?? defaultValue;
```

When iterating over Zod-validated arrays, the items are `T` not `T | undefined` only if you use `.map`, `.forEach`, or destructure. Bare `arr[i]` is always `T | undefined`.

## Quick reference table

| Situation                              | Solution                                          |
| -------------------------------------- | ------------------------------------------------- |
| Zod `.optional()` → React prop         | Add `\| undefined` to the prop's optional field   |
| LLM-produced enum drift                | `string` in schema + narrowing guard in component |
| Strict DB enum needed                  | `z.preprocess(alias, z.enum([...]))`              |
| `arr[i]` is `T \| undefined`           | Use `??`, narrowing guards, or `.find`            |
| Generic call-site inference            | `<S extends z.ZodTypeAny>` on the helper          |
| Compiler refuses Zod ↔ prop assignment | Widen the prop type, never `as`                   |

## Anti-patterns

- ❌ `as CalloutKind`, `as readonly TocAnchor[]`, `as unknown as Foo`.
- ❌ React prop `level?: 2 | 3` consuming Zod's `level?: 2 | 3 | undefined`.
- ❌ Hard `z.enum([…])` on a field the LLM produces with synonyms.
- ❌ `Promise<unknown>` return from `callLlm` forcing callers to cast.
- ❌ `arr[i]!` instead of a narrowing guard (also banned by `typescript-strict`).

## References

- `typescript-strict` skill (base rules — no `any`, no `as`, no `!`).
- `llm-output-robustness` skill (`z.preprocess` alias maps).
- `content-modeling` skill (Zod schema patterns for Payload + Supabase).
- Reference impls: `apps/web/src/components/editorial/*.tsx`, `apps/web/src/server/{guides,rankings}/get-*-by-slug.ts`.
