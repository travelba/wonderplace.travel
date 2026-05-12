import type { Hotel } from 'schema-dts';

import { aggregateRatingJsonLd, type AggregateRatingInput } from './aggregate-rating';
import { offerJsonLd, type OfferInput } from './offer';

/**
 * Hotel JSON-LD node — `schema-dts`' `Hotel` is overly conservative
 * compared to what Google actually accepts and what the Schema.org
 * spec defines on parent types. We re-open it with two
 * well-documented extensions:
 *
 *   - `dateModified` (Schema.org: defined on `CreativeWork`, but
 *     Google's Hotel rich-result documentation explicitly lists it
 *     as a recommended property on `Hotel` — it's the freshness
 *     signal LLM ingestion pipelines weight most).
 *   - `nearbyAttractions` (Schema.org: defined on `LodgingBusiness`
 *     via the Hotels extension; schema-dts misses it). Carries an
 *     array of `Place` nodes.
 *
 * Re-opening rather than casting keeps the rest of the builder
 * type-safe — we only widen the two specific fields we need.
 */
type HotelBaseNode = Exclude<Hotel, string>;
/** Hotel without the bare-IRI string union from schema-dts. */
export type HotelNode = HotelBaseNode & {
  dateModified?: string;
  nearbyAttractions?: readonly NearbyAttractionNode[] | NearbyAttractionNode;
  containsPlace?: readonly ContainedPlaceNode[] | ContainedPlaceNode;
  /**
   * Schema.org defines `tourBookingPage` on `LodgingBusiness` as
   * "A page providing information about how to book a tour of some
   * Place, such as an Accommodation … as well as other kinds of
   * tours as appropriate." schema-dts misses it on the narrower
   * `Hotel` subtype, so we re-open the field here.
   */
  tourBookingPage?: string;
};

/**
 * `HotelRoom` sub-place exposed under the parent hotel's
 * `containsPlace`. Carries `@type`, `name` and `url` so search
 * engines and LLM ingestion pipelines can follow the link to the
 * indexable room sub-page without having to re-crawl the parent
 * fiche. We deliberately keep the shape small (no `floorSize`,
 * `bed`, etc.) — those facts already live in the *room* JSON-LD
 * at the sub-page URL and duplicating them inside the parent
 * graph would bloat the envelope without changing Google's
 * indexing outcome.
 */
type ContainedRoomNode = {
  '@type': 'HotelRoom';
  name: string;
  url: string;
};

/**
 * `MeetingRoom` sub-place exposed under the parent hotel's
 * `containsPlace` (Schema.org: `MeetingRoom` is a `Place` subtype
 * under the broader Hotels extension, intended for event venues
 * embedded inside a hotel).
 *
 * Carries the three facts MICE planners use to pre-qualify a venue
 * before requesting a quote:
 *
 *   - `name` — the editorial label ("Salon Kléber").
 *   - `floorSize` — surface as a `QuantitativeValue` in m² (UN/ECE
 *     unit code `MTK`, Google-recognised). We always emit m² as we
 *     never store imperial.
 *   - `maximumAttendeeCapacity` — single integer for the biggest
 *     supported layout (theatre by default). Schema.org defines
 *     this on `Event` and `Place`; Google's structured-data tooling
 *     accepts it on `MeetingRoom` since 2023.
 *
 * `description` is optional and carries the localised editorial
 * notes (e.g. "Salle de bal principale, plafond 5,5 m").
 *
 * No `containedInPlace` back-pointer to the parent hotel — the
 * graph is already nested under the Hotel node so the relation is
 * implicit. Inlining the back-pointer would only bloat the envelope.
 */
type MeetingRoomNode = {
  '@type': 'MeetingRoom';
  name: string;
  floorSize: { '@type': 'QuantitativeValue'; value: number; unitCode: 'MTK' };
  maximumAttendeeCapacity: number;
  description?: string;
};

type ContainedPlaceNode = ContainedRoomNode | MeetingRoomNode;

/**
 * `Place` subtype emitted under `nearbyAttractions`. We keep it as
 * a structural type (not a discriminated union) because the set of
 * `@type` strings is open-ended and depends on the editorial taxonomy.
 */
type NearbyAttractionNode = {
  '@type': string;
  name: string;
  geo?: { '@type': 'GeoCoordinates'; latitude: number; longitude: number };
  sameAs?: string;
};

export interface HotelAddressInput {
  readonly streetAddress: string;
  readonly addressLocality: string;
  readonly postalCode: string;
  /** ISO 3166-1 alpha-2 country code, defaults to `FR`. */
  readonly addressCountry?: string;
  readonly addressRegion?: string;
}

