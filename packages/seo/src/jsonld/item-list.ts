import type { ItemList, ListItem } from 'schema-dts';

import { type AggregateRatingInput } from './aggregate-rating';
import { hotelJsonLd } from './hotel';

export type ItemListNode = Exclude<ItemList, string>;
type ListItemNode = Exclude<ListItem, string>;

/**
 * Optional Hotel payload embedded inside a `ListItem`. When provided,
 * the list switches from a "navigational" shape (just url + name) to a
 * "rich" shape (`item: { @type: 'Hotel', ... }`). Google then surfaces
 * the per-hotel rating in carousel rich-results for the hub page.
 *
 * Keep this union narrow on purpose — anything richer (offers, geo,
 * etc.) belongs on the dedicated `hotelJsonLd` builder used by the
 * detail page.
 */
export interface ItemListHotelDetails {
  readonly starRating?: 1 | 2 | 3 | 4 | 5;
  readonly aggregateRating?: AggregateRatingInput;
}

export interface ItemListEntry {
  readonly name: string;
  readonly url: string;
  /** When set, the entry becomes a nested `Hotel` ListItem with richer signals. */
  readonly hotel?: ItemListHotelDetails;
}

export interface ItemListInput {
  readonly name?: string;
  readonly items: ReadonlyArray<ItemListEntry>;
}

/**
 * ItemList JSON-LD (skill: structured-data-schema-org).
 * Used for `/selection/*`, hub regional pages, etc.
 */
export const itemListJsonLd = (input: ItemListInput): ItemListNode => {
  const out: ItemListNode = {
    '@type': 'ItemList',
    numberOfItems: input.items.length,
    itemListElement: input.items.map((item, index) => buildListItem(item, index)),
  };
  if (input.name !== undefined) {
    out.name = input.name;
  }
  return out;
};

function buildListItem(entry: ItemListEntry, index: number): ListItemNode {
  if (entry.hotel === undefined) {
    return {
      '@type': 'ListItem',
      position: index + 1,
      url: entry.url,
      name: entry.name,
    };
  }

  // Schema.org best practice: when a list item carries rich data, nest
  // it under `item` rather than flattening at the ListItem root. This
  // is what Google parses for the rich-result carousel. We reuse the
  // canonical `hotelJsonLd` builder so the nested shape stays in lock-
  // step with the detail page's JSON-LD (skill: structured-data-schema-org).
  return {
    '@type': 'ListItem',
    position: index + 1,
    item: hotelJsonLd({
      name: entry.name,
      url: entry.url,
      ...(entry.hotel.starRating !== undefined ? { starRating: entry.hotel.starRating } : {}),
      ...(entry.hotel.aggregateRating !== undefined
        ? { aggregateRating: entry.hotel.aggregateRating }
        : {}),
    }),
  };
}
