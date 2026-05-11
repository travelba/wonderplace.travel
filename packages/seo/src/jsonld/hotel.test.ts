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

  it('exposes multiple awards as an array (Palace + editorial recognitions)', () => {
    const node = hotelJsonLd({
      name: 'Le Palace',
      url: 'https://example.com/p',
      isPalace: true,
      awards: ['Forbes Travel Guide 5 Stars — 2024', 'World Travel Awards — 2023'],
    });
    expect(Array.isArray(node.award)).toBe(true);
    if (Array.isArray(node.award)) {
      expect(node.award).toHaveLength(3);
      expect(node.award[0]).toContain('Palace');
      expect(node.award).toContain('Forbes Travel Guide 5 Stars — 2024');
    }
  });

  it('omits award when no Palace and empty awards array', () => {
    const node = hotelJsonLd({
      name: 'Hôtel Standard',
      url: 'https://example.com/s',
      awards: [],
    });
    expect(node.award).toBeUndefined();
  });

  it('emits starRating with bestRating: 5 when starRating is provided', () => {
    const node = hotelJsonLd({
      name: 'Hôtel D',
      url: 'https://example.com/d',
      starRating: 4,
    });
    expect(node.starRating).toMatchObject({
      '@type': 'Rating',
      ratingValue: 4,
      bestRating: 5,
    });
  });

  it('emits numberOfRooms, checkinTime, checkoutTime and petsAllowed when provided', () => {
    const node = hotelJsonLd({
      name: 'Le Peninsula',
      url: 'https://example.com/p',
      numberOfRooms: 200,
      checkinTime: '15:00',
      checkoutTime: '12:00',
      petsAllowed: true,
    });
    expect(node.numberOfRooms).toBe(200);
    expect(node.checkinTime).toBe('15:00');
    expect(node.checkoutTime).toBe('12:00');
    expect(node.petsAllowed).toBe(true);
  });

  it('omits numberOfRooms when 0 (treated as unknown)', () => {
    const node = hotelJsonLd({
      name: 'Hôtel Inconnu',
      url: 'https://example.com/x',
      numberOfRooms: 0,
    });
    expect(node.numberOfRooms).toBeUndefined();
  });

  it('emits petsAllowed: false explicitly when refused (not omitted)', () => {
    const node = hotelJsonLd({
      name: 'Hôtel No Pets',
      url: 'https://example.com/np',
      petsAllowed: false,
    });
    expect(node.petsAllowed).toBe(false);
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

  it('emits featuredReviews as Schema.org Review[] with author + publisher Organisations', () => {
    const node = hotelJsonLd({
      name: 'Le Peninsula',
      url: 'https://example.com/p',
      featuredReviews: [
        {
          source: 'Forbes Travel Guide',
          sourceUrl: 'https://www.forbestravelguide.com/the-peninsula-paris',
          author: 'Forbes Travel Guide editorial',
          quote: 'The palace combines Belle Époque heritage with modern innovation.',
          rating: 5,
          maxRating: 5,
          date: '2025-01-15',
        },
        {
          source: 'Condé Nast Traveler',
          quote: 'Among the finest stays in Paris.',
        },
      ],
    });
    expect(Array.isArray(node.review)).toBe(true);
    if (Array.isArray(node.review)) {
      expect(node.review).toHaveLength(2);
      const first = node.review[0] as Record<string, unknown>;
      expect(first['@type']).toBe('Review');
      expect(first.reviewBody).toContain('Belle Époque');
      expect(first.author).toMatchObject({
        '@type': 'Organization',
        name: 'Forbes Travel Guide editorial',
      });
      expect(first.publisher).toMatchObject({
        '@type': 'Organization',
        name: 'Forbes Travel Guide',
      });
      expect(first.datePublished).toBe('2025-01-15');
      expect(first.url).toBe('https://www.forbestravelguide.com/the-peninsula-paris');
      expect(first.reviewRating).toMatchObject({
        '@type': 'Rating',
        ratingValue: 5,
        bestRating: 5,
        worstRating: 0,
      });

      const second = node.review[1] as Record<string, unknown>;
      // Author falls back to the publisher source when no author is supplied.
      expect(second.author).toMatchObject({ name: 'Condé Nast Traveler' });
      expect(second.reviewRating).toBeUndefined();
      expect(second.url).toBeUndefined();
    }
  });

  it('caps featuredReviews to 5 entries (Google Hotel rich-result envelope)', () => {
    const reviews = Array.from({ length: 8 }, (_, i) => ({
      source: `Publication ${i + 1}`,
      quote: `Quote ${i + 1}.`,
    }));
    const node = hotelJsonLd({
      name: 'Le Peninsula',
      url: 'https://example.com/p',
      featuredReviews: reviews,
    });
    expect(Array.isArray(node.review)).toBe(true);
    if (Array.isArray(node.review)) {
      expect(node.review).toHaveLength(5);
    }
  });

  it('omits review when featuredReviews is empty', () => {
    const node = hotelJsonLd({
      name: 'Hôtel Sans Avis',
      url: 'https://example.com/sa',
      featuredReviews: [],
    });
    expect(node.review).toBeUndefined();
  });

  it('emits dateModified when provided (freshness signal)', () => {
    const node = hotelJsonLd({
      name: 'Le Peninsula',
      url: 'https://example.com/p',
      dateModified: '2026-05-11T20:14:00Z',
    });
    expect(node.dateModified).toBe('2026-05-11T20:14:00Z');
  });

  it('omits dateModified when empty string', () => {
    const node = hotelJsonLd({
      name: 'Hôtel',
      url: 'https://example.com/h',
      dateModified: '',
    });
    expect(node.dateModified).toBeUndefined();
  });

  it('emits nearbyAttractions as TouristAttraction-flavoured Place array', () => {
    const node = hotelJsonLd({
      name: 'Le Peninsula',
      url: 'https://example.com/p',
      nearbyAttractions: [
        {
          name: 'Arc de Triomphe',
          type: 'monument',
          latitude: 48.8738,
          longitude: 2.295,
          sameAs: 'https://www.wikidata.org/wiki/Q22692',
        },
        { name: 'Musée du Louvre', type: 'museum' },
        { name: 'Avenue des Champs-Élysées', type: 'shopping' },
        { name: 'Some Beach', type: 'unknown-type-value' },
      ],
    });
    expect(Array.isArray(node.nearbyAttractions)).toBe(true);
    if (Array.isArray(node.nearbyAttractions)) {
      expect(node.nearbyAttractions).toHaveLength(4);
      expect(node.nearbyAttractions[0]).toMatchObject({
        '@type': 'LandmarksOrHistoricalBuildings',
        name: 'Arc de Triomphe',
        geo: { '@type': 'GeoCoordinates', latitude: 48.8738, longitude: 2.295 },
        sameAs: 'https://www.wikidata.org/wiki/Q22692',
      });
      expect(node.nearbyAttractions[1]).toMatchObject({
        '@type': 'Museum',
        name: 'Musée du Louvre',
      });
      // Museum without coords must not emit a geo node.
      expect(node.nearbyAttractions[1]).not.toHaveProperty('geo');
      expect(node.nearbyAttractions[2]).toMatchObject({ '@type': 'ShoppingCenter' });
      // Unknown type → default to TouristAttraction.
      expect(node.nearbyAttractions[3]).toMatchObject({ '@type': 'TouristAttraction' });
    }
  });

  it('caps nearbyAttractions to 10 entries', () => {
    const pois = Array.from({ length: 14 }, (_, i) => ({
      name: `POI ${i + 1}`,
      type: 'monument',
    }));
    const node = hotelJsonLd({
      name: 'Le Peninsula',
      url: 'https://example.com/p',
      nearbyAttractions: pois,
    });
    if (Array.isArray(node.nearbyAttractions)) {
      expect(node.nearbyAttractions).toHaveLength(10);
    }
  });

  it('omits nearbyAttractions when empty', () => {
    const node = hotelJsonLd({
      name: 'Hôtel Isolé',
      url: 'https://example.com/iso',
      nearbyAttractions: [],
    });
    expect(node.nearbyAttractions).toBeUndefined();
  });
});
