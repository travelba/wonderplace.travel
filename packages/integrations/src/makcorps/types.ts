import { z } from 'zod';

export const MakcorpsHotelQuoteInputSchema = z.object({
  hotelId: z.string().min(1),
  checkin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkout: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(9),
  rooms: z.number().int().min(1).max(9).optional(),
  currency: z.string().length(3),
});

export type MakcorpsHotelQuoteInput = z.infer<typeof MakcorpsHotelQuoteInputSchema>;