export interface HotelGeoInput {
  readonly latitude: number;
  readonly longitude: number;
}

export interface HotelJsonLdInput {
  readonly name: string;
  readonly url: string;
  readonly description?: string;
  /** Star rating (1–5). For *Palaces* (Atout France), set `starRating: 5` plus `isPalace: true`. */
  readonly starRating?: 1 | 2 | 3 | 4 | 5;
  /** Marker for the regulated Atout France *Palace* distinction. Surfaces an `award` field. */
  readonly isPalace?: boolean;
  readonly images?: readonly string[];
  readonly telephone?: string;
  readonly priceRange?: string;
  readonly address?: HotelAddressInput;
  readonly geo?: HotelGeoInput;
  readonly amenityFeatures?: readonly string[];
  readonly aggregateRating?: AggregateRatingInput;
  readonly offer?: OfferInput;
  /**
   * Optional list of recognitions/awards. Each entry is a free-form text such
   * as `"Forbes Travel Guide 5 Stars — 2024"`. Concatenated with the regulated
   * `Distinction Palace` marker when `isPalace` is also `true`.
   */
  readonly awards?: readonly string[];
  /**
   * Number of bookable units (Schema.org `Hotel.numberOfRooms`). Integer,
   * positive. When provided we surface it both as the rich-result property
   * and let LLMs ground "How many rooms does X have?" queries.
   */
  readonly numberOfRooms?: number;
  /**
   * Time-of-day strings in 24h `HH:MM` form. We do NOT coerce or validate
   * here — the page-level reader already ran them through a Zod regex.
   * Schema.org accepts either bare `Time` or a full `DateTime`; the former
   * is enough for Google's Hotel rich-result test.
   */
  readonly checkinTime?: string;
  readonly checkoutTime?: string;
  /**
   * `true` when pets are accepted (any policy). `false` when explicitly
   * refused. `undefined` leaves the field unset — Google treats absence
   * as "unknown" rather than "no".
   */
  readonly petsAllowed?: boolean;
  /**
   * Editorial pull-quote reviews (Forbes, Condé Nast Traveler, Michelin,
   * etc.). Surfaced as Schema.org `Review[]` items under the Hotel node.
   *
   *   - `reviewBody` ← quote.
   *   - `author.@type = Organization`, `author.name` ← `author ?? source`.
   *   - `publisher.@type = Organization`, `publisher.name` ← `source`.
   *   - `reviewRating` ← `{ratingValue, bestRating, worstRating: 0}` when
   *     `rating` + `maxRating` are both set.
   *   - `datePublished` ← `date`.
   *   - `url` ← `sourceUrl` (HTTPS).
   *
   * Capped at 5 entries before emission to stay within Google's
   * documented Hotel rich-result envelope.
   */
  readonly featuredReviews?: readonly HotelFeaturedReviewInput[];
  /**
   * ISO-8601 timestamp of the last meaningful content update. Surfaces
   * as `dateModified` on the Hotel node — a strong freshness signal
   * for both search engines and LLM ingestion pipelines (Perplexity,
   * SearchGPT) that weight recent content higher.
   *
   * Pass `row.updated_at` from the page reader; the builder accepts
   * either a `YYYY-MM-DDTHH:MM:SSZ` Datetime or a bare `YYYY-MM-DD`.
   */
  readonly dateModified?: string;
  /**
   * Editorial opening year (CDC §2.15 — `foundingDate` on Schema.org's
   * `Organization` parent of `Hotel`). Emitted as a bare `YYYY` string
   * which Google's hotel rich-result test accepts and which LLM
   * pipelines parse correctly for "How old is X?" queries.
   *
   * The reader at the page level (`readHotelHistoryDates`) is the
   * source of truth for the value range — this builder simply forwards
   * what it gets, with a defensive non-empty check.
   */
  readonly foundingDate?: string;
  /**
   * Optional URL of an external immersive 3D / 360° tour of the
   * property (e.g. Matterport, Kuula). Surfaced as Schema.org
   * `LodgingBusiness.tourBookingPage` — Google's Hotel rich-result
   * documentation honours the field, and LLM ingestion pipelines
   * use it to answer "Can I take a virtual tour of X?" queries.
   *
   * The caller is responsible for restricting the URL to a curated
   * allowlist of providers (the reader in
   * `apps/web/src/server/hotels/get-hotel-by-slug.ts:readVirtualTour`
   * enforces Matterport + Kuula and mirrors the CSP `frame-src`
   * directive in `apps/web/src/lib/security/csp.ts`). The builder
   * itself simply forwards the value with a defensive non-empty
   * check; it does NOT re-validate the URL shape.
   */
  readonly tourBookingPage?: string;
  /**
   * Points of interest within walking distance of the hotel, emitted
   * as the `nearbyAttractions` Hotel property (Google-supported
   * extension to Schema.org's `LodgingBusiness`).
   *
   * Capped at 10 entries in the builder. Each entry is rendered as a
   * `TouristAttraction` (or subtype derived from `type`) `Place` with
   * `name` and an optional `geo` block.
   *
   * We intentionally do NOT emit `distance` as Schema.org does not
   * define a `Distance` property on `Place`; the human-visible
   * distance is rendered in `<HotelLocation>` already.
   */
  readonly nearbyAttractions?: readonly NearbyAttractionInput[];
  /**
   * Editorial room sub-pages exposed as Schema.org
   * `Hotel.containsPlace` entries. Each entry surfaces as a
   * `HotelRoom` node carrying `name` + `url` only — the full room
   * graph (`floorSize`, `bed`, `containedInPlace` back to this
   * hotel, …) lives at the room sub-page itself, so duplicating it
   * here would bloat the parent envelope without changing crawl
   * coverage.
   *
   * Capped at 20 entries to keep the JSON envelope tight (Google
   * stops weighting `containsPlace` past the first dozen, and our
   * editorial pipeline already collapses 200-key inventories to
   * 3-5 highlight categories).
   */
  readonly containedRooms?: readonly ContainedRoomInput[];
  /**
   * MICE event spaces exposed as Schema.org `Hotel.containsPlace`
   * entries with `@type: MeetingRoom`. The MICE section on the
   * public page (`<HotelMiceEvents>`) is the human-readable surface
   * for this data; the JSON-LD mirrors it so search engines and
   * LLM ingestion pipelines can answer:
   *
   *   - "What event spaces does X have?"
   *   - "Largest meeting room at X?" (max `maximumAttendeeCapacity`)
   *   - "Hotel in Paris with a 300 m² ballroom?" (faceted retrieval)
   *
   * Capped at 30 entries — even the largest convention hotels in our
   * curated catalogue have fewer than 20 named spaces; 30 is a
   * defensive ceiling against editorial copy-paste of an exhaustive
   * function-sheet that would dilute the structured signal.
   *
   * Mixed with `containedRooms` (HotelRoom) under the same
   * `containsPlace` array, because Schema.org's `containsPlace` is a
   * single property and the `@type` discriminator is what consumers
   * filter on.
   */
  readonly eventSpaces?: readonly MeetingRoomInput[];
}

