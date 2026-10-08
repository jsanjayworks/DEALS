/**
 * The create-deal wizard as data: the form shape, the seven steps, what each
 * step requires, and the mapping to and from DealDraftInput.
 *
 * Kept free of React so the rules can be read in one place. Inputs are held as
 * strings while being typed and converted once, on save, so "12." mid-typing
 * is not rejected or silently rounded.
 */

import type { DealDraftInput } from '../data/api';
import { CATEGORIES } from '../data/seed-reference';
import { dealParty } from '../data/party';
import { dealVehicleTags } from '../data/vehicles';
import { matchPhoto } from '../data/photo-library';
import { keywordsFrom } from './classify';
import { slotCapacity } from '../data/booking';
import type {
  AttributeValue,
  AudienceKind,
  Category,
  CtaType,
  Deal,
  DealTypeCode,
  OfferingKind,
  Vertical,
} from '../data/types';

export interface WizardForm {
  /** What the merchant typed for "What are you offering?"; the category is read from it. */
  offering: string;
  /** Extra words customers might search for, comma separated. */
  keywords: string;
  vertical: Vertical | null;
  /** A leaf slug, or the vertical's own slug when no subcategory fits. */
  category_slug: string | null;
  deal_type_code: DealTypeCode;
  offering_kind: OfferingKind;

  title: string;
  short_description: string;
  description: string;

  original_price: string;
  deal_price: string;
  price_unit: string | null;
  taxes_note: string;

  starts_at: string;
  ends_at: string;
  /** Empty means every day, as in deal_availability. */
  days: number[];
  start_time: string;
  end_time: string;

  capacity_total: string;
  max_qty_per_customer: string;
  booking_required: boolean;
  advance_booking_hours: string;
  /** Most bookings one time slot takes, e.g. tables at 8 PM; empty for no limit. */
  slot_capacity: string;
  audience: AudienceKind;
  min_age: number | null;
  min_spend: string;
  custom_rule: string;
  cancellation_policy: string;
  terms: string;

  primary_cta: CtaType;
  secondary_ctas: CtaType[];

  /** The deal's photo URL; null uses a library photo matched to the title. */
  photo: string | null;
  /** A group deal's size, smallest and largest party; null for anyone. */
  party: [number, number] | null;
  /** Vehicle tags the deal is for (data/vehicles.ts); empty for none. */
  vehicles: string[];
  /**
   * The deal's other attributes (cuisine, BHK…), kept as they were. The
   * server replaces attributes wholesale, so they are sent back with the
   * group size and vehicles merged in.
   */
  attributes: Record<string, AttributeValue>;
}

/** Group sizes a merchant can pick. */
export const PARTY_CHOICES: readonly { label: string; value: [number, number] | null }[] = [
  { label: 'Anyone', value: null },
  { label: 'For 1', value: [1, 1] },
  { label: 'For 2', value: [2, 2] },
  { label: 'For 3–4', value: [3, 4] },
  { label: 'For 4–6', value: [4, 6] },
  { label: 'For 6–8', value: [6, 8] },
  { label: 'For 8–12', value: [8, 12] },
];

/** Verticals where "which vehicles is it for" makes sense. */
export const VEHICLE_VERTICALS: readonly Vertical[] = ['services', 'mobility', 'retail'];

export const STEPS = [
  { key: 'category', title: 'What are you offering?' },
  { key: 'details', title: 'Describe the deal' },
  { key: 'pricing', title: 'Set the price' },
  { key: 'schedule', title: 'When does it run?' },
  { key: 'rules', title: 'Limits and rules' },
  { key: 'actions', title: 'What should customers do?' },
  { key: 'review', title: 'Review and submit' },
] as const;

export type StepKey = (typeof STEPS)[number]['key'];

export type FieldErrors = Partial<Record<keyof WizardForm, string>>;

const DAY_MS = 86_400_000;

/** Midnight IST today, as an ISO string. Deals start on a day, not a minute. */
export function istDayStart(offsetDays = 0, now: Date = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const midnightUtc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  return new Date(midnightUtc - 330 * 60_000 + offsetDays * DAY_MS).toISOString();
}

export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
}

/** Sensible defaults by vertical, so the first screen is the only required decision. */
const VERTICAL_DEFAULTS: Record<Vertical, { kind: OfferingKind; cta: CtaType; secondary: CtaType[] }> = {
  food: { kind: 'meal', cta: 'claim', secondary: ['call', 'directions'] },
  retail: { kind: 'product', cta: 'claim', secondary: ['directions'] },
  events: { kind: 'event', cta: 'register', secondary: ['directions'] },
  mobility: { kind: 'transport', cta: 'book', secondary: ['call'] },
  property: { kind: 'property', cta: 'enquire', secondary: ['call', 'chat'] },
  services: { kind: 'service', cta: 'book', secondary: ['call'] },
  business: { kind: 'service', cta: 'enquire', secondary: ['call', 'chat'] },
  community: { kind: 'experience', cta: 'register', secondary: ['directions'] },
};

export function defaultsFor(v: Vertical) {
  return VERTICAL_DEFAULTS[v];
}

