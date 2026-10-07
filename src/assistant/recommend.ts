/**
 * "What's the best deal for me today?": live deals near them, ranked by what
 * they order (the same deal, the same place, the same kind of thing, the
 * tags they like, places they rated well, what they usually spend), by what
 * is on right now (today's hours, the meal of the hour), and by value,
 * rating and distance. Each pick carries the reasons in plain words, so the
 * answer says why, not just what.
 *
 * Without a history it still ranks by the hour, value and popularity, and
 * says so.
 */

import { db } from '../data';
import type { DealCardModel, LatLng } from '../data/types';
import { timeLabel } from '../lib/format';
import { istClock, windowState } from '../lib/hours';
import { parseQuery } from '../search/parser';
import { distanceLabel, inr } from '../theme/tokens';
import { type History, timesLabel, whenLabel } from './history';

export interface Pick {
  deal: DealCardModel;
  /** Why it was picked, strongest first, at most two. */
  why: string[];
  score: number;
  /** Tapping it goes straight to checkout, for this many. */
  take?: { quantity: number };
}

type Meal = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'late';

function mealAt(minutes: number): Meal {
  const h = minutes / 60;
  if (h < 5) return 'late';
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 18.5) return 'snack';
  if (h < 23) return 'dinner';
  return 'late';
}

const MEAL_FIT: Record<Meal, { slugs: string[]; tags: string[] }> = {
  breakfast: { slugs: ['brunch', 'cafe'], tags: ['breakfast', 'coffee', 'idli', 'dosa', 'brunch'] },
  lunch: { slugs: ['lunch'], tags: ['lunch', 'thali', 'biryani', 'meals'] },
  snack: { slugs: ['cafe'], tags: ['coffee', 'tea', 'chai', 'snack', 'dessert', 'pastry'] },
  dinner: { slugs: ['dinner', 'bar'], tags: ['dinner', 'biryani', 'family pack', 'kebab'] },
  late: { slugs: ['bar', 'dinner'], tags: ['dinner', 'beer'] },
};

const MEAL_WORD: Record<Meal, string> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  snack: 'an evening snack',
  dinner: 'dinner',
  late: 'a late bite',
};

/** Things nobody means by "a deal for me today" unless they ask: rent, office space, volunteering. */
const NOT_TODAY = ['property', 'business', 'community'];

async function candidatesFor(origin: LatLng, query: string | null): Promise<DealCardModel[]> {
  if (query) {
    const { filters } = parseQuery(query);
    const { deals } = await db.searchDeals({
      q: query,
      filters: { ...filters, radius_km: filters.radius_km ?? 10 },
      origin,
      limit: 60,
    });
    return deals;
  }
  return db.feedNearby({ origin, radius_m: 10_000, section: 'near_you', limit: 200 });
}

