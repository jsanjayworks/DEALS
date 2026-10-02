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
 * Text relevance without Postgres full-text search: title matches weigh most,
 * then tags, then the descriptions. Mirrors the setweight(A/B/C) ordering of
 * the generated search_vector column.
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
    if (title.includes(term)) hits += 1.0;
    else if (tags.includes(term)) hits += 0.7;
    else if (cat.includes(term)) hits += 0.6;
    else if (biz.includes(term)) hits += 0.5;
    else if (body.includes(term)) hits += 0.4;
  }
  return Math.min(hits / terms.length, 1);
}