export function emptyForm(now: Date = new Date()): WizardForm {
  const start = istDayStart(0, now);
  return {
    offering: '',
    keywords: '',
    vertical: null,
    category_slug: null,
    deal_type_code: 'discount',
    offering_kind: 'other',
    title: '',
    short_description: '',
    description: '',
    original_price: '',
    deal_price: '',
    price_unit: null,
    taxes_note: '',
    starts_at: start,
    ends_at: addDays(start, 14),
    days: [],
    start_time: '10:00',
    end_time: '21:00',
    capacity_total: '',
    max_qty_per_customer: '2',
    booking_required: false,
    advance_booking_hours: '',
    slot_capacity: '',
    audience: 'everyone',
    min_age: null,
    min_spend: '',
    custom_rule: '',
    cancellation_policy: '',
    terms: '',
    primary_cta: 'claim',
    secondary_ctas: ['directions'],
    photo: null,
    party: null,
    vehicles: [],
    attributes: {},
  };
}

const str = (n: number | null | undefined) => (n == null ? '' : String(n));

/**
 * Rehydrate the form from a saved draft or a rejected deal. `categories` are
 * the backend's own: on Supabase their ids are uuids, not the seed's.
 */
export function fromDeal(d: Deal, categories: Category[] = CATEGORIES): WizardForm {
  const category = categories.find((c) => c.id === d.category_id);
  return {
    // The title stands in for what they are offering, so step 1 reads as done.
    offering: d.title === 'Untitled deal' ? '' : d.title,
    keywords: (d.tags ?? []).join(', '),
    vertical: category?.vertical ?? null,
    category_slug: category?.slug ?? null,
    deal_type_code: d.deal_type_code,
    offering_kind: d.offering_kind,
    title: d.title === 'Untitled deal' ? '' : d.title,
    short_description: d.short_description,
    description: d.description,
    original_price: str(d.original_price),
    deal_price: str(d.deal_price),
    price_unit: d.price_unit,
    taxes_note: d.taxes_note ?? '',
    starts_at: d.starts_at,
    ends_at: d.ends_at,
    days: d.availability.days,
    start_time: d.availability.start_time.slice(0, 5),
    end_time: d.availability.end_time.slice(0, 5),
    capacity_total: str(d.capacity_total),
    max_qty_per_customer: str(d.max_qty_per_customer),
    booking_required: d.booking_required,
    advance_booking_hours: str(d.eligibility.advance_booking_hours),
    slot_capacity: str(slotCapacity(d.attributes)),
    audience: d.eligibility.audience,
    min_age: d.eligibility.min_age,
    min_spend: str(d.eligibility.min_spend),
    custom_rule: d.eligibility.custom_rule ?? '',
    cancellation_policy: d.cancellation_policy ?? '',
    terms: d.terms ?? '',
    primary_cta: d.primary_cta,
    secondary_ctas: d.secondary_ctas,
    photo: d.image || null,
    party: dealParty(d.attributes),
    vehicles: dealVehicleTags(d.attributes),
    attributes: d.attributes,
  };
}

/** "chicken biryani for 4" → "Chicken biryani for 4", the title's first draft. */
export function titleFromOffering(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 90);
}

/** The library photo the wizard suggests for what has been typed so far. */
export function photoForForm(f: WizardForm): string {
  return matchPhoto({
    title: f.title || f.category_slug || '',
    description: f.short_description,
    categorySlug: f.category_slug,
    vertical: f.vertical,
  });
}

/** The attributes to save: what the deal had, with group size and vehicles as set now. */
function attributesOf(f: WizardForm): Record<string, AttributeValue> {
  const out: Record<string, AttributeValue> = { ...f.attributes };
  delete out.party_min;
  delete out.party_max;
  delete out.vehicles;
  delete out.slot_capacity;
  // A per-slot cap only means something when customers pick a time.
  const perSlot = f.booking_required ? num(f.slot_capacity) : null;
  if (perSlot != null && perSlot >= 1 && Number.isInteger(perSlot)) out.slot_capacity = perSlot;
  if (f.party) {
    out.party_min = f.party[0];
    out.party_max = f.party[1];
  }
  if (f.vehicles.length > 0 && f.vertical && VEHICLE_VERTICALS.includes(f.vertical)) {
    out.vehicles = f.vehicles;
  }
  return out;
}

