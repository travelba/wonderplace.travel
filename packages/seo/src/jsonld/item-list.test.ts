import { describe, expect, it } from 'vitest';

import { itemListJsonLd } from './item-list';

describe('itemListJsonLd', () => {
  it('numbers entries from 1 and preserves URLs', () => {
    const node = itemListJsonLd({
      name: 'Sélection',
      items: [
        { name: 'Hôtel A', url: 'https://example.com/a' },
        { name: 'Hôtel B', url: 'https://example.com/b' },
      ],
    });
    expect(node.numberOfItems).toBe(2);
    expect(node.name).toBe('Sélection');
    const items = node.itemListElement;
    expect(items).toHaveLength(2);
    expect(items?.[0]).toMatchObject({
      position: 1,
      url: 'https://example.com/a',
      name: 'Hôtel A',
    });
    expect(items?.[1]).toMatchObject({ position: 2, url: 'https://example.com/b' });
  });

  it('upgrades to a nested Hotel item when `hotel.aggregateRating` is provided', () => {
    const node = itemListJsonLd({
      name: 'Paris',
      items: [
        {
          name: 'Hôtel C',
          url: 'https://example.com/c',
          hotel: {
            starRating: 5,
            aggregateRating: { ratingValue: 4.5, reviewCount: 213 },
          },
        },
      ],
    });
    const li = node.itemListElement?.[0];
    expect(li).toMatchObject({ '@type': 'ListItem', position: 1 });
    // The richer ListItem nests the Hotel under `item` (Google's
    // rich-result requirement for hub carousels) rather than flattening.
    expect(li).toHaveProperty('item');
    const hotel = (li as { item: Record<string, unknown> }).item;
    expect(hotel).toMatchObject({
      '@type': 'Hotel',
      name: 'Hôtel C',
      url: 'https://example.com/c',
      starRating: { '@type': 'Rating', ratingValue: 5 },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: 4.5,
        reviewCount: 213,
        bestRating: 5,
      },
    });
  });

  it('keeps the simple shape when no `hotel` payload is provided (mixed list)', () => {
    const node = itemListJsonLd({
      items: [
        { name: 'A', url: 'https://example.com/a' },
        {
          name: 'B',
          url: 'https://example.com/b',
          hotel: { aggregateRating: { ratingValue: 4, reviewCount: 5 } },
        },
      ],
    });
    expect(node.itemListElement?.[0]).not.toHaveProperty('item');
    expect(node.itemListElement?.[1]).toHaveProperty('item');
  });
});
