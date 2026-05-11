import type { HotelRoom } from 'schema-dts';

/** HotelRoom without the bare-IRI string union from schema-dts. */
export type HotelRoomNode = Exclude<HotelRoom, string>;

export interface HotelRoomBedInput {
  /** Free-text label (e.g. "King size", "Twin", "Queen + sofa bed"). */
  readonly typeLabel: string;
  /** Number of beds of this type, default 1. */
  readonly numberOfBeds?: number;
}

export interface HotelRoomJsonLdInput {
  readonly name: string;
  readonly url: string;
  readonly description?: string;
  /** Floor area in square metres. */
  readonly floorSizeSqm?: number;
  /** Total occupants supported (adults + children). */
  readonly maxOccupancy?: number;
  readonly bed?: HotelRoomBedInput;
  /** Optional absolute Cloudinary URLs for the room hero/gallery. */
  readonly images?: readonly string[];
  /** Free-text amenity labels — e.g. "Marble bathroom", "Eiffel Tower view". */
  readonly amenityFeatures?: readonly string[];
  /**
   * Parent `Hotel` URL — used to materialize the `containedInPlace`
   * pointer back to the hotel detail page, which strengthens Google's
   * understanding of the room→hotel relationship for rich results.
   */
  readonly containedInHotelUrl?: string;
}

/**
 * `HotelRoom` JSON-LD (skill: structured-data-schema-org).
 *
 * Surface this on each `/hotel/{hotel}/chambres/{room-slug}` sub-page so
 * Google can index rooms independently for queries like
 * "suite tour eiffel paris" (CDC §2 bloc 6 — Phase 10.1).
 *
 * The `floorSize` value is wrapped in a `QuantitativeValue` with the
 * Schema.org-recommended `MTK` (square metres) unit code. `occupancy` is
 * also a `QuantitativeValue` so Google can parse it as a number.
 */
export const hotelRoomJsonLd = (input: HotelRoomJsonLdInput): HotelRoomNode => {
  const out: HotelRoomNode = {
    '@type': 'HotelRoom',
    name: input.name,
    url: input.url,
  };

  if (input.description !== undefined) {
    out.description = input.description;
  }
  if (input.floorSizeSqm !== undefined) {
    out.floorSize = {
      '@type': 'QuantitativeValue',
      value: input.floorSizeSqm,
      // Schema.org recommends UN/CEFACT codes; MTK = square metre.
      unitCode: 'MTK',
    };
  }
  if (input.maxOccupancy !== undefined) {
    out.occupancy = {
      '@type': 'QuantitativeValue',
      maxValue: input.maxOccupancy,
    };
  }
  if (input.bed !== undefined) {
    out.bed = {
      '@type': 'BedDetails',
      typeOfBed: input.bed.typeLabel,
      ...(input.bed.numberOfBeds !== undefined ? { numberOfBeds: input.bed.numberOfBeds } : {}),
    };
  }
  if (input.images !== undefined && input.images.length > 0) {
    out.image = [...input.images];
  }
  if (input.amenityFeatures !== undefined && input.amenityFeatures.length > 0) {
    out.amenityFeature = input.amenityFeatures.map((name) => ({
      '@type': 'LocationFeatureSpecification',
      name,
      value: true,
    }));
  }
  if (input.containedInHotelUrl !== undefined) {
    out.containedInPlace = {
      '@type': 'Hotel',
      url: input.containedInHotelUrl,
    };
  }
  return out;
};
