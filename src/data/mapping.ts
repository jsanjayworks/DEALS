/**
 * The mapping layer.
 *
 * Postgres hands back the flat `deal_card` composite defined in
 * 0002_functions.sql: snake_case, lat/lng as separate columns, child rows
 * pre-flattened by the deal_card_base view. The UI wants the nested
 * DealCardModel from types.ts.
 *
 * Everything that translates between those two worlds lives here, so there is
 * exactly one place to change when a column is added — and the local adapter
 * can produce the same rows without a database.
 */

import { businessById, categoryById, localityById } from './seed-reference';
import type {
  CtaType,
  CustomerAction,
  Deal,
  DealCardModel,
  DealStatus,
  LatLng,
  OfferingKind,
} from './types';
import type { DealDraftInput } from './api';

/** Exactly the columns of the SQL `deal_card` composite type, in order. */
export interface DealCardRow {
  id: string;
  business_id: string;
  category_id: string;
  deal_type_code: string;
  offering_kind: OfferingKind;
  title: string;
  short_description: string | null;
  description: string | null;
  status: DealStatus;
  original_price: string | number | null;
  deal_price: string | number | null;
  discount_pct: string | number | null;
  currency: string;
  price_unit: string | null;
  taxes_note: string | null;
  min_purchase: string | number | null;
  max_qty_per_customer: number | null;
  starts_at: string | null;
  ends_at: string | null;
  capacity_total: number | null;
  capacity_remaining: number | null;
  booking_required: boolean;
  cancellation_policy: string | null;
  terms: string | null;
  attributes: Record<string, string | number | boolean> | null;
  tags: string[] | null;
  lat: number | null;
  lng: number | null;
  published_at: string | null;
  rating_avg: string | number | null;
  rating_count: number | null;
  view_count: number | null;
  search_count: number | null;
  business_name: string;
  business_phone: string | null;
  is_verified: boolean;
  category_slug: string;
  category_name: string;
  vertical: string;
  category_icon: string | null;
  address_line: string | null;
  locality_name: string | null;
  image_url: string | null;
  primary_cta: CtaType;
  secondary_ctas: CtaType[] | null;
  availability_days: number[] | null;
  availability_start: string | null;
  availability_end: string | null;
  min_age: number | null;
  min_spend: string | number | null;
  distance_km: number | null;
  ending_soon: boolean;
  score: number | null;
  audience: string | null;
  membership_required: boolean | null;
  advance_booking_hours: number | null;
  custom_rule: string | null;
  rejection_reason: string | null;
  created_at: string | null;
  business_rating: string | number | null;
  business_rating_count: number | null;
}

/**
 * Postgres returns numeric as a string so precision is not silently lost in
 * JSON. Prices and ratings must be numbers before any arithmetic or
 * formatting, so every numeric column goes through here.
 */
export function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function num0(v: string | number | null | undefined): number {
  return num(v) ?? 0;
}

/** "09:00:00" from Postgres, "09:00" from the seed — normalise to "HH:MM". */
export function hhmm(t: string | null | undefined): string {
  if (!t) return '00:00';
  const parts = t.split(':');
  return parts[0].padStart(2, '0') + ':' + (parts[1] ?? '00').padStart(2, '0');
}

/** SQL deal_card row -> the model every screen consumes. */
export function rowToDealCard(r: DealCardRow): DealCardModel {
  return {
    id: r.id,
    business_id: r.business_id,
    category_id: r.category_id,
    deal_type_code: r.deal_type_code as DealCardModel['deal_type_code'],
    offering_kind: r.offering_kind,
    title: r.title,
    short_description: r.short_description ?? '',
    description: r.description ?? r.short_description ?? '',
    status: r.status,
    original_price: num(r.original_price),
    deal_price: num(r.deal_price),
    discount_pct: num(r.discount_pct),
    price_unit: r.price_unit,
    taxes_note: r.taxes_note,
    min_purchase: num(r.min_purchase),
    max_qty_per_customer: r.max_qty_per_customer,
    starts_at: r.starts_at ?? new Date().toISOString(),
    ends_at: r.ends_at ?? new Date().toISOString(),
    capacity_total: r.capacity_total,
    capacity_remaining: r.capacity_remaining,
    booking_required: r.booking_required,
    cancellation_policy: r.cancellation_policy,
    terms: r.terms,
    attributes: r.attributes ?? {},
    tags: r.tags ?? [],
    location: { lat: r.lat ?? 0, lng: r.lng ?? 0 },
    image: r.image_url ?? '',
    primary_cta: r.primary_cta,
    secondary_ctas: r.secondary_ctas ?? [],
    availability: {
      days: r.availability_days ?? [],
      start_time: hhmm(r.availability_start),
      end_time: hhmm(r.availability_end),
    },
    eligibility: {
      audience: (r.audience ?? 'everyone') as DealCardModel['eligibility']['audience'],
      min_age: r.min_age,
      min_spend: num(r.min_spend),
      membership_required: r.membership_required ?? false,
      advance_booking_hours: r.advance_booking_hours,
      custom_rule: r.custom_rule,
    },
    rejection_reason: r.rejection_reason,
    published_at: r.published_at,
    rating_avg: num0(r.rating_avg),
    rating_count: r.rating_count ?? 0,
    created_at: r.created_at ?? r.published_at ?? new Date().toISOString(),
    views: r.view_count ?? 0,
    searches: r.search_count ?? 0,

    // joined / computed
    business: {
      id: r.business_id,
      name: r.business_name,
      phone: r.business_phone ?? '',
      email: '',
      primary_category_id: r.category_id,
      verification_status: r.is_verified ? 'verified' : 'unverified',
      rating_avg: num0(r.business_rating ?? r.rating_avg),
      rating_count: r.business_rating_count ?? r.rating_count ?? 0,
      locality_id: '',
      address_line: r.address_line ?? '',
      location: { lat: r.lat ?? 0, lng: r.lng ?? 0 },
    },
    category: {
      id: r.category_id,
      slug: r.category_slug,
      name: r.category_name,
      vertical: r.vertical as DealCardModel['category']['vertical'],
      icon: r.category_icon ?? 'pricetag-outline',
      parent_id: null,
    },
    locality_name: r.locality_name ?? '',
    distance_km: r.distance_km ?? 0,
    is_verified: r.is_verified,
    ending_soon: r.ending_soon,
  };
}