function scoreDeal(d: DealCardModel, h: History, query: string | null, now: number): Pick {
  const clock = istClock(now);
  const why: [number, string][] = [];
  let s = 0;

  // ---- what they order ----
  const usual = h.deals.find((u) => u.deal.id === d.id);
  const place = h.places.find((p) => p.business.id === d.business.id);
  const kind = h.kinds.find((k) => k.slug === d.category.slug);
  const maxKind = h.kinds[0]?.count ?? 1;
  const maxTag = Math.max(1, ...h.tags.values());
  const liked = d.tags.filter((t) => h.tags.has(t)).sort((a, b) => (h.tags.get(b) ?? 0) - (h.tags.get(a) ?? 0));
  const rated = h.ratings.get(d.business.id);
  const personal = h.orders.length > 0;

  if (usual) {
    s += 0.7 + 0.08 * Math.min(usual.count, 5);
    why.push([
      1,
      usual.count > 1
        ? 'Your usual: you have had it ' + timesLabel(usual.count)
        : 'You had it ' + whenLabel(usual.last, now),
    ]);
  } else if (place) {
    s += 0.4 + 0.05 * Math.min(place.count, 4);
    why.push([0.8, 'From ' + d.business.name + ', where you have ordered ' + timesLabel(place.count)]);
  }
  if (kind) {
    s += (0.3 * kind.count) / maxKind;
    if (!usual && !place) why.push([0.6, 'You often pick ' + kind.name.toLowerCase() + ' deals']);
  }
  if (liked.length) {
    s += 0.2 * Math.min(1, (h.tags.get(liked[0]) ?? 0) / maxTag);
    if (!usual) why.push([0.55, 'You like ' + liked[0]]);
  }
  if (rated != null && rated >= 4) {
    s += 0.15;
    why.push([0.65, 'You rated ' + d.business.name + ' ' + rated + '★']);
  }
  if (h.typical && d.deal_price && d.deal_price <= h.typical * 1.5) {
    s += 0.08;
    why.push([0.3, 'Fits your usual spend of about ' + inr(Math.round(h.typical / 10) * 10)]);
  }
  if (personal && !h.orders.some((o) => o.deal.category.vertical === d.category.vertical)) s -= 0.15;

  // ---- what is on right now ----
  const days = d.availability.days;
  // Not on today, or over for the day: it cannot be had today, whatever they like.
  if (days.length > 0 && !days.includes(clock.dow)) {
    s -= 1.5;
  } else {
    const { start_time: from, end_time: to } = d.availability;
    const allDay = from <= '00:30' && to >= '23:30';
    const w = allDay ? 'open' : windowState(from, to, now);
    if (w === 'open') {
      s += 0.15;
      if (!allDay) why.push([0.45, 'On now, till ' + timeLabel(to)]);
    } else if (w === 'before') {
      s += 0.08;
      why.push([0.95, 'From ' + timeLabel(from) + ' today']);
    } else {
      s -= 1.5;
    }
  }
  if (d.category.vertical === 'food' && !query) {
    const meal = mealAt(clock.minutes);
    const fit = MEAL_FIT[meal];
    if (fit.slugs.includes(d.category.slug) || d.tags.some((t) => fit.tags.includes(t))) {
      s += 0.2;
      why.push([0.5, 'Good for ' + MEAL_WORD[meal] + ' now']);
    }
  }
  if (!query && NOT_TODAY.includes(d.category.vertical)) s -= 0.8;

  // ---- value, quality, distance ----
  s += (0.25 * Math.min(d.discount_pct ?? 0, 60)) / 60;
  s += 0.1 * (d.rating_avg / 5);
  s -= 0.03 * Math.min(d.distance_km, 10);
  if (d.ending_soon) why.push([0.35, 'Ends soon']);
  if (!personal) {
    if (d.rating_avg >= 4.5) why.push([0.5, 'Rated ' + d.rating_avg.toFixed(1) + '★ by ' + d.rating_count + ' people']);
    if (d.views > 3000) why.push([0.45, 'Popular near you']);
    if (d.distance_km < 1) why.push([0.4, 'Just ' + distanceLabel(d.distance_km) + ' away']);
  }

  const reasons = why
    .sort((a, b) => b[0] - a[0])
    .map((w) => w[1])
    .filter((x, i, all) => all.indexOf(x) === i)
    .slice(0, 2);
  return { deal: d, why: reasons, score: s };
}

/** The best few for them, one per place, skipping deals they already hold a code for. */
export async function picksFor({
  origin,
  query,
  history,
  limit = 3,
  now = Date.now(),
}: {
  origin: LatLng;
  query: string | null;
  history: History;
  limit?: number;
  now?: number;
}): Promise<Pick[]> {
  const pool = await candidatesFor(origin, query);
  const holding = new Set(history.open.map((a) => a.deal.id));
  const ranked = pool
    .filter((d) => !holding.has(d.id))
    .map((d) => scoreDeal(d, history, query, now))
    .sort((a, b) => b.score - a.score || a.deal.distance_km - b.deal.distance_km);
  // Favourites lead, but one slot is kept for something they have not had yet.
  const had = new Set(history.deals.map((u) => u.deal.id));
  const maxHad = history.orders.length > 0 && limit >= 3 ? limit - 1 : limit;
  const out: Pick[] = [];
  const places = new Set<string>();
  for (const p of ranked) {
    if (places.has(p.deal.business.id)) continue;
    if (had.has(p.deal.id) && out.filter((x) => had.has(x.deal.id)).length >= maxHad) continue;
    places.add(p.deal.business.id);
    out.push(had.has(p.deal.id) || history.orders.length === 0 ? p : { ...p, why: ['New for you', ...p.why].slice(0, 2) });
    if (out.length >= limit) break;
  }
  return out;
}
