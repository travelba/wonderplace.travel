---
name: loyalty-program
description: Loyalty program logic for ConciergeTravel.fr — tier FREE (auto, Little catalog) and tier PREMIUM (paid). Use for any code touching tier rules, benefits calculation, eligibility display in tunnel/fiches, or back-office membership management.
---

# Loyalty program — ConciergeTravel.fr

The cahier des charges defines two tiers (CDC v3.0 §8). The logic is encapsulated in `packages/domain/loyalty/`.

## Triggers

Invoke when:

- Modifying tier rules or benefits.
- Adding badges or upsell components in fiches / tunnel / account pages.
- Adjusting a member's tier from back-office.
- Persisting `loyalty_benefits` on a confirmed booking.

## Tiers

### FREE — "ConciergeTravel Essentiel"

- **Eligibility**: automatic on first confirmed booking.
- **Hotels eligible**: only `is_little_catalog = true`.
- **Duration**: 1 year from booking date.
- **Benefits** (per Little catalog metadata):
  - Breakfast for 2.
  - Late check-out until 14:00 (subject to availability).
  - Hotel credit (amount per hotel, defined in Little catalog).
- **Activation**: automatic; mentioned in confirmation email.

### PREMIUM — "ConciergeTravel Prestige"

- **Eligibility**: paid annual subscription (price TBD; UI ready, billing in Phase 2 — explicitly deferred).
- **Hotels eligible**: all hotels in the catalog.
- **Benefits**:
  - Breakfast for 2 (all hotels).
  - Room upgrade subject to availability.
  - Late check-out until 14:00 (all hotels).
  - Optional airport transfer at preferential rate.

## Non-negotiable rules

### Domain logic

- Pure functions in `packages/domain/loyalty/`:
  - `eligibleBenefits({ hotel, member }): Benefit[]`.
  - `applyTierUpgradeOnBooking({ memberState, booking })`.
  - `isPremiumActive({ member, today })`.
- Member state immutable; transitions return a new state.

### UI display rules (CDC §8.2)

- If hotel `is_little_catalog` AND user logged in:
  - Show badge "Avantages Essentiel inclus" with bullet list.
- If hotel NOT in Little catalog AND user logged in:
  - Show upsell card "Passez au tier Prestige pour bénéficier de [...] dans cet hôtel — à partir de [prix]/an" + CTA.
- If user not logged in: show generic loyalty teaser linking to `/programme-fidelite/`.

### Persistence

- On confirmed booking:
  - `bookings.loyalty_tier = active tier at booking time`.
  - `bookings.loyalty_benefits = applied benefits snapshot`.
  - If user has no `loyalty_members` row, create one with `tier = 'free'` (auto activation).

### Back-office

- Operator can manually adjust tier with reason. Triggers audit log.
- Admin can extend `tier_expiry`.
- Read-only timeline view of bookings + tier changes per member.

### Email touchpoints

- Brevo template `loyalty-welcome` sent on tier FREE auto-activation.
- Brevo template `loyalty-renewal-reminder` 30 days before expiry.

### MVP scope flag

- Tier PREMIUM billing flow is **out of MVP scope** (CDC v3.0 §13). The tier exists in data model and UI; subscription page shows "Bientôt disponible". Document the simplification in `docs/adr/0005-loyalty-premium-deferred.md`.

## Anti-patterns to refuse

- Hard-coding hotel benefits in the UI; benefits come from `hotels.loyalty_benefits_meta` (Little) or static config (Premium).
- Granting tier benefits when `payment_status != 'captured'`.
- Showing different benefits in fiche than in confirmation email.
- Allowing a customer-role server action to set `tier = 'premium'`.

## References

- CDC v3.0 §8.
- `domain-driven-design`, `booking-engine`, `email-workflow-automation`, `backoffice-cms` skills.
