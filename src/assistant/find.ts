/**
 * The deal someone means when they name a place or a thing out loud.
 */

import { db } from '../data';
import type { DealCardModel, LatLng } from '../data/types';
import { withinWindow } from '../domain/rules';
import { availabilityLabel, timeLabel } from '../lib/format';
import { istClock, windowState } from '../lib/hours';
import { parseQuery } from '../search/parser';
import { sameBusiness } from './history';

export const takesBookings = (d: DealCardModel) =>
  d.primary_cta === 'book' || d.primary_cta === 'reserve' || d.booking_required;

/** Can be taken this minute: booked for a later slot, or claimed inside its days and hours. */
export const orderableNow = (d: DealCardModel, at: Date = new Date()) => takesBookings(d) || withinWindow(d, at);

/** When a deal that is not on now is next on: "From 12:30 PM today", else its days and hours. */
export function nextOnLabel(d: DealCardModel, at: number = Date.now()): string {
  const { days, start_time: from, end_time: to } = d.availability;
  const today = days.length === 0 || days.includes(istClock(at).dow);
  if (today && windowState(from, to, at) === 'before') return 'From ' + timeLabel(from) + ' today';
  return 'On ' + availabilityLabel(d.availability);
}

/** The deal meant: at the named place if one was said, a bookable one when booking. */
export async function findDeal(
  business: string | null,
  what: string | null,
  origin: LatLng,
  wantBooking: boolean,
): Promise<DealCardModel | null> {
  const q = [business, what].filter(Boolean).join(' ').trim();
  if (!q) return null;
  // Across the city: a place someone names may be further than the usual radius.
  const filters = { ...parseQuery(q).filters, radius_km: 30 };
  const { deals } = await db.searchDeals({ q, filters, origin, limit: 40 });
  const atPlace = business ? deals.filter((d) => sameBusiness(business, d.business.name)) : deals;
  const pool = atPlace.length > 0 ? atPlace : business ? [] : deals;
  return (wantBooking ? pool.find(takesBookings) : null) ?? pool[0] ?? null;
}
