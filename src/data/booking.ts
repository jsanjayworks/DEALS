/**
 * Time-slot bookings: tables, chairs, bays. A deal can cap how many bookings
 * one time slot takes ("6 tables at 8 PM"), on top of its overall capacity.
 * The cap lives in the deal's attributes, so it needs no column of its own;
 * the database enforces it when a booking is saved (0014_slot_capacity.sql),
 * and the demo data does the same.
 */

import type { AttributeValue } from './types';

/** Bookings that hold a slot: everything but cancelled and expired ones. */
export const SLOT_HOLDING = ['pending', 'confirmed', 'redeemed'] as const;

/** The most bookings one time slot takes, or null for no per-slot limit. */
export function slotCapacity(attributes: Record<string, AttributeValue> | null | undefined): number | null {
  const v = attributes?.slot_capacity;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Same instant whatever the text looks like ("…Z" from the app, "+00:00" from Postgres). */
export function slotKey(iso: string): number {
  return new Date(iso).getTime();
}
