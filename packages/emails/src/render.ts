import { render } from '@react-email/render';
import type { ReactElement } from 'react';

/**
 * Renders a React Email template to a static HTML string suitable for
 * Brevo/`htmlContent`. Uses `@react-email/render` so inline styles and
 * Outlook-friendly fallbacks are emitted.
 *
 * Skill: email-workflow-automation.
 */
export async function renderEmailHtml(element: ReactElement): Promise<string> {
  return render(element, { pretty: false });
}

/** Plain-text fallback (Brevo accepts `textContent`). */
export async function renderEmailText(element: ReactElement): Promise<string> {
  return render(element, { plainText: true });
}
