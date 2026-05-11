---
name: accessibility
description: WCAG 2.2 AA accessibility rules for ConciergeTravel.fr. Use whenever you build forms, navigation, modals, booking steps, dialogs, or any interactive UI; or when adding images, videos, color combinations.
---

# Accessibility — ConciergeTravel.fr

Accessibility is part of the maintainability and reach quality bar (CDC §10). Target: **WCAG 2.2 AA**. The booking tunnel must be usable on mobile with assistive tech.

## Triggers

Invoke when:

- Designing or modifying any interactive component (forms, modals, menus, tabs, accordions, date pickers).
- Adding images, videos, icons.
- Tweaking color tokens or contrast.
- Implementing focus management for the booking tunnel.

## Non-negotiable rules

### Semantic HTML first

- Use the right element: `<button>` for actions, `<a>` for navigation, `<nav>`, `<main>`, `<header>`, `<footer>`, `<section>`, `<article>`, `<aside>`.
- Headings hierarchy: a single `<h1>` per page, never skip levels.
- Landmark roles: `role="search"` on hotel search forms.

### Forms

- Every input has a visible `<label>` (or `aria-label` for icon-only).
- Validation errors announced via `aria-live="polite"` and tied to the input via `aria-describedby`.
- React Hook Form's `aria-invalid` + descriptive error text — no color-only signal.
- Required fields marked with `aria-required="true"` and a visible asterisk in label.

### Color and contrast

- Body text contrast ≥ **4.5:1**. Large text ≥ **3:1**. Critical CTAs ≥ **4.5:1**.
- Focus ring **always visible** (`outline: 2px solid var(--color-accent-gold); outline-offset: 2px;`) — never `outline: none` without a replacement.
- Never communicate by color alone (price comparator scenarios show text + icon, not just color).

### Keyboard

- All interactive elements reachable via Tab in logical order.
- Modals trap focus and restore on close.
- Booking tunnel step navigation: Enter advances, Esc cancels current step (with confirm if data entered).

### Images and media

- `<Image alt="...">` always meaningful; decorative images use `alt=""`.
- **Alt enrichi mot-clé + contexte** (CDC §2.2): `alt="piscine extérieure chauffée Hôtel X Nice"` — serves SEO AND accessibility in a single field. Avoid generic `alt="piscine"`.
- Icons-only buttons need `aria-label`.
- Hotel galleries (≥ 30 photos, CDC §2.2): keyboard-navigable, screen-reader-announced thumbnail count, lightbox with focus trap + Esc-to-close + arrow keys navigation.
- Embedded videos (CDC §2.2 — MP4 H.265 ≥ 30 s): provide WebVTT captions (mandatory for the visible video field) or a textual transcript fallback. Auto-play is forbidden — user must initiate playback.
- Visite virtuelle 360° (Matterport, CDC §2.2): the embed is not screen-reader-friendly. Expose a textual fallback `<a href={tour_360_url}>Visite virtuelle disponible — ouvrir dans un nouvel onglet</a>` next to the iframe, with `aria-label` describing what the visitor will see. Iframe `title` attribute mandatory.

### ARIA used sparingly

- Prefer native elements over `role="button"` on a `<div>`.
- ARIA patterns from APG: tabs, accordion, combobox (autocomplete city search), dialog.

### Internationalization & language

- `<html lang="fr">` on FR pages, `<html lang="en">` on EN pages.
- `lang="en"` on inline foreign-language strings (hotel names borrowed, etc.).

### Locale + currency selectors (CDC §2.1)

- Both the locale selector (FR/EN, V2 will add ES/DE/IT) and the currency selector are exposed in the site header.
- Implementation: ARIA `combobox` or `menu` pattern from APG. Each has a **visible label** (`lang="fr"`/`Devise`), not icon-only.
- Keyboard support: Tab focuses the trigger, Enter/Space opens the menu, Up/Down navigates options, Esc closes and restores focus.
- The selected value is announced via `aria-live="polite"` on change.
- Persistence: locale via Next.js routing (URL prefix), currency via cookie + `useState`. Selecting a currency must not refresh the page.

### Booking tunnel specifics

- Step header announces "Étape X sur Y" via `aria-live`.
- Payment iframe (Amadeus): a focus management script sets focus inside iframe on display, returns to recap on close.
- Cancellation policy block must be inside `<section aria-labelledby="cancellation-heading">`.

## Tooling

- ESLint plugin `jsx-a11y` enabled with strict rules.
- Storybook + `@storybook/addon-a11y` for component a11y reports (when introduced).
- Playwright a11y assertions via `@axe-core/playwright` on critical flows: home, search, hotel detail, booking step, confirmation.

## Anti-patterns to refuse

- `role="button"` on divs.
- Disabled focus ring without replacement.
- Carousels that auto-rotate without pause control.
- Modals without focus trap.
- `<a href="#">` for buttons.
- Color-only comparator scenario indicators.

## References

- CDC v3.0 §10 (UX premium, accessibility implicit in maintainability).
- WCAG 2.2 AA, ARIA Authoring Practices Guide.
- `responsive-ui-architecture`, `booking-engine` skills.