export interface ContainedRoomInput {
  readonly name: string;
  readonly url: string;
}

/**
 * MICE event-space input for the hotel JSON-LD builder. Matches the
 * shape of `LocalisedMiceSpace` produced by `readMiceInfo()` in
 * `apps/web/src/server/hotels/get-hotel-by-slug.ts`. Surface units
 * are always **square metres** (UN/ECE code `MTK`); we never accept
 * imperial because the application never stores it.
 */
export interface MeetingRoomInput {
  readonly name: string;
  readonly surfaceSqm: number;
  readonly maxSeated: number;
  /** Optional editorial note (localised at the call site). */
  readonly description?: string;
}

export interface HotelFeaturedReviewInput {
  readonly source: string;
  readonly sourceUrl?: string;
  readonly author?: string;
  readonly quote: string;
  readonly rating?: number;
  readonly maxRating?: number;
  /** Optional ISO-8601 `YYYY-MM-DD` publication date. */
  readonly date?: string;
}

/**
 * Free-form POI input. `type` maps loosely to a Schema.org Place
 * subtype (see `POI_TYPE_TO_SCHEMA` in this module). Unknown types
 * fall back to the generic `TouristAttraction`.
 */
export interface NearbyAttractionInput {
  readonly name: string;
  readonly type: string;
  readonly latitude?: number;
  readonly longitude?: number;
  /** Optional canonical URL of the attraction (Wikidata, Wikipedia, official site). */
  readonly sameAs?: string;
}

/**
 * POI editorial type → Schema.org Place subtype. We picked the
 * narrowest subtype that still validates as `Place`. Wide categories
 * (`station`, `area`) fall back to `TouristAttraction` which is the
 * Google-recommended default for "things tourists go to see".
 */
