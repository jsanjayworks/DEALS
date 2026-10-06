/**
 * When a search finds nothing, loosen it a step at a time until it does,
 * and say what was loosened. An empty page is a dead end; "nothing under
 * ₹200 within 3 km, so here is up to ₹300 within 10 km" is an answer.
 *
 * The order is what people mind least first: a little more distance, then a
 * little more money, then any time of day, then the exact words. The group
 * size and the vehicle are never loosened: a feast for five is no use to a
 * couple, and a car wash is no use for a bike.
 */

import type { SearchFilters } from '../data/types';

export interface Relaxation {
  filters: SearchFilters;
  /** What changed, for the line above the results. */
  note: string;
}

const WIDE_KM = 10;
/** Far enough to cover the city from anywhere in it: Electronic City to Hebbal. */
const CITY_KM = 30;

function km(n: number): string {
  return n < 1 ? Math.round(n * 1000) + ' m' : n + ' km';
}

function joinWords(parts: string[]): string {
  return parts.length <= 1
    ? (parts[0] ?? '')
    : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}

/** Each step builds on the one before; try them in order until one has results. */
export function relaxations(f: SearchFilters): Relaxation[] {
  const steps: Relaxation[] = [];
  const changes: string[] = [];
  let cur = f;
  const push = () =>
    steps.push({ filters: cur, note: 'No exact matches, so this shows ' + joinWords(changes) + '.' });

  const radius = cur.radius_km ?? 5;
  if (radius < WIDE_KM && !cur.locality) {
    cur = { ...cur, radius_km: WIDE_KM };
    changes.push('deals within ' + WIDE_KM + ' km instead of ' + km(radius));
    push();
  }
  if (radius < CITY_KM && !cur.locality) {
    cur = { ...cur, radius_km: CITY_KM };
    const city = 'deals across Bengaluru instead of within ' + km(radius);
    if (radius < WIDE_KM) changes[changes.length - 1] = city;
    else changes.push(city);
    push();
  }

  if (cur.price_max != null) {
    const raised = Math.ceil((cur.price_max * 1.5) / 50) * 50;
    changes.push('prices up to ₹' + raised.toLocaleString('en-IN') + ' instead of ₹' + cur.price_max.toLocaleString('en-IN'));
    cur = { ...cur, price_max: raised };
    push();
  }

  if (cur.time_of_day || cur.day_of_week.length > 0) {
    cur = { ...cur, time_of_day: null, day_of_week: [] };
    changes.push('any day and time');
    push();
  }

  // Without the words, a search that was only words would show every deal,
  // which answers nothing; better to say plainly that nothing matched.
  if (cur.keywords.length > 0 && narrowsBeyondWords(cur)) {
    changes.push('other deals that fit, without “' + cur.keywords.join(' ') + '”');
    cur = { ...cur, keywords: [] };
    push();
  }

  return steps;
}

function narrowsBeyondWords(f: SearchFilters): boolean {
  return (
    f.vertical != null ||
    f.category_slug != null ||
    f.price_min != null ||
    f.price_max != null ||
    f.deal_types.length > 0 ||
    Object.keys(f.attributes).length > 0 ||
    f.party_min != null ||
    f.party_max != null ||
    f.vehicle_tags.length > 0
  );
}
