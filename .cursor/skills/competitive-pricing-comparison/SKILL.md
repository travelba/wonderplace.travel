---
name: competitive-pricing-comparison
description: Non-affiliated price comparator for ConciergeTravel.fr (Makcorps primary, Apify fallback). Strict legal/UX rules — no affiliate links, no logos, text only, sober display. Use for any code touching the comparator widget, normalization, persistence, or scenario logic.
---

# Competitive pricing comparator — ConciergeTravel.fr

Per CDC addendum v3.2, ConciergeTravel.fr displays Booking.com, Expedia, Hotels.com and the official site prices **for information only**, **without affiliate links**, **without competitor logos**. The goal is to reassure users on price competitiveness, not redirect them.

## Triggers

Invoke when:

- Editing the comparator widget UI.
- Touching `packages/integrations/makcorps/` or `packages/integrations/apify/`.
- Modifying normalization, scenario calculation, or cache.
- Adding/removing providers from the comparator.

## Architecture

```
Frontend widget
       │
       ▼
/api/price-comparison         → cache hit? → return JSON
       │ miss
       ▼
Makcorps API (primary)         → on failure → Apify (fallback)
       │
       ▼
Normalize → cache 15 min in Redis → persist row in `price_comparisons`
       │
       ▼
Scenario decision (cheaper / equal_with_benefits / more_expensive)
```

## Non-negotiable rules

### Strict UX/legal rules (addendum v3.2)

- **No clickable link** to Booking.com or Expedia in the widget.
- **No competitor logos** (trademark risk).
- **Plain-text provider names**: "Booking.com", "Expedia", "Hotels.com", "Site officiel".
- Mandatory legal mention: "Prix observés à titre indicatif, susceptibles de varier".
- If a competitor price is unavailable, **hide the row** (no "N/A" visible).
- All prices displayed **TTC** (taxes included) for fair comparison.
- Display only when the user is on a hotel detail page after dates are selected (or on the search results card).

### Data sources

- Primary: Makcorps `GET https://api.makcorps.com/hotel?hotelid=...&checkin=...&checkout=...&adults=...&rooms=1&currency=EUR&api_key=...`.
- Fallback: Apify (same normalized shape).
- Mapping: `hotels.makcorps_hotel_id` populated by operator during onboarding (manual for 31 Palaces in Phase 1, semi-automated by name+city lookup in Phase 2).

### Caching

- Redis key `price-cmp:<hotelId>:<checkin>:<checkout>:<adults>` — TTL 15 min.
- Persist in Postgres `price_comparisons` for analytics and offline rendering on hotel pages.

### Normalization

- Function `normalizeComparison(rawData, isLittleCatalog)` returns `{ competitors: { booking, expedia, hotels, official_site }, benefitsValue, cheapestCompetitor }`.
- Filter out unavailable providers; missing fields = undefined (not null).

### Scenario logic (computed client-side with priceConcierge known)

- `cheaper`: `priceConcierge < cheapestCompetitor`.
- `equal_with_benefits`: `priceConcierge ≤ cheapestCompetitor AND benefitsValue > 0`.
- `more_expensive`: `priceConcierge > cheapestCompetitor` — display the comparator anyway with informational tone.
- Each scenario produces a different copy (e.g. "Le meilleur prix observé", "Prix équivalent + avantages inclus", "Comparaison à titre informatif").

### Performance and abuse

- Rate limit `/api/price-comparison`: 30 req/min/IP.
- Skip call when `makcorps_hotel_id` is null — return `{ available: false }`.

### Cost guardrails

- Track per-day call counters in Redis to enforce a daily quota set in env (`MAKCORPS_DAILY_QUOTA`).
- If quota reached, fall back to last persisted comparison from `price_comparisons` (with a "valeurs cachées" disclaimer).

## Anti-patterns to refuse

- Inserting competitor logos.
- Outbound links to Booking/Expedia from anywhere on the site.
- Displaying competitor prices without TTC disclaimer.
- Caching pre-payment Amadeus offer (priceConcierge) — that always comes fresh.
- Allowing the comparator to delay LCP — render the widget after the main content.

## References

- CDC v3.0 §9 (Comparateur Prix sans affiliation) + addendum v3.2.
- `redis-caching`, `api-integration`, `nextjs-app-router` skills.