const POI_TYPE_TO_SCHEMA: Readonly<Record<string, string>> = {
  monument: 'LandmarksOrHistoricalBuildings',
  landmark: 'LandmarksOrHistoricalBuildings',
  museum: 'Museum',
  art_gallery: 'Museum',
  park: 'Park',
  garden: 'Park',
  shopping: 'ShoppingCenter',
  store: 'ShoppingCenter',
  restaurant: 'Restaurant',
  cafe: 'Restaurant',
  church: 'PlaceOfWorship',
  cathedral: 'PlaceOfWorship',
  synagogue: 'PlaceOfWorship',
  mosque: 'PlaceOfWorship',
  theater: 'PerformingArtsTheater',
  theatre: 'PerformingArtsTheater',
  zoo: 'Zoo',
  beach: 'Beach',
};

function poiSchemaType(rawType: string): string {
  const key = rawType.toLowerCase().trim();
  return POI_TYPE_TO_SCHEMA[key] ?? 'TouristAttraction';
}

const PALACE_AWARD = 'Distinction Palace — Atout France';

/**
 * `Hotel` JSON-LD (skill: structured-data-schema-org).
 *
 * Legal note: the *Palace* distinction is regulated by Atout France. When
 * `isPalace` is `true`, expose it via the standard `award` property; never
 * inflate `starRating` beyond 5.
 */
