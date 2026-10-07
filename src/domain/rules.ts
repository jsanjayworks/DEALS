/**
 * Action eligibility, mirrored from take_deal_action() in 0002_functions.sql.
 *
 * The database is the authority — it holds the row lock that stops two people
 * claiming the last unit. This module exists so the UI can disable a CTA and
 * explain why before a round trip, and so the local adapter rejects the same
 * things with the same wording.
 *
 * Messages here are user-facing and are shown verbatim.
 */

import { istNow } from './ranking';
import type { CustomerAction, CustomerActionType, DealCardModel } from '../data/types';

export interface Viewer {
  id: string;
  date_of_birth: string | null;
  is_yolo_verified: boolean;
}

export interface EligibilityVerdict {
  ok: boolean;
  /** Shown on the blocked CTA. Null when ok. */
  reason: string | null;
  /** True when a profile change would unblock it, e.g. adding a birth date. */
  fixable: boolean;
}

const OK: EligibilityVerdict = { ok: true, reason: null, fixable: false };

function deny(reason: string, fixable = false): EligibilityVerdict {
  return { ok: false, reason, fixable };
}

export function ageFrom(dob: string | null, at: Date = new Date()): number | null {
  if (!dob) return null;
  const b = new Date(dob);
  if (Number.isNaN(b.getTime())) return null;
  let age = at.getFullYear() - b.getFullYear();
  const m = at.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < b.getDate())) age--;
  return age;
}

/**
 * Whether a deal may even be shown. Age-restricted deals are hidden outright
 * rather than shown-and-blocked, matching the WHERE clause in feed_nearby.
 */
export function isVisibleTo(deal: DealCardModel, viewer: Viewer | null): boolean {
  const minAge = deal.eligibility.min_age;
  if (minAge == null) return true;
  const age = ageFrom(viewer?.date_of_birth ?? null);
  return age !== null && age >= minAge;
}

/** Inside the deal's days and hours right now, in IST: what a claim without a slot needs. */
export function withinWindow(deal: DealCardModel, at: Date): boolean {
  const { dow, minutes } = istNow(at);
  const days = deal.availability.days;
  if (days.length > 0 && !days.includes(dow)) return false;

  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  return minutes >= toMin(deal.availability.start_time) && minutes <= toMin(deal.availability.end_time);
}

export interface ActionCheck {
  deal: DealCardModel;
  viewer: Viewer | null;
  actionType: CustomerActionType;
  quantity?: number;
  /** Set for an advance booking; skips the "open right now" check. */
  slotStart?: string | null;
  /** The viewer's existing live actions on this deal. */
  existing?: CustomerAction[];
  at?: Date;
}

export function checkAction({
  deal,
  viewer,
  actionType,
  quantity = 1,
  slotStart = null,
  existing = [],
  at = new Date(),
}: ActionCheck): EligibilityVerdict {
  if (!viewer) return deny('Sign in to continue', true);

  if (deal.status !== 'ACTIVE') return deny('This deal is not active');
  if (new Date(deal.ends_at).getTime() <= at.getTime()) return deny('This deal has ended');

  if (quantity < 1) return deny('Quantity must be at least 1');
  if (deal.max_qty_per_customer != null && quantity > deal.max_qty_per_customer) {
    return deny('Limit is ' + deal.max_qty_per_customer + ' per customer');
  }

  const minAge = deal.eligibility.min_age;
  if (minAge != null) {
    const age = ageFrom(viewer.date_of_birth, at);
    if (age === null) {
      return deny('Add your date of birth to claim age-restricted deals', true);
    }
    if (age < minAge) {
      return deny('This deal is restricted to ' + minAge + ' and above');
    }
  }

  if (deal.eligibility.audience === 'verified' && !viewer.is_yolo_verified) {
    return deny('This deal is for YOLO verified users', true);
  }

  if (slotStart === null) {
    if (!withinWindow(deal, at)) {
      return deny('This deal is not available right now');
    }
  } else {
    const hours = deal.eligibility.advance_booking_hours;
    if (hours != null) {
      const earliest = at.getTime() + hours * 3600 * 1000;
      if (new Date(slotStart).getTime() < earliest) {
        return deny('Book at least ' + hours + ' hours ahead');
      }
    }
  }

  // One live action per customer per deal, so My Deals cannot fill with dupes.
  // Enquiries are exempt: asking twice is legitimate.
  const live = existing.filter(
    (a) => a.deal_id === deal.id && (a.status === 'pending' || a.status === 'confirmed'),
  );
  if (live.length > 0 && actionType !== 'enquiry') {
    return deny('You have already taken this deal');
  }

  if (deal.capacity_remaining != null && deal.capacity_remaining < quantity) {
    return deal.capacity_remaining === 0
      ? deny('Sold out')
      : deny('Only ' + deal.capacity_remaining + ' left');
  }

  return OK;
}

/** Redemption codes: no O/0/I/1, so counter staff can read them aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRedemptionCode(taken: Set<string> = new Set()): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = 'YOLO-';
    for (let i = 0; i < 6; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!taken.has(code)) return code;
  }
  // Astronomically unlikely; keeps the signature non-optional.
  return 'YOLO-' + Date.now().toString(36).toUpperCase().slice(-6);
}

/** Which action types mint a code the customer shows at the counter. */
export function mintsCode(actionType: CustomerActionType): boolean {
  return (
    actionType === 'claim' ||
    actionType === 'booking' ||
    actionType === 'reserve' ||
    actionType === 'registration'
  );
}

/** An enquiry stays pending until the merchant replies; the rest confirm now. */
export function initialStatus(actionType: CustomerActionType): CustomerAction['status'] {
  return actionType === 'enquiry' ? 'pending' : 'confirmed';
}
