import { loadSharedEnv, type SharedEnv } from '@cct/config/env';
import { err, ok, type Result } from '@cct/domain/shared';
import { retryingJsonRequest } from '@cct/integrations/http';

import type { BrevoError } from './errors.js';
import {
  BrevoSendEmailInputSchema,
  BrevoSendEmailResponseSchema,
  type BrevoSendEmailInput,
  type BrevoSendEmailResponse,
} from './types.js';

const BREVO_SMTP_URL = 'https://api.brevo.com/v3/smtp/email' as const;

export type BrevoClientConfig = {
  readonly apiKey: string;
};

export async function sendBrevoTransactionalEmail(
  cfg: BrevoClientConfig,
  input: BrevoSendEmailInput,
): Promise<Result<BrevoSendEmailResponse, BrevoError>> {
  const validated = BrevoSendEmailInputSchema.safeParse(input);
  if (!validated.success) {
    return err({ kind: 'parse_failure', details: 'invalid brevo payload' });
  }

  const res = await retryingJsonRequest({
    url: BREVO_SMTP_URL,
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'api-key': cfg.apiKey,
    },
    body: { kind: 'json', value: validated.data },
  });

  if (!res.ok) return err({ kind: 'http', error: res.error });
  if (res.value.json === undefined) {
    return err({ kind: 'parse_failure', details: 'empty brevo response' });
  }
  const parsed = BrevoSendEmailResponseSchema.safeParse(res.value.json);
  if (!parsed.success) {
    return err({ kind: 'parse_failure', details: 'brevo response shape' });
  }
  return ok(parsed.data);
}

export function brevoConfigFromSharedEnv(source?: SharedEnv): BrevoClientConfig {
  const env = source ?? loadSharedEnv();
  return { apiKey: env.BREVO_API_KEY };
}
