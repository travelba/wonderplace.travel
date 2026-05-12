---
name: email-workflow-automation
description: Brevo transactional emails and lifecycle automations for ConciergeTravel.fr (booking confirmation, J-3 reminder, post-stay, loyalty welcome, password reset, internal email-mode requests). Use for any email-related code or content.
---

# Email workflow automation — ConciergeTravel.fr

All transactional and lifecycle emails are sent through **Brevo** (CDC §2). Templates live in `packages/emails/` as React Email components, rendered to MJML/HTML and pushed to Brevo for sending.

## Triggers

Invoke when:

- Adding or editing an email template.
- Wiring a workflow (cron, scheduled trigger).
- Modifying the Brevo client / configuration.
- Adjusting tracking, suppression lists, or opt-out logic.

## Templates

| Slug                              | Trigger                              | When                | Audience      |
| --------------------------------- | ------------------------------------ | ------------------- | ------------- |
| `booking-confirmation`            | Payment captured                     | < 30s after capture | Customer      |
| `booking-confirmation-internal`   | Booking confirmed                    | Same                | reservations@ |
| `booking-request-acknowledgement` | `booking_requests_email` row created | Immediate           | Customer      |
| `booking-request-internal`        | Same                                 | Same                | reservations@ |
| `booking-reminder-j-3`            | 3 days before check-in               | Cron daily          | Customer      |
| `post-stay-followup`              | 2 days after check-out               | Cron daily          | Customer      |
| `loyalty-welcome`                 | Tier FREE auto-activated             | Immediate           | Customer      |
| `loyalty-renewal-reminder`        | 30 days before tier expiry           | Cron daily          | Customer      |
| `auth-email-verification`         | Signup                               | Immediate           | Customer      |
| `auth-password-reset`             | Reset requested                      | Immediate           | Customer      |
| `booking-cancelled`               | Status → cancelled                   | Immediate           | Customer      |
| `booking-refund-confirmation`     | Status → refunded                    | Immediate           | Customer      |

## Non-negotiable rules

### Templates

- Built with `@react-email/components`. Inline styles, mobile-first.
- Localized per user `preferred_locale` (FR/EN) — separate templates or a single i18n component.
- Subject lines in 6 words max, no emoji except where culturally appropriate.

### Branding

- Header logo (SVG inlined), trust signals: phone, IATA + ASPST, Amadeus payment lock.
- Footer: company info (legal entity, financial guarantee APST), unsubscribe link only on marketing emails (transactional doesn't legally require it but include preferences link).

### Sending

- Brevo Transactional API; never SMTP from the app.
- Helper `sendEmail({ template, to, props, locale })` in `packages/integrations/brevo`:
  - Renders React Email server-side.
  - Adds Sentry breadcrumb.
  - Returns `Result.ok({ messageId })` or typed error.
- Idempotency via `idempotency:email:<key>` Redis 24h.

### Cron schedules

- Vercel Cron (`apps/web/src/app/api/cron/...`):
  - `send-j-3-reminders` daily at 09:00 Europe/Paris.
  - `send-post-stay-followups` daily at 10:00.
  - `send-loyalty-renewal-reminders` daily at 11:00.
- Each cron is idempotent (a sent flag set in DB prevents re-sending).

### Suppression and opt-out

- Marketing opt-in checkbox at signup — stored in `profiles.marketing_opt_in`.
- Brevo's bounce/spam suppression list synced; we never send to suppressed addresses.

### Booking-confirmation contents

- Booking ref, hotel summary (image, name, address), dates, room, total, payment ref.
- Cancellation policy verbatim from `bookings.cancellation_policy`.
- Loyalty benefits applied (when present).
- "Préparez votre séjour" section: arrival time, check-in instructions.

### Internal emails

- Always sent from `reservations@conciergetravel.fr` for booking ops.
- Include a deep link to the back-office record (`/admin/collections/booking-requests-email/<id>`).

## Anti-patterns to refuse

- Sending marketing or transactional emails from a non-server context.
- Embedding raw user input in subject without sanitization.
- Reusing the same idempotency key across templates.
- Hardcoding addresses outside of env vars.

## References

- CDC v3.0 §2 (Brevo), §7 (booking flow includes emails).
- `api-integration`, `booking-engine`, `loyalty-program` skills.
