---
name: responsive-ui-architecture
description: Mobile-first responsive UI architecture for ConciergeTravel.fr (Tailwind + shadcn/ui + design tokens). Use when designing layouts, building shared components, defining breakpoints, or any UI change that must remain restylable later without refactor.
---

# Responsive UI architecture — ConciergeTravel.fr

The cahier des charges asks for a **mobile-first, sober, restylable** UI base — no strong artistic direction yet. The design will be reworked later (CDC v3.0 §10), so the system must be **token-driven** so a single CSS file change repaints the product.

## Triggers

Invoke when:

- Adding any component to `packages/ui/`.
- Working on layouts, navigation (burger / bottom-sheet on mobile, sidebar on desktop).
- Touching breakpoints, spacing, typography.
- Implementing any booking tunnel screen (max 3 mobile screens, CDC §9).

## Non-negotiable rules

### Mobile-first

- Every component is designed at **375px** first; Tailwind classes start unprefixed (mobile), then add `sm:`, `md:`, `lg:`, `xl:`.
- Touch targets: minimum **44×44px** for any interactive element.
- Tunnel: max 3 screens on mobile (Search → Tunnel → Confirmation).

### Tokens

- All design decisions live in `packages/ui/tokens.css` as CSS custom properties:
  - `--color-bg` (#FAFAF8), `--color-fg` (#1A1A1A), `--color-accent-gold` (#C9A96E), `--color-sage`, `--color-border`, `--color-muted`.
  - `--font-serif` (e.g. Playfair Display), `--font-sans` (Inter / DM Sans), with `font-display: swap`.
  - `--space-1`..`--space-12` (4px base scale).
  - `--radius-sm`, `--radius-md`, `--radius-lg`.
- Tailwind reads tokens via `tailwind.config.ts` `theme.extend.colors / fontFamily / spacing` referencing CSS vars.
- **No hex literal in components**. Always tokens.

### Components

- Built on shadcn/ui primitives, recomposed in `packages/ui/components/`.
- Strict typing (`Props` interface), accept `className`, support `asChild` where shadcn does.
- Forms use **React Hook Form + Zod resolver**.
- Images use Next.js `<Image>` with `sizes` and explicit width/height to prevent CLS.

### Navigation

- Mobile: top header + burger → bottom-sheet menu. Footer is condensed.
- Desktop: sticky top header with mega-menu (regions/themes/guides), full footer with trust signals (IATA/ASPST badges, secure payment Amadeus, phone, financial guarantee).

### Trust signals (CDC §10.2) on every page

- Header: phone number visible, IATA + ASPST badges with link to official registers.
- Footer: APST financial guarantee, secure Amadeus payment with lock icon, "agence française, conseillers francophones".

### Editorial typography

- Titles in serif (`--font-serif`), body in sans (`--font-sans`), 16px base minimum.
- Line-height 1.5 body, 1.2 headings.
- Generous whitespace; never crowded layouts.

## Anti-patterns to refuse

- Hard-coded colors or pixel values in components.
- Desktop-first layouts adapted down to mobile.
- Touch targets < 44px.
- Loading custom fonts without `display: swap` and `<link rel="preload">`.
- Forms without `aria-*` and `label` association.
- Animations longer than 200ms blocking input.

## Booking tunnel UI rules (CDC §7, §9)

- Apple Pay / Google Pay buttons displayed prominently in payment recap (CDC §5.3).
- Cancellation policy block visible **before** payment (verbatim from Amadeus, no maison overlay).
- Step indicator with current step highlighted, accessible name `aria-current="step"`.

## References

- CDC v3.0 §9 (mobile-first), §10 (visual identity), §10.2 (trust signals).
- `accessibility`, `performance-engineering`, `booking-engine` skills.
