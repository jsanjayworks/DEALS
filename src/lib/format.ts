/**
 * Display formatting. Pure functions, no React, so screens and tests share them.
 */

import type { DealAvailability, DealCardModel } from '../data/types';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "11 AM", "4 PM", "11:30 AM" — Indian apps read 12-hour, not 24. */
export function timeLabel(hhmm: string): string {
  const [hRaw, mRaw] = hhmm.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw ?? 0);
  if (!Number.isFinite(h)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? h12 + ' ' + suffix : h12 + ':' + String(m).padStart(2, '0') + ' ' + suffix;
}

/**
 * "Sat–Sun · 11 AM–4 PM", "Mon–Fri · 12–3:30 PM", "Today · 8 AM–12 PM".
 * Collapses a run of consecutive weekdays into a range, because
 * "Mon, Tue, Wed, Thu, Fri" is unreadable on a card.
 */
export function availabilityLabel(a: DealAvailability): string {
  const window = timeLabel(a.start_time) + '–' + timeLabel(a.end_time);
  const days = [...a.days].sort((x, y) => x - y);

  if (days.length === 0 || days.length === 7) return 'Daily · ' + window;
  if (days.length === 5 && days.every((d) => d >= 1 && d <= 5)) {
    return 'Mon–Fri · ' + window;
  }
  if (days.length === 2 && days.includes(0) && days.includes(6)) {
    return 'Sat–Sun · ' + window;
  }

  // Consecutive run, e.g. Thu–Sat.
  const consecutive = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  if (consecutive && days.length > 2) {
    return DAY_SHORT[days[0]] + '–' + DAY_SHORT[days[days.length - 1]] + ' · ' + window;
  }
  return days.map((d) => DAY_SHORT[d]).join(', ') + ' · ' + window;
}

/** "Ends in 3 hours", "Ends in 2 days", "Ended". Drives the urgency copy. */
export function endsInLabel(endsAt: string, now: Date = new Date()): string {
  const ms = new Date(endsAt).getTime() - now.getTime();
  if (ms <= 0) return 'Ended';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'Ends in ' + Math.max(1, Math.round(ms / 60_000)) + ' min';
  if (hours < 24) return 'Ends in ' + hours + (hours === 1 ? ' hour' : ' hours');
  const days = Math.round(hours / 24);
  return 'Ends in ' + days + (days === 1 ? ' day' : ' days');
}

/** "5m", "2h", "3d" for notification and activity rows. */
export function shortAgo(iso: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return mins + 'm';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h';
  return Math.floor(hours / 24) + 'd';
}

export type CardBadge = 'Ending Soon' | 'Trending' | 'New' | 'Flash Deal' | 'Free';

/**
 * The single badge a card shows. Only one, in priority order, because the
 * design puts them in one corner and two would collide.
 */
export function badgeFor(deal: DealCardModel, now: Date = new Date()): CardBadge | null {
  if (deal.deal_type_code === 'free' || deal.deal_price === 0) return 'Free';
  if (deal.deal_type_code === 'flash') return 'Flash Deal';
  if (deal.ending_soon) return 'Ending Soon';
  if (deal.published_at) {
    const ageDays = (now.getTime() - new Date(deal.published_at).getTime()) / 86_400_000;
    if (ageDays <= 3) return 'New';
  }
  if (deal.views >= 3000) return 'Trending';
  return null;
}

/** Human label for a deal type code, used as the card's overline. */
export const DEAL_TYPE_LABEL: Record<string, string> = {
  discount: 'Discount',
  bundle: 'Bundle',
  bxgy: 'Buy X Get Y',
  booking: 'Booking',
  experience: 'Experience',
  time_based: 'Time-based',
  flash: 'Flash Deal',
  free: 'Free',
  service_package: 'Package',
  property: 'Listing',
  business_offer: 'Business',
  transport: 'Transport',
  community: 'Community',
};

/** Capacity line: "12 left", plus the fraction claimed for the progress bar. */
export function capacityLabel(remaining: number | null, total: number | null): string | null {
  if (remaining == null || total == null || total <= 0) return null;
  return remaining + ' left';
}

export function capacityFraction(remaining: number | null, total: number | null): number {
  if (remaining == null || total == null || total <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - remaining / total));
}