export const hotelJsonLd = (input: HotelJsonLdInput): HotelNode => {
  const out: HotelNode = {
    '@type': 'Hotel',
    name: input.name,
    url: input.url,
  };

  if (input.description !== undefined) {
    out.description = input.description;
  }
  if (input.starRating !== undefined) {
    // `bestRating: 5` is recommended by Google's hotel rich-result
    // documentation even though `ratingValue` is already capped at 5
    // by our discriminated input type. Emitting it explicitly removes
    // any ambiguity for indexers that don't infer the scale.
    out.starRating = { '@type': 'Rating', ratingValue: input.starRating, bestRating: 5 };
  }
  // `award` may carry the regulated Palace distinction and/or editorial
  // recognitions. Schema.org allows multiple values, expressed as a string
  // array when the count is > 1.
  const awardEntries: string[] = [];
  if (input.isPalace === true) {
    awardEntries.push(PALACE_AWARD);
  }
  if (input.awards !== undefined) {
    for (const award of input.awards) {
      const trimmed = award.trim();
      if (trimmed.length > 0) awardEntries.push(trimmed);
    }
  }
  const firstAward = awardEntries[0];
  if (awardEntries.length === 1 && firstAward !== undefined) {
    out.award = firstAward;
  } else if (awardEntries.length > 1) {
    out.award = awardEntries;
  }
  if (input.images !== undefined && input.images.length > 0) {
    out.image = [...input.images];
  }
  if (input.telephone !== undefined) {
    out.telephone = input.telephone;
  }
  if (input.priceRange !== undefined) {
    out.priceRange = input.priceRange;
  }
  if (input.address !== undefined) {
    out.address = {
      '@type': 'PostalAddress',
      streetAddress: input.address.streetAddress,
      addressLocality: input.address.addressLocality,
      postalCode: input.address.postalCode,
      addressCountry: input.address.addressCountry ?? 'FR',
      ...(input.address.addressRegion !== undefined
        ? { addressRegion: input.address.addressRegion }
        : {}),
    };
  }
  if (input.geo !== undefined) {
    out.geo = {
      '@type': 'GeoCoordinates',
      latitude: input.geo.latitude,
      longitude: input.geo.longitude,
    };
  }
  if (input.amenityFeatures !== undefined && input.amenityFeatures.length > 0) {
    out.amenityFeature = input.amenityFeatures.map((name) => ({
      '@type': 'LocationFeatureSpecification',
      name,
      value: true,
    }));
  }
  if (input.aggregateRating !== undefined) {
    out.aggregateRating = aggregateRatingJsonLd(input.aggregateRating);
  }
  if (input.offer !== undefined) {
    out.makesOffer = offerJsonLd(input.offer);
  }
  if (input.numberOfRooms !== undefined && input.numberOfRooms > 0) {
    out.numberOfRooms = input.numberOfRooms;
  }
  if (input.checkinTime !== undefined && input.checkinTime.length > 0) {
    out.checkinTime = input.checkinTime;
  }
  if (input.checkoutTime !== undefined && input.checkoutTime.length > 0) {
    out.checkoutTime = input.checkoutTime;
  }
  if (input.petsAllowed !== undefined) {
    out.petsAllowed = input.petsAllowed;
  }
  if (input.dateModified !== undefined && input.dateModified.length > 0) {
    out.dateModified = input.dateModified;
  }
  if (input.foundingDate !== undefined && input.foundingDate.length > 0) {
    out.foundingDate = input.foundingDate;
  }
  if (input.tourBookingPage !== undefined && input.tourBookingPage.length > 0) {
    out.tourBookingPage = input.tourBookingPage;
  }
  if (input.nearbyAttractions !== undefined && input.nearbyAttractions.length > 0) {
    // Cap at 10 to keep the JSON-LD envelope tight. Google ignores
    // anything past the first dozen anyway and oversized graphs hurt
    // crawl-budget. The visible `<HotelLocation>` component renders
    // up to 8 POIs already, so 10 here keeps a small buffer for the
    // "+2 not visible but indexable" pattern.
    out.nearbyAttractions = input.nearbyAttractions.slice(0, 10).map((poi) => ({
      '@type': poiSchemaType(poi.type),
      name: poi.name,
      ...(poi.latitude !== undefined && poi.longitude !== undefined
        ? {
            geo: {
              '@type': 'GeoCoordinates',
              latitude: poi.latitude,
              longitude: poi.longitude,
            },
          }
        : {}),
      ...(poi.sameAs !== undefined && poi.sameAs.length > 0 ? { sameAs: poi.sameAs } : {}),
    }));
  }
  // `containsPlace` aggregates two distinct sub-types: editorial
  // `HotelRoom` sub-pages and `MeetingRoom` MICE spaces. Schema.org
  // exposes a single property; consumers discriminate on the inner
  // `@type`. We build the merged array once at the end so both feeds
  // share the cap budget and the emission order is stable
  // (rooms first, then meeting rooms — mirrors the visible page
  // order: rooms section → MICE section).
  const containedPlaces: ContainedPlaceNode[] = [];
  if (input.containedRooms !== undefined && input.containedRooms.length > 0) {
    // Cap at 20 — editorial pipelines typically curate 3-5 room
    // categories per hotel; the cap is a defensive ceiling, not a hot
    // path.
    for (const room of input.containedRooms.slice(0, 20)) {
      containedPlaces.push({
        '@type': 'HotelRoom',
        name: room.name,
        url: room.url,
      });
    }
  }
  if (input.eventSpaces !== undefined && input.eventSpaces.length > 0) {
    for (const space of input.eventSpaces.slice(0, 30)) {
      // Defensive numeric guards. The reader (`readMiceInfo`)
      // already Zod-validates positives, but the builder accepts
      // raw inputs from other callers too (tests, future seeds).
      if (!Number.isFinite(space.surfaceSqm) || space.surfaceSqm <= 0) continue;
      if (!Number.isFinite(space.maxSeated) || space.maxSeated <= 0) continue;
      const trimmedName = space.name.trim();
      if (trimmedName.length === 0) continue;
      const node: MeetingRoomNode = {
        '@type': 'MeetingRoom',
        name: trimmedName,
        floorSize: {
          '@type': 'QuantitativeValue',
          value: space.surfaceSqm,
          unitCode: 'MTK',
        },
        maximumAttendeeCapacity: space.maxSeated,
      };
      if (space.description !== undefined) {
        const trimmedDescription = space.description.trim();
        if (trimmedDescription.length > 0) {
          node.description = trimmedDescription;
        }
      }
      containedPlaces.push(node);
    }
  }
  if (containedPlaces.length > 0) {
    out.containsPlace = containedPlaces;
  }
  if (input.featuredReviews !== undefined && input.featuredReviews.length > 0) {
    // Cap at 5 to mirror Google's documented Hotel rich-result envelope
    // (https://developers.google.com/search/docs/appearance/structured-data/hotel).
    // Editorial workflows that exceed 5 entries should curate down before
    // publication; this is a defensive emission cap, not a hard limit.
    out.review = input.featuredReviews.slice(0, 5).map((review) => ({
      '@type': 'Review',
      reviewBody: review.quote,
      author: {
        '@type': 'Organization',
        name:
          review.author !== undefined && review.author.length > 0 ? review.author : review.source,
      },
      publisher: {
        '@type': 'Organization',
        name: review.source,
      },
      ...(review.sourceUrl !== undefined && review.sourceUrl.length > 0
        ? { url: review.sourceUrl }
        : {}),
      ...(review.date !== undefined && review.date.length > 0
        ? { datePublished: review.date }
        : {}),
      ...(review.rating !== undefined && review.maxRating !== undefined
        ? {
            reviewRating: {
              '@type': 'Rating',
              ratingValue: review.rating,
              bestRating: review.maxRating,
              worstRating: 0,
            },
          }
        : {}),
    }));
  }

  return out;
};
