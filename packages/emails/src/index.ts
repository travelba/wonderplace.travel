/**
 * @cct/emails — Brevo transactional email templates (React Email).
 * Each template lives in `src/templates/<slug>.tsx` and is rendered to HTML
 * by `packages/integrations/brevo` before sending (skill: email-workflow-automation).
 */
export const EMAILS_PACKAGE_VERSION = '0.0.1' as const;

export { renderEmailHtml, renderEmailText } from './render.js';

export { default as EmailRequestGuest } from './templates/email-request-guest.js';
export type { EmailRequestGuestProps } from './templates/email-request-guest.js';

export { default as EmailRequestOps } from './templates/email-request-ops.js';
export type { EmailRequestOpsProps } from './templates/email-request-ops.js';

export { default as BookingConfirmationGuest } from './templates/booking-confirmation-guest.js';
export type { BookingConfirmationGuestProps } from './templates/booking-confirmation-guest.js';
