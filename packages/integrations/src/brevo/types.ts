import { z } from 'zod';

export const BrevoSendEmailInputSchema = z.object({
  sender: z.object({
    email: z.string().email(),
    name: z.string().optional(),
  }),
  to: z.array(z.object({ email: z.string().email() })).min(1),
  subject: z.string().min(1),
  htmlContent: z.string().min(1),
  /** Optional plain-text alternative (Brevo serves it for clients that strip HTML). */
  textContent: z.string().min(1).optional(),
});

export type BrevoSendEmailInput = z.infer<typeof BrevoSendEmailInputSchema>;

export const BrevoSendEmailResponseSchema = z
  .object({
    messageId: z.string().optional(),
  })
  .passthrough();

export type BrevoSendEmailResponse = z.infer<typeof BrevoSendEmailResponseSchema>;