/**
 * The local adapter's equivalent of the deal_card_base view: joins a seed Deal
 * to its business, category and locality and computes distance. Keeping this
 * next to rowToDealCard is deliberate — when one gains a field, the diff makes
 * the other obvious.
 */
export function dealToCard(deal: Deal, origin: LatLng | null): DealCardModel {
  const business = businessById(deal.business_id);
  const category = categoryById(deal.category_id);
  const locality = localityById(business.locality_id);
  const endsAt = new Date(deal.ends_at).getTime();

  return {
    ...deal,
    business,
    category,
    locality_name: locality.name,
    distance_km: origin ? haversineKm(origin, deal.location) : 0,
    is_verified: business.verification_status === 'verified',
    ending_soon: endsAt - Date.now() <= 24 * 3600 * 1000,
  };
}

/** Great-circle distance in km. Matches ST_Distance closely enough for cards. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** customer_actions row -> domain. Dates stay ISO strings end to end. */
export function rowToAction(r: Record<string, unknown>): CustomerAction {
  return {
    id: String(r.id),
    deal_id: String(r.deal_id),
    customer_id: String(r.customer_id),
    action_type: r.action_type as CustomerAction['action_type'],
    status: r.status as CustomerAction['status'],
    quantity: Number(r.quantity ?? 1),
    slot_start: (r.slot_start as string | null) ?? null,
    redemption_code: (r.redemption_code as string | null) ?? null,
    payload: (r.payload as Record<string, unknown>) ?? {},
    created_at: String(r.created_at ?? new Date().toISOString()),
  };
}

/**
 * Wizard state -> the jsonb argument save_deal_draft() expects.
 *
 * Two shape changes happen here. The wizard holds availability as one row with
 * a list of weekdays, because that is how the chips read; the database stores
 * one row per weekday. And the CTA step holds a primary plus extras, which
 * becomes the deal_actions list with exactly one is_primary.
 */
export function draftToPayload(input: DealDraftInput): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };

  if (input.availability && input.availability.length > 0) {
    out.availability = input.availability.map((a) => ({
      day_of_week: a.day_of_week,
      start_time: a.start_time,
      end_time: a.end_time,
    }));
  }

  // capacity_remaining is derived on first save, then owned by the database.
  if (input.capacity_total != null && !input.id) {
    out.capacity_remaining = input.capacity_total;
  }

  return out;
}

/**
 * Expands the wizard's "these weekdays, this time window" into the one-row-per-
 * day shape deal_availability stores. An empty day list means every day, which
 * the database represents as a single row with day_of_week null.
 */
export function expandAvailability(
  days: number[],
  startTime: string,
  endTime: string,
): { day_of_week: number | null; start_time: string; end_time: string }[] {
  if (days.length === 0) {
    return [{ day_of_week: null, start_time: startTime, end_time: endTime }];
  }
  return days.map((d) => ({ day_of_week: d, start_time: startTime, end_time: endTime }));
}

/** Collapses deal_availability rows back into the wizard's single-row shape. */
export function collapseAvailability(
  rows: { day_of_week: number | null; start_time: string; end_time: string }[],
): { days: number[]; start_time: string; end_time: string } {
  if (rows.length === 0) return { days: [], start_time: '09:00', end_time: '21:00' };
  const days = rows.map((r) => r.day_of_week).filter((d): d is number => d !== null);
  return {
    days,
    start_time: hhmm(rows[0].start_time),
    end_time: hhmm(rows[0].end_time),
  };
}

/** Builds the deal_actions list from the wizard's CTA step. */
export function ctasToActions(
  primary: CtaType,
  secondary: CtaType[],
): { action_type: string; is_primary: boolean }[] {
  return [
    { action_type: primary, is_primary: true },
    ...secondary.filter((c) => c !== primary).map((c) => ({ action_type: c, is_primary: false })),
  ];
}

/** The customer_action_type a given CTA produces. */
export function ctaToActionType(cta: CtaType): CustomerAction['action_type'] {
  switch (cta) {
    case 'book':
      return 'booking';
    case 'reserve':
      return 'reserve';
    case 'enquire':
      return 'enquiry';
    case 'register':
      return 'registration';
    case 'buy':
      return 'purchase_intent';
    default:
      return 'claim';
  }
}

/** Button label per CTA, matching the design prompt's sticky action bar. */
export function ctaLabel(cta: CtaType): string {
  switch (cta) {
    case 'buy':
      return 'Buy Now';
    case 'book':
      return 'Book Now';
    case 'claim':
      return 'Claim Deal';
    case 'reserve':
      return 'Reserve';
    case 'enquire':
      return 'Enquire';
    case 'register':
      return 'Register';
    case 'visit':
      return 'Visit Store';
    case 'call':
      return 'Call';
    case 'chat':
      return 'Chat';
    case 'directions':
      return 'Directions';
  }
}