function num(s: string): number | null {
  const t = s.replace(/[,₹\s]/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * The full payload, every time. save_deal_draft replaces child rows wholesale,
 * so a partial post would wipe the availability or CTAs another step set.
 */
export function toDraftInput(f: WizardForm, businessId: string, id?: string): DealDraftInput {
  const avail = (f.days.length === 0 ? [null] : f.days).map((day) => ({
    day_of_week: day,
    start_time: f.start_time,
    end_time: f.end_time,
  }));
  return {
    id,
    business_id: businessId,
    category_slug: f.category_slug ?? f.vertical ?? undefined,
    deal_type_code: f.deal_type_code,
    offering_kind: f.offering_kind,
    // "Save and exit" can run mid-form; never post what the table's checks reject.
    title: f.title.trim().length >= 4 ? f.title.trim().slice(0, 90) : undefined,
    short_description: f.short_description.trim().slice(0, 160),
    description: f.description.trim(),
    original_price: num(f.original_price),
    deal_price: num(f.deal_price),
    price_unit: f.price_unit,
    taxes_note: f.taxes_note.trim() || null,
    max_qty_per_customer: num(f.max_qty_per_customer),
    starts_at: f.starts_at,
    ends_at: f.ends_at,
    capacity_total: num(f.capacity_total),
    booking_required: f.booking_required,
    cancellation_policy: f.cancellation_policy.trim() || null,
    terms: f.terms.trim() || null,
    attributes: attributesOf(f),
    // What customers find it by: the offering's words and any the merchant added.
    tags: keywordsFrom(f.offering || f.title, f.keywords),
    // Always a photo: the merchant's, or one from the library that fits the title.
    media: [{ kind: 'image', storage_path: f.photo ?? photoForForm(f) }],
    availability: avail,
    eligibility: {
      audience: f.audience,
      min_age: f.min_age,
      min_spend: num(f.min_spend),
      membership_required: f.audience === 'members',
      advance_booking_hours: f.booking_required ? num(f.advance_booking_hours) : null,
      custom_rule: f.custom_rule.trim() || null,
    },
    actions: [
      { action_type: f.primary_cta, is_primary: true },
      ...f.secondary_ctas
        .filter((c) => c !== f.primary_cta)
        .map((c) => ({ action_type: c, is_primary: false })),
    ],
  };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Errors for one step. An empty object means Next is allowed. */
export function validateStep(step: StepKey, f: WizardForm): FieldErrors {
  const e: FieldErrors = {};
  switch (step) {
    case 'category':
      if (!f.vertical) {
        e.vertical = f.offering.trim().length < 3 ? 'Say what you are offering' : 'Pick the closest category';
      }
      break;

    case 'details':
      if (f.title.trim().length < 6) e.title = 'Give it a title of at least 6 characters';
      else if (f.title.trim().length > 90) e.title = 'Keep the title under 90 characters';
      if (!f.short_description.trim()) e.short_description = 'Add a one-line summary';
      else if (f.short_description.trim().length > 120) {
        e.short_description = 'Keep the summary under 120 characters';
      }
      if (f.description.trim().length < 20) {
        e.description = 'Say a little more: what is included, and anything to know';
      }
      break;

    case 'pricing': {
      const now = num(f.deal_price);
      const was = num(f.original_price);
      if (now == null || now < 0) e.deal_price = 'Enter the price customers pay';
      else if (f.deal_type_code === 'free' && now !== 0) e.deal_price = 'A free deal has a price of 0';
      if (f.original_price.trim() && (was == null || was <= 0)) {
        e.original_price = 'Enter the usual price, or leave it empty';
      } else if (was != null && now != null && was <= now) {
        e.original_price = 'The usual price should be higher than the deal price';
      }
      break;
    }

    case 'schedule':
      if (!TIME_RE.test(f.start_time)) e.start_time = 'Use 24-hour time, like 09:30';
      if (!TIME_RE.test(f.end_time)) e.end_time = 'Use 24-hour time, like 21:00';
      if (!e.start_time && !e.end_time && f.start_time >= f.end_time) {
        e.end_time = 'Closing time must be after opening time';
      }
      if (new Date(f.ends_at).getTime() <= Date.now()) e.ends_at = 'The end date has passed';
      break;

    case 'rules': {
      const cap = num(f.capacity_total);
      if (f.capacity_total.trim() && (cap == null || cap < 1 || !Number.isInteger(cap))) {
        e.capacity_total = 'A whole number, or leave it empty for no limit';
      }
      const max = num(f.max_qty_per_customer);
      if (max == null || max < 1 || max > 10 || !Number.isInteger(max)) {
        e.max_qty_per_customer = 'Between 1 and 10';
      }
      if (f.booking_required) {
        const h = num(f.advance_booking_hours);
        if (f.advance_booking_hours.trim() && (h == null || h < 0 || h > 168)) {
          e.advance_booking_hours = 'Between 0 and 168 hours';
        }
        const perSlot = num(f.slot_capacity);
        if (f.slot_capacity.trim() && (perSlot == null || perSlot < 1 || perSlot > 500 || !Number.isInteger(perSlot))) {
          e.slot_capacity = 'A whole number from 1 to 500, or leave it empty for no limit';
        }
      }
      if (f.min_spend.trim() && (num(f.min_spend) ?? -1) < 0) {
        e.min_spend = 'Enter an amount, or leave it empty';
      }
      break;
    }

    case 'actions':
      if (f.booking_required && !['book', 'reserve', 'register', 'enquire'].includes(f.primary_cta)) {
        e.primary_cta = 'This deal needs booking, so the main button should be Book, Reserve, Register or Enquire';
      }
      break;

    case 'review':
      break;
  }
  return e;
}

/** The first step with a problem, so Submit can jump straight to it. */
export function firstInvalidStep(f: WizardForm): number {
  return STEPS.findIndex((s) => Object.keys(validateStep(s.key, f)).length > 0);
}
