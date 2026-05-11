import { describe, expect, it } from 'vitest';

import { parseGuest } from './guest';

const validRaw = {
  firstName: '  Jean ',
  lastName: 'Dupont',
  email: 'Jean.Dupont@Example.COM ',
  phone: '+33 6 12 34 56 78',
  nationality: 'FR',
  specialRequests: '  Late check-in  ',
};

describe('parseGuest', () => {
  it('normalises whitespace and lowercases the email', () => {
    const r = parseGuest(validRaw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.firstName).toBe('Jean');
      expect(r.value.email).toBe('jean.dupont@example.com');
      expect(r.value.specialRequests).toBe('Late check-in');
    }
  });

  it('rejects invalid email with guest_validation error pointing at email', () => {
    const r = parseGuest({ ...validRaw, email: 'not-an-email' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('guest_validation');
      if (r.error.kind === 'guest_validation') expect(r.error.field).toBe('email');
    }
  });

  it('rejects lowercase nationality codes', () => {
    const r = parseGuest({ ...validRaw, nationality: 'fr' });
    expect(r.ok).toBe(false);
  });

  it('omits optional fields when missing rather than emitting `undefined`', () => {
    const raw = { firstName: 'A', lastName: 'B', email: 'a@b.com', phone: '0102030405' };
    const r = parseGuest(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect('nationality' in r.value).toBe(false);
      expect('specialRequests' in r.value).toBe(false);
    }
  });
});
