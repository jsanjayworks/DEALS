/**
 * What a customer has ordered, boiled down for the assistant: how often each
 * deal, place and kind of thing, what an order usually costs them, what they
 * have saved, and the codes they still hold. Built from listMyActions and
 * their reviews, so it works the same on the demo and on Supabase.
 */

import { db } from '../data';
import type { ActionWithDeal } from '../data/api';
import type { Business, DealCardModel } from '../data/types';
import { paymentOf } from '../lib/payment';

export interface Usual {
  deal: DealCardModel;
  count: number;
  /** When they last had it, ms. */
  last: number;
  /** How many they took last time. */
  quantity: number;
}

export interface Place {
  business: Business;
  count: number;
  last: number;
}

export interface Kind {
  slug: string;
  name: string;
  count: number;
}

export interface History {
  /** Orders that went ahead, newest first: confirmed or used. */
  orders: ActionWithDeal[];
  /** Codes and bookings still to use, soonest first. */
  open: ActionWithDeal[];
  /** Most ordered first, then most recent. */
  deals: Usual[];
  places: Place[];
  kinds: Kind[];
  /** Tag → how many orders carried it. */
  tags: Map<string, number>;
  /** Business id → their latest star rating of it. */
  ratings: Map<string, number>;
  spent: number;
  saved: number;
  /** A typical order's value (the median of paid ones); null with none. */
  typical: number | null;
  /** Their first order, ms; null with none. */
  since: number | null;
}

export const EMPTY_HISTORY: History = {
  orders: [],
  open: [],
  deals: [],
  places: [],
  kinds: [],
  tags: new Map(),
  ratings: new Map(),
  spent: 0,
  saved: 0,
  typical: null,
  since: null,
};

const at = (a: ActionWithDeal) => new Date(a.created_at).getTime();

/** What the order cost them: the payment, else the deal price times how many. */
export function paidFor(a: ActionWithDeal): number {
  return paymentOf(a)?.amount ?? (a.deal.deal_price ?? 0) * a.quantity;
}

/** What the deal took off the usual price on this order. */
export function savedOn(a: ActionWithDeal): number {
  const { original_price: was, deal_price: now } = a.deal;
  return was != null && now != null && was > now ? (was - now) * a.quantity : 0;
}

export function summarise(actions: ActionWithDeal[], ratings: Map<string, number> = new Map()): History {
  const orders = actions
    .filter((a) => a.status === 'confirmed' || a.status === 'redeemed' || a.status === 'pending')
    .filter((a) => a.action_type !== 'enquiry')
    .sort((a, b) => at(b) - at(a));
  const open = orders
    .filter((a) => a.status === 'confirmed' || a.status === 'pending')
    .sort((a, b) => (a.slot_start ?? a.deal.ends_at).localeCompare(b.slot_start ?? b.deal.ends_at));

  const deals = new Map<string, Usual>();
  const places = new Map<string, Place>();
  const kinds = new Map<string, Kind>();
  const tags = new Map<string, number>();
  for (const a of orders) {
    const t = at(a);
    const u = deals.get(a.deal.id);
    if (u) u.count += 1;
    else deals.set(a.deal.id, { deal: a.deal, count: 1, last: t, quantity: a.quantity });
    const p = places.get(a.deal.business.id);
    if (p) p.count += 1;
    else places.set(a.deal.business.id, { business: a.deal.business, count: 1, last: t });
    const k = kinds.get(a.deal.category.slug);
    if (k) k.count += 1;
    else kinds.set(a.deal.category.slug, { slug: a.deal.category.slug, name: a.deal.category.name, count: 1 });
    for (const tag of a.deal.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
  }

  const paid = orders.map(paidFor).filter((x) => x > 0).sort((x, y) => x - y);
  const byCount = <T extends { count: number; last: number }>(xs: Iterable<T>) =>
    [...xs].sort((a, b) => b.count - a.count || b.last - a.last);
  return {
    orders,
    open,
    deals: byCount(deals.values()),
    places: byCount(places.values()),
    kinds: [...kinds.values()].sort((a, b) => b.count - a.count),
    tags,
    ratings,
    spent: orders.reduce((s, a) => s + paidFor(a), 0),
    saved: orders.reduce((s, a) => s + savedOn(a), 0),
    typical: paid.length ? paid[Math.floor(paid.length / 2)] : null,
    since: orders.length ? at(orders[orders.length - 1]) : null,
  };
}

/** The signed-in customer's history; empty when signed out or on any failure. */
export async function loadHistory(signedIn: boolean): Promise<History> {
  if (!signedIn) return EMPTY_HISTORY;
  try {
    const [actions, reviews] = await Promise.all([db.listMyActions(), db.listMyReviews().catch(() => [])]);
    const ratings = new Map<string, number>();
    for (const r of [...reviews].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      ratings.set(r.business_id, r.rating);
    }
    return summarise(actions, ratings);
  } catch {
    return EMPTY_HISTORY;
  }
}

/** "today", "yesterday", "3 days ago", "on 12 Sep". */
export function whenLabel(ms: number, now: number = Date.now()): string {
  const day = (x: number) => Math.floor((x + 330 * 60_000) / 86_400_000);
  const d = day(now) - day(ms);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return d + ' days ago';
  return 'on ' + new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

/** "once", "twice", "4 times". */
export function timesLabel(n: number): string {
  return n === 1 ? 'once' : n === 2 ? 'twice' : n + ' times';
}

/** A deal still on offer: live, started and not ended. */
export function isLiveDeal(d: Pick<DealCardModel, 'status' | 'ends_at' | 'starts_at'>, now: number = Date.now()): boolean {
  return d.status === 'ACTIVE' && new Date(d.ends_at).getTime() > now && new Date(d.starts_at).getTime() <= now;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Does this deal fit the words they used: its title, tags, category or place. */
export function dealMatches(d: DealCardModel, words: string | null): boolean {
  if (!words) return true;
  const hay = norm([d.title, d.short_description, d.tags.join(' '), d.category.name, d.business.name].join(' '));
  return norm(words)
    .split(' ')
    .filter((w) => w.length >= 3)
    .some((w) => hay.includes(w) || (w.endsWith('s') && hay.includes(w.slice(0, -1))));
}

/** How well the words name this deal: title words count most, then tags, then the rest. */
export function matchScore(d: DealCardModel, words: string): number {
  const title = norm(d.title);
  const tags = norm(d.tags.join(' '));
  const rest = norm([d.short_description, d.category.name].join(' '));
  let score = 0;
  for (const w of norm(words).split(' ').filter((x) => x.length >= 3)) {
    const stem = w.endsWith('s') ? w.slice(0, -1) : w;
    if (title.includes(stem)) score += 3;
    else if (tags.includes(stem)) score += 2;
    else if (rest.includes(stem)) score += 1;
  }
  return score;
}

/** Same place, allowing for how it was heard: "Rangoli" finds "Rangoli Kitchen". */
export function sameBusiness(spoken: string, name: string): boolean {
  const a = norm(spoken);
  const b = norm(name);
  if (!a || !b) return false;
  return b.includes(a) || a.includes(b) || b.split(' ')[0] === a.split(' ')[0];
}
