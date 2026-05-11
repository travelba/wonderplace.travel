import { z } from 'zod';

/** OAuth client-credentials response fragment. */
export const AmadeusOAuthTokenSchema = z
  .object({
    access_token: z.string(),
    expires_in: z.number(),
    token_type: z.string(),
    state: z.string().optional(),
  })
  .passthrough();

/** Hotels by city (reference-data locations). */
export const SearchHotelsByCityInputSchema = z.object({
  cityCode: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/, 'cityCode must be a 3-letter IATA uppercase code'),
  radius: z.number().min(1).max(300).optional(),
  radiusUnit: z.enum(['KM', 'MI']).optional(),
  ratings: z
    .array(
      z.union([z.literal('1'), z.literal('2'), z.literal('3'), z.literal('4'), z.literal('5')]),
    )
    .optional(),
});

export type SearchHotelsByCityInput = z.infer<typeof SearchHotelsByCityInputSchema>;

export const HotelsByCityResponseSchema = z
  .object({
    data: z.array(
      z
        .object({
          chainCode: z.string().optional(),
          dupeId: z.number().optional(),
          hotelId: z.string(),
          iataCode: z.string().optional(),
          name: z.string(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type HotelsByCityResponse = z.infer<typeof HotelsByCityResponseSchema>;

export const HotelOffersInputSchema = z.object({
  hotelIds: z.array(z.string().min(1)).min(1).max(50),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(9),
  /** Amadeus `childAges` (comma-separated in the query when set). */
  childAges: z.array(z.number().int().min(0).max(17)).max(9).optional(),
  currency: z.string().length(3).default('EUR'),
});

export type HotelOffersInput = z.infer<typeof HotelOffersInputSchema>;

// ----------------------------------------------------------------------------
// Typed offer fragment (skill: amadeus-gds) — keeps `.passthrough()` so vendor
// payload evolutions don't break parsing, while exposing the leaves we need
// to map to the booking domain.
// ----------------------------------------------------------------------------

const AmadeusPriceSchema = z
  .object({
    currency: z.string().length(3),
    /** Amadeus encodes amounts as strings, e.g. `"315.00"`. */
    base: z.string().optional(),
    total: z.string(),
    taxes: z
      .array(
        z
          .object({
            amount: z.string().optional(),
            currency: z.string().optional(),
            included: z.boolean().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const AmadeusCancellationSchema = z
  .object({
    /** Free-form description; we surface this verbatim per CDC §6. */
    description: z
      .object({ text: z.string().optional(), lang: z.string().optional() })
      .passthrough()
      .optional(),
    /** Amount kept by the hotel on cancellation (string in Amadeus payload). */
    amount: z.string().optional(),
    numberOfNights: z.number().int().optional(),
    /** ISO-8601 datetime in the property's local timezone. */
    deadline: z.string().optional(),
    type: z.string().optional(),
  })
  .passthrough();

const AmadeusPoliciesSchema = z
  .object({
    cancellations: z.array(AmadeusCancellationSchema).optional(),
    paymentType: z.string().optional(),
    guarantee: z.unknown().optional(),
    prepay: z.unknown().optional(),
  })
  .passthrough();

const AmadeusRoomSchema = z
  .object({
    type: z.string().optional(),
    typeEstimated: z
      .object({
        category: z.string().optional(),
        beds: z.number().int().optional(),
        bedType: z.string().optional(),
      })
      .passthrough()
      .optional(),
    description: z
      .object({ text: z.string().optional(), lang: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

const AmadeusGuestsSchema = z
  .object({
    adults: z.number().int().min(1),
    childAges: z.array(z.number().int().min(0)).optional(),
  })
  .passthrough();

export const AmadeusOfferSchema = z
  .object({
    id: z.string().min(1),
    checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    rateCode: z.string().optional(),
    rateFamilyEstimated: z
      .object({ code: z.string().optional(), type: z.string().optional() })
      .passthrough()
      .optional(),
    boardType: z.string().optional(),
    room: AmadeusRoomSchema.optional(),
    guests: AmadeusGuestsSchema,
    price: AmadeusPriceSchema,
    policies: AmadeusPoliciesSchema.optional(),
    self: z.string().url().optional(),
    commission: z.object({ percentage: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

export type AmadeusOffer = z.infer<typeof AmadeusOfferSchema>;

const AmadeusHotelHeadSchema = z
  .object({
    hotelId: z.string(),
    chainCode: z.string().optional(),
    name: z.string().optional(),
    cityCode: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  })
  .passthrough();

export type AmadeusHotelHead = z.infer<typeof AmadeusHotelHeadSchema>;

/** `GET /v3/shopping/hotel-offers` — list response. */
export const HotelOffersResponseSchema = z
  .object({
    data: z.array(
      z
        .object({
          type: z.string().optional(),
          hotel: AmadeusHotelHeadSchema,
          available: z.boolean().optional(),
          offers: z.array(AmadeusOfferSchema).min(1).optional(),
        })
        .passthrough(),
    ),
    meta: z.unknown().optional(),
  })
  .passthrough();

export type HotelOffersResponse = z.infer<typeof HotelOffersResponseSchema>;

export const OfferDetailInputSchema = z.object({
  offerId: z.string().min(1),
});

export type OfferDetailInput = z.infer<typeof OfferDetailInputSchema>;

/**
 * `GET /v3/shopping/hotel-offers/{offerId}` — singular response.
 * Amadeus returns `data: { hotel, offers: [<one offer>] }`.
 */
export const OfferDetailResponseSchema = z
  .object({
    data: z
      .object({
        type: z.string().optional(),
        hotel: AmadeusHotelHeadSchema,
        available: z.boolean().optional(),
        offers: z.array(AmadeusOfferSchema).min(1),
      })
      .passthrough(),
  })
  .passthrough();

export type OfferDetailResponse = z.infer<typeof OfferDetailResponseSchema>;

// ----------------------------------------------------------------------------
// Hotel order creation (`POST /v1/booking/hotel-orders`).
// ----------------------------------------------------------------------------

/**
 * Strict input shape; passed through to Amadeus body verbatim. Card data
 * never flows through this surface — payment is captured by Amadeus
 * Payments hosted iframe (PCI scope-out) and only a payment reference is
 * forwarded here.
 */
export const HotelOrderCreateInputSchema = z.object({
  data: z.object({
    type: z.literal('hotel-order'),
    guests: z
      .array(
        z.object({
          tid: z.number().int().min(1),
          title: z.string().optional(),
          firstName: z.string().min(1),
          lastName: z.string().min(1),
          phone: z.string().min(1),
          email: z.string().email(),
        }),
      )
      .min(1),
    travelAgent: z
      .object({
        contact: z.object({
          email: z.string().email(),
        }),
      })
      .optional(),
    roomAssociations: z
      .array(
        z.object({
          guestReferences: z
            .array(
              z.object({
                guestReference: z.string().min(1),
              }),
            )
            .min(1),
          hotelOfferId: z.string().min(1),
        }),
      )
      .min(1),
    payment: z.object({
      method: z.string().min(1),
      /** Reference produced by Amadeus Payments (token / paymentId). */
      paymentCard: z.unknown().optional(),
      paymentId: z.string().optional(),
    }),
  }),
});

export type HotelOrderCreateInput = z.infer<typeof HotelOrderCreateInputSchema>;

const HotelProviderInfoSchema = z
  .object({
    confirmationNumber: z.string().optional(),
    hotelProviderCode: z.string().optional(),
  })
  .passthrough();

const HotelBookingSchema = z
  .object({
    id: z.string().optional(),
    bookingStatus: z.string().optional(),
    hotelProviderInformation: z.array(HotelProviderInfoSchema).optional(),
    hotel: AmadeusHotelHeadSchema.optional(),
    hotelOffer: AmadeusOfferSchema.optional(),
  })
  .passthrough();

const AssociatedRecordSchema = z
  .object({
    reference: z.string().optional(),
    originSystemCode: z.string().optional(),
  })
  .passthrough();

const HotelOrderDataSchema = z
  .object({
    type: z.string().optional(),
    id: z.string(),
    hotelBookings: z.array(HotelBookingSchema).optional(),
    associatedRecords: z.array(AssociatedRecordSchema).optional(),
  })
  .passthrough();

export interface HotelOrderResponse {
  readonly data: z.infer<typeof HotelOrderDataSchema>;
}

export const HotelOrderResponseSchema: z.ZodType<HotelOrderResponse> = z
  .object({
    data: HotelOrderDataSchema,
  })
  .passthrough();

// ----------------------------------------------------------------------------
// Hotel Ratings — Amadeus e-Reputation v2
// `GET /v2/e-reputation/hotel-sentiments?hotelIds=…`
//
// Returns sentiment scores per hotel (`overallRating` and category-level
// breakdown), each on a 0–100 integer scale. Used to seed
// `AggregateRating` JSON-LD on hotel detail pages + trust signals in UI.
// ----------------------------------------------------------------------------

export const HotelSentimentsInputSchema = z.object({
  /** Comma-separated in the query; we accept the array shape and join. */
  hotelIds: z.array(z.string().min(1).max(16)).min(1).max(20),
});

export type HotelSentimentsInput = z.infer<typeof HotelSentimentsInputSchema>;

/**
 * Per-category breakdown documented by Amadeus. Every category is
 * optional because hotels with few reviews surface a partial map. All
 * scores are 0–100 integers — clamp at the boundary.
 */
const HotelSentimentCategoriesSchema = z
  .object({
    sleepQuality: z.number().int().min(0).max(100).optional(),
    service: z.number().int().min(0).max(100).optional(),
    facilities: z.number().int().min(0).max(100).optional(),
    roomComforts: z.number().int().min(0).max(100).optional(),
    valueForMoney: z.number().int().min(0).max(100).optional(),
    catering: z.number().int().min(0).max(100).optional(),
    location: z.number().int().min(0).max(100).optional(),
    pointsOfInterest: z.number().int().min(0).max(100).optional(),
    staff: z.number().int().min(0).max(100).optional(),
    internet: z.number().int().min(0).max(100).optional(),
  })
  .passthrough();

export type HotelSentimentCategories = z.infer<typeof HotelSentimentCategoriesSchema>;

const HotelSentimentEntrySchema = z
  .object({
    type: z.literal('hotelSentiment').optional(),
    hotelId: z.string().min(1),
    /** Overall score on a 0–100 scale, or `undefined` when no review yet. */
    overallRating: z.number().int().min(0).max(100).optional(),
    numberOfRatings: z.number().int().min(0).optional(),
    numberOfReviews: z.number().int().min(0).optional(),
    sentiments: HotelSentimentCategoriesSchema.optional(),
  })
  .passthrough();

export type HotelSentimentEntry = z.infer<typeof HotelSentimentEntrySchema>;

export const HotelSentimentsResponseSchema = z
  .object({
    data: z.array(HotelSentimentEntrySchema),
    /** Amadeus returns a meta object with counts and warnings for missing IDs. */
    warnings: z
      .array(
        z
          .object({
            code: z.number().int().optional(),
            title: z.string().optional(),
            detail: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export type HotelSentimentsResponse = z.infer<typeof HotelSentimentsResponseSchema>;
