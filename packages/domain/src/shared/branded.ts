/**
 * Branded primitive types — preventing accidental mixing of IDs/slugs.
 * Construction goes through validating factories that return Result.
 */
import { z } from 'zod';
import { type Result, err, ok } from './result';
import { validationError, type DomainError } from './errors';

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type HotelId = Brand<string, 'HotelId'>;
export type HotelRoomId = Brand<string, 'HotelRoomId'>;
export type BookingRef = Brand<string, 'BookingRef'>;
export type AmadeusOfferId = Brand<string, 'AmadeusOfferId'>;
export type AmadeusOrderId = Brand<string, 'AmadeusOrderId'>;
export type LittleBookingId = Brand<string, 'LittleBookingId'>;
export type EditorialSlug = Brand<string, 'EditorialSlug'>;
export type HotelSlug = Brand<string, 'HotelSlug'>;
export type UserId = Brand<string, 'UserId'>;
export type PaymentRef = Brand<string, 'PaymentRef'>;

const uuidZ = z.string().uuid();

const slugZ = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase kebab-case, alphanumeric and hyphens only');

const bookingRefZ = z.string().regex(/^CT-\d{8}-[A-Z0-9]{5}$/, 'pattern: CT-YYYYMMDD-XXXXX');

export const HotelId = (raw: string): Result<HotelId, DomainError> =>
  uuidZ.safeParse(raw).success
    ? ok(raw as HotelId)
    : err(validationError('hotel_id', 'expected uuid'));

export const HotelRoomId = (raw: string): Result<HotelRoomId, DomainError> =>
  uuidZ.safeParse(raw).success
    ? ok(raw as HotelRoomId)
    : err(validationError('hotel_room_id', 'expected uuid'));

export const UserId = (raw: string): Result<UserId, DomainError> =>
  uuidZ.safeParse(raw).success
    ? ok(raw as UserId)
    : err(validationError('user_id', 'expected uuid'));

export const HotelSlug = (raw: string): Result<HotelSlug, DomainError> =>
  slugZ.safeParse(raw).success
    ? ok(raw as HotelSlug)
    : err(validationError('hotel_slug', 'invalid slug'));

export const EditorialSlug = (raw: string): Result<EditorialSlug, DomainError> =>
  slugZ.safeParse(raw).success
    ? ok(raw as EditorialSlug)
    : err(validationError('editorial_slug', 'invalid slug'));

export const BookingRef = (raw: string): Result<BookingRef, DomainError> =>
  bookingRefZ.safeParse(raw).success
    ? ok(raw as BookingRef)
    : err(validationError('booking_ref', 'expected CT-YYYYMMDD-XXXXX'));

export const AmadeusOfferId = (raw: string): AmadeusOfferId => raw as AmadeusOfferId;
export const AmadeusOrderId = (raw: string): AmadeusOrderId => raw as AmadeusOrderId;
export const LittleBookingId = (raw: string): LittleBookingId => raw as LittleBookingId;
export const PaymentRef = (raw: string): PaymentRef => raw as PaymentRef;
