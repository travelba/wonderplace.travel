import { describe, expect, it } from 'vitest';

import { hotelJsonLd } from './hotel';

describe('hotelJsonLd', () => {
  it('emits minimal Hotel with name + url', () => {
    const node = hotelJsonLd({ name: 'Hôtel A', url: 'https://example.com/a' });
    expect(node['@type']).toBe('Hotel');
    expect(node.name).toBe('Hôtel A');
    expect(node.url).toBe('https://example.com/a');
  });

  it('adds Palace award without faking starRating', () => {
    const node = hotelJsonLd({
      name: 'Le Palace',
      url: 'https://example.com/p',
      starRating: 5,
      isPalace: true,
    });
    expect(node.award).toContain('Palace');
    expect(node.starRating).toMatchObject({ '@type': 'Rating', ratingValue: 5 });
  });

  it('includes address with default FR country', () => {
    const node = hotelJsonLd({
      name: 'Hôtel B',
      url: 'https://example.com/b',
      address: {
        streetAddress: '12 rue X',
        addressLocality: 'Paris',
        postalCode: '75008',
      },
    });
    expect(node.address).toMatchObject({
      streetAddress: '12 rue X',
      addressLocality: 'Paris',
      postalCode: '75008',
      addressCountry: 'FR',
    });
  });

  it('emits offer + aggregateRating only when provided', () => {
    const node = hotelJsonLd({
      name: 'Hôtel C',
      url: 'https://example.com/c',
      aggregateRating: { ratingValue: 4.7, reviewCount: 213 },
      offer: { priceFromEUR: 1234.5678, url: 'https://example.com/c?from=now' },
    });
    expect(node.aggregateRating).toMatchObject({ ratingValue: 4.7, reviewCount: 213 });
    expect(node.makesOffer).toMatchObject({
      price: 1234.57,
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
    });
  });
});
