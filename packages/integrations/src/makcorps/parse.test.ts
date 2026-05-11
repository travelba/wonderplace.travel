import { describe, expect, it } from 'vitest';

import { parseMakcorpsResponse } from './parse.js';

describe('parseMakcorpsResponse', () => {
  it('handles the flat vendor1/price1 shape', () => {
    const out = parseMakcorpsResponse({
      comparison: [
        {
          vendor1: 'Booking.com',
          price1: '120.00',
          vendor2: 'Expedia',
          price2: '115.00',
        },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out).toContainEqual({ provider: 'booking_com', price: 120 });
    expect(out).toContainEqual({ provider: 'expedia', price: 115 });
  });

  it('handles the nested vendor.name/price shape and dedups across nesting', () => {
    const out = parseMakcorpsResponse({
      comparison: [
        { vendor: { name: 'Booking.com', price: '99.99' } },
        { vendor: { name: 'Hotels.com', price: 110 } },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out).toContainEqual({ provider: 'booking_com', price: 99.99 });
    expect(out).toContainEqual({ provider: 'hotels_com', price: 110 });
  });

  it('tolerates currency suffix / comma decimal / arbitrary nesting', () => {
    const out = parseMakcorpsResponse({
      data: {
        rooms: [
          { name: 'Official Site', price: 'EUR 89,50' },
          { name: 'Expedia', price: '105.00 EUR' },
        ],
      },
    });
    expect(out).toHaveLength(2);
    expect(out).toContainEqual({ provider: 'official_site', price: 89.5 });
    expect(out).toContainEqual({ provider: 'expedia', price: 105 });
  });

  it('keeps the cheapest when the same provider is duplicated', () => {
    const out = parseMakcorpsResponse({
      comparison: [
        { vendor1: 'Booking.com', price1: '150.00' },
        { vendor1: 'Booking.com', price1: '120.00' },
      ],
    });
    expect(out).toEqual([{ provider: 'booking_com', price: 120 }]);
  });

  it('drops vendors not in the allow-list (e.g. Agoda)', () => {
    const out = parseMakcorpsResponse({
      comparison: [{ vendor1: 'Agoda', price1: '90.00' }],
    });
    expect(out).toEqual([]);
  });

  it('returns [] on completely malformed input', () => {
    expect(parseMakcorpsResponse(null)).toEqual([]);
    expect(parseMakcorpsResponse('garbage')).toEqual([]);
    expect(parseMakcorpsResponse({ foo: 'bar' })).toEqual([]);
  });
});
