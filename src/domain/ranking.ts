/**
 * Search ranking, mirrored from deal_score() in 0002_functions.sql.
 *
 * Weights live in a config row in the database so they can be tuned without an
 * app release; DEFAULT_WEIGHTS below is the fallback the local adapter uses and
 * must match the ranking_config defaults.
 *
 * Hard filters (radius, price, category, time, age) are applied before this
 * runs. Scoring only ever sees candidates that already qualify.
 */

import type { DealCardModel } from '../data/types';

export interface RankingWeights {
  relevance: number;
  distance: number;
  available: number;
  value: number;
  fresh: number;
  rating: number;
  verified: number;
  urgency: number;
}

export const DEFAULT_WEIGHTS: RankingWeights = {
  relevance: 0.28,
  distance: 0.22,
  available: 0.14,
  value: 0.1,
  fresh: 0.08,
  rating: 0.08,
  verified: 0.05,
  urgency: 0.05,
};

/** Discount above this buys no extra rank, so a fake 95% off cannot win. */
const DISCOUNT_CAP = 70;
/** Bayesian prior: an unrated deal is treated as 4.0 with 5 reviews behind it. */
const RATING_PRIOR = 4.0;
const RATING_PRIOR_WEIGHT = 5;
const FRESHNESS_WINDOW_DAYS = 7;

/** Local time in Bengaluru, independent of the device timezone. */
export function istNow(at: Date = new Date()): { dow: number; minutes: number } {
  const ist = new Date(at.getTime() + (5 * 60 + 30) * 60 * 1000);
  return {
    dow: ist.getUTCDay(),
    minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** 1 open now, 0.5 opens later today, 0 otherwise. */
export function availabilityScore(deal: DealCardModel, at: Date = new Date()): number {
  const { dow, minutes } = istNow(at);
  const days = deal.availability.days;
  const dayOk = days.length === 0 || days.includes(dow);
  if (!dayOk) return 0;

  const start = toMinutes(deal.availability.start_time);
  const end = toMinutes(deal.availability.end_time);
  if (minutes >= start && minutes <= end) return 1;
  if (minutes < start) return 0.5;
  return 0;
}

export function isOpenNow(deal: DealCardModel, at: Date = new Date()): boolean {
  return availabilityScore(deal, at) === 1;
}

export interface ScoreInput {
  deal: DealCardModel;
  /** 0..1 text relevance. Use 0.5 for feeds, where there is no query. */
  relevance: number;
  radiusKm: number;
  at?: Date;
  weights?: RankingWeights;
}

export function scoreDeal({
  deal,
  relevance,
  radiusKm,
  at = new Date(),
  weights = DEFAULT_WEIGHTS,
}: ScoreInput): number {
  const sDistance = 1 - Math.min(deal.distance_km / Math.max(radiusKm, 0.1), 1);
  const sAvailable = availabilityScore(deal, at);
  const sValue = Math.min(deal.discount_pct ?? 0, DISCOUNT_CAP) / DISCOUNT_CAP;

  const publishedMs = deal.published_at ? new Date(deal.published_at).getTime() : at.getTime();
  const ageDays = (at.getTime() - publishedMs) / 86_400_000;
  const sFresh = Math.max(0, 1 - ageDays / FRESHNESS_WINDOW_DAYS);

  const sRating =
    (deal.rating_avg * deal.rating_count + RATING_PRIOR * RATING_PRIOR_WEIGHT) /
    (deal.rating_count + RATING_PRIOR_WEIGHT) /
    5;

  const msLeft = new Date(deal.ends_at).getTime() - at.getTime();
  const sUrgency = msLeft <= 24 * 3600 * 1000 ? 1 : 0;

  return (
    weights.relevance * Math.min(Math.max(relevance, 0), 1) +
    weights.distance * sDistance +
    weights.available * sAvailable +
    weights.value * sValue +
    weights.fresh * sFresh +
    weights.rating * sRating +
    weights.verified * (deal.is_verified ? 1 : 0) +
    weights.urgency * sUrgency
  );
}

/**
 * What a search word is matched by: lower case, a plural's trailing "s"
 * dropped ("kebabs" finds "kebab"). Mirrored by search_stem() in SQL.
 */
export function searchStem(term: string): string {
  const t = term.toLowerCase();
  return t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t;
}

/**
 * True when a word in `text` starts with `stem`: "biry" finds "biryani", but
 * "veg" does not find "non-veg" and "tea" does not find "steak". A hyphen
 * joins a word, so "non-veg" is one word.
 */
export function startsWord(text: string, stem: string): boolean {
  let i = text.indexOf(stem);
  while (i !== -1) {
    if (i === 0 || !/[a-z0-9-]/.test(text[i - 1])) return true;
    i = text.indexOf(stem, i + 1);
  }
  return false;
}

/**
 * Text relevance without Postgres full-text search: title matches weigh most,
 * then tags, then category, business and the descriptions. Each word counts
 * on its own, so a deal that matches some of the words still shows, ranked
 * below one that matches them all. Mirrors search_deals() in SQL.
 */
export function textRelevance(deal: DealCardModel, terms: string[]): number {
  if (terms.length === 0) return 0.5;

  const title = deal.title.toLowerCase();
  const tags = deal.tags.join(' ').toLowerCase();
  const body = (deal.short_description + ' ' + deal.description).toLowerCase();
  const biz = deal.business.name.toLowerCase();
  const cat = (deal.category.name + ' ' + deal.category.slug).toLowerCase();

  let hits = 0;
  for (const term of terms) {
    const stem = searchStem(term);
    if (startsWord(title, stem)) hits += 1.0;
    else if (startsWord(tags, stem)) hits += 0.7;
    else if (startsWord(cat, stem)) hits += 0.6;
    else if (startsWord(biz, stem)) hits += 0.5;
    else if (startsWord(body, stem)) hits += 0.4;
  }
  return Math.min(hits / terms.length, 1);
}

const VEHICLE_KINDS = ['bike', 'scooter', 'car'];

/**
 * How closely a deal's vehicle tags fit the vehicle searched for. `wanted`
 * starts with the tag the person named (see data/vehicles.ts). A deal for
 * exactly that model or brand scores 1, one for a related model or brand
 * 0.85, one for the whole kind of vehicle 0.6; a deal that also covers other
 * kinds is less of a specialist and keeps 85% of that. Mirrors
 * vehicle_relevance() in SQL.
 */
export function vehicleRelevance(fits: string[], wanted: string[]): number {
  if (wanted.length === 0 || fits.length === 0) return 0;
  let w = 0;
  if (fits.includes(wanted[0])) w = 1;
  else if (fits.some((t) => !VEHICLE_KINDS.includes(t) && wanted.includes(t))) w = 0.85;
  else if (fits.some((t) => wanted.includes(t))) w = 0.6;
  return fits.length === 1 ? w : w * 0.85;
}

/** Words and vehicle together: the relevance search ranks by. */
export function searchRelevance(
  deal: DealCardModel,
  keywords: string[],
  vehicleTags: string[],
  fits: string[],
): number {
  const text = textRelevance(deal, keywords);
  if (vehicleTags.length === 0) return text;
  const vehicle = vehicleRelevance(fits, vehicleTags);
  return keywords.length === 0 ? vehicle : text * 0.6 + vehicle * 0.4;
}
