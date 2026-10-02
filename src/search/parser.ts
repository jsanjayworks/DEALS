/**
 * Rule-based natural-language query parser.
 *
 * This is the fallback path described in the plan, and on the MVP it is the
 * only path: it needs no API key, runs in under a millisecond, and works
 * offline. The app also uses it to render the "Understood as" chips the instant
 * someone stops typing, while a server call is still in flight.
 *
 * When the Claude Haiku extractor is switched on it returns the same
 * SearchFilters shape, so the two are interchangeable and the LLM result can
 * simply overwrite these filters when it arrives.
 *
 *   "Lunch under ₹500 within 2km"  ->  food · lunch · max ₹500 · 2 km
 *   "2bhk in HSR under 40000"      ->  property · HSR Layout · 2 BHK · max ₹40,000
 *   "friday night events"          ->  events · Friday · night
 */

import { CATEGORIES, LOCALITIES } from '../data/seed-reference';
import type { DealTypeCode, SearchFilters, SortKey, Vertical } from '../data/types';

export const EMPTY_FILTERS: SearchFilters = {
  keywords: [],
  vertical: null,
  category_slug: null,
  price_min: null,
  price_max: null,
  radius_km: null,
  locality: null,
  time_of_day: null,
  day_of_week: [],
  deal_types: [],
  attributes: {},
  verified_only: false,
  min_rating: null,
  ending_soon: false,
  sort: 'relevance',
};

/** Words that carry no filtering signal and should not become keywords. */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'for', 'of', 'in', 'on', 'at', 'to', 'me', 'my', 'i', 'and', 'or',
  'with', 'near', 'nearby', 'around', 'close', 'by', 'from', 'is', 'are', 'any', 'some',
  'deal', 'deals', 'offer', 'offers', 'discount', 'discounts', 'best', 'good', 'show',
  'find', 'get', 'want', 'need', 'looking', 'under', 'below', 'above', 'over', 'within',
  'upto', 'rs', 'inr', 'than', 'less', 'more', 'cheap', 'cheapest', 'please',
]);

/** Everyday words mapped to the taxonomy, so plain speech finds the vertical. */
const VERTICAL_SYNONYMS: Record<string, Vertical> = {
  food: 'food', eat: 'food', eating: 'food', restaurant: 'food', restaurants: 'food',
  lunch: 'food', dinner: 'food', breakfast: 'food', brunch: 'food', coffee: 'food',
  cafe: 'food', chai: 'food', tea: 'food', biryani: 'food', pizza: 'food', beer: 'food',
  bar: 'food', pub: 'food', drinks: 'food', meal: 'food', meals: 'food', thali: 'food',
  dosa: 'food', sushi: 'food', dessert: 'food', bakery: 'food', buffet: 'food',

  retail: 'retail', shop: 'retail', shopping: 'retail', store: 'retail', clothes: 'retail',
  clothing: 'retail', fashion: 'retail', shoes: 'retail', electronics: 'retail',
  mobile: 'retail', phone: 'retail', laptop: 'retail', grocery: 'retail',
  groceries: 'retail', vegetables: 'retail', earbuds: 'retail',

  events: 'events', event: 'events', show: 'events', shows: 'events', comedy: 'events',
  standup: 'events', concert: 'events', gig: 'events', music: 'events', party: 'events',
  workshop: 'events', workshops: 'events', dj: 'events', improv: 'events',
  tickets: 'events', pottery: 'events',

  mobility: 'mobility', cab: 'mobility', cabs: 'mobility', taxi: 'mobility',
  ride: 'mobility', rides: 'mobility', airport: 'mobility', bike: 'mobility',
  scooter: 'mobility', rental: 'mobility', travel: 'mobility', outstation: 'mobility',

  property: 'property', flat: 'property', flats: 'property', house: 'property',
  home: 'property', apartment: 'property', rent: 'property', rental_home: 'property',
  bhk: 'property', pg: 'property', coliving: 'property', studio: 'property',
  villa: 'property',

  services: 'services', service: 'services', gym: 'services', fitness: 'services',
  workout: 'services', yoga: 'services', salon: 'services', spa: 'services',
  haircut: 'services', massage: 'services', repair: 'services', plumber: 'services',
  electrician: 'services', cleaning: 'services', ac: 'services', trainer: 'services',

  business: 'business', office: 'business', coworking: 'business', desk: 'business',
  printing: 'business', b2b: 'business', signage: 'business', cabin: 'business',

  community: 'community', class: 'community', classes: 'community', course: 'community',
  learn: 'community', learning: 'community', volunteer: 'community',
  volunteering: 'community', guitar: 'community', kannada: 'community',
};

/** Subcategory slugs reachable by a single word. */
const CATEGORY_SYNONYMS: Record<string, string> = {
  lunch: 'lunch', brunch: 'brunch', breakfast: 'brunch', dinner: 'dinner',
  coffee: 'cafe', cafe: 'cafe', chai: 'cafe', tea: 'cafe',
  bar: 'bar', pub: 'bar', beer: 'bar', drinks: 'bar',
  comedy: 'comedy', standup: 'comedy', improv: 'comedy',
  music: 'music', concert: 'music', gig: 'music', dj: 'music',
  workshop: 'workshop', pottery: 'workshop', painting: 'workshop',
  cab: 'cab', taxi: 'cab', airport: 'cab',
  scooter: 'bike-rental', bike: 'bike-rental',
  gym: 'fitness', fitness: 'fitness', yoga: 'fitness', workout: 'fitness',
  salon: 'salon', spa: 'salon', haircut: 'salon',
  coworking: 'coworking', desk: 'coworking', office: 'coworking',
  grocery: 'grocery', groceries: 'grocery', vegetables: 'grocery',
  electronics: 'electronics', laptop: 'electronics', earbuds: 'electronics',
  fashion: 'fashion', clothes: 'fashion', shoes: 'fashion', shirts: 'fashion',
  coliving: 'coliving', pg: 'coliving',
  volunteer: 'volunteer',
};

const DEAL_TYPE_PATTERNS: [RegExp, DealTypeCode][] = [
  [/\bfree\b|\bcomplimentary\b|\bon the house\b/, 'free'],
  [/\bflash\b|\blast chance\b|\btoday only\b/, 'flash'],
  [/\bbuy ?\d? ?get ?\d?\b|\bbogo\b|\bb1g1\b|\bbuy one get one\b/, 'bxgy'],
  [/\bcombo\b|\bbundle\b|\bpack\b|\bplatter\b/, 'bundle'],
  [/\bbook(ing)?\b|\breserve\b|\bslot\b/, 'booking'],
  [/\bhappy hours?\b|\bearly bird\b/, 'time_based'],
  [/\bexperience\b|\bworkshop\b/, 'experience'],
  [/\bsubscription\b|\bmembership\b|\bpass\b/, 'service_package'],
];

const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

/** Strips ₹, commas and the k/lakh suffixes Indian prices are typed with. */
function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[₹,\s]/g, '').toLowerCase();
  const m = cleaned.match(/^(\d+(?:\.\d+)?)(k|l|lakh|lac)?$/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  if (m[2] === 'k') n *= 1_000;
  else if (m[2] === 'l' || m[2] === 'lakh' || m[2] === 'lac') n *= 100_000;
  return Math.round(n);
}

export interface ParseResult {
  filters: SearchFilters;
  /** Human-readable chips, in display order. */
  chips: { key: keyof SearchFilters | 'q'; label: string }[];
}

export function parseQuery(input: string): ParseResult {
  const filters: SearchFilters = {
    ...EMPTY_FILTERS,
    day_of_week: [],
    deal_types: [],
    attributes: {},
    keywords: [],
  };
  const raw = input.trim();
  if (!raw) return { filters, chips: [] };

  // Normalise separators but keep ₹ and digits attached for amount matching.
  let text = ' ' + raw.toLowerCase().replace(/[^\w₹.+\-]+/g, ' ').replace(/\s+/g, ' ') + ' ';

  const consumed: string[] = [];
  const eat = (re: RegExp) => {
    text = text.replace(re, (m) => {
      consumed.push(m.trim());
      return ' ';
    });
  };

  // ---- price ------------------------------------------------------------
  // "under 500", "below ₹300", "upto 1k", "less than 2000"
  const maxMatch = text.match(
    /\b(?:under|below|upto|up to|less than|cheaper than|max|maximum|within budget of)\s*₹?\s*([\d.,]+\s*(?:k|l|lakh|lac)?)/,
  );
  if (maxMatch) {
    const amt = parseAmount(maxMatch[1]);
    if (amt !== null) {
      filters.price_max = amt;
      eat(new RegExp(maxMatch[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  }

  const minMatch = text.match(
    /\b(?:above|over|more than|at least|min|minimum|starting)\s*₹?\s*([\d.,]+\s*(?:k|l|lakh|lac)?)/,
  );
  if (minMatch) {
    const amt = parseAmount(minMatch[1]);
    if (amt !== null) {
      filters.price_min = amt;
      eat(new RegExp(minMatch[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  }

  // A bare "₹500" with no comparator reads as a ceiling, which is how people
  // use it: "biryani ₹500" means at most ₹500.
  if (filters.price_max === null && filters.price_min === null) {
    const bare = text.match(/₹\s*([\d.,]+\s*(?:k|l|lakh|lac)?)/);
    if (bare) {
      const amt = parseAmount(bare[1]);
      if (amt !== null) {
        filters.price_max = amt;
        eat(new RegExp(bare[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }
    }
  }

  // ---- radius -----------------------------------------------------------
  const radiusMatch = text.match(/\b(?:within|inside|in)?\s*(\d+(?:\.\d+)?)\s*(km|kms|kilometers?|m|meters?|metres?)\b/);
  if (radiusMatch) {
    const value = parseFloat(radiusMatch[1]);
    const unit = radiusMatch[2];
    // "2km" stays 2; "500m" / "500 metres" becomes 0.5.
    const km = unit.startsWith('k') ? value : value / 1000;
    if (Number.isFinite(km) && km > 0 && km <= 50) {
      filters.radius_km = km;
      eat(new RegExp(radiusMatch[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  } else if (/\b(nearby|near me|close by|around me|walking distance)\b/.test(text)) {
    filters.radius_km = 2;
    eat(/\b(nearby|near me|close by|around me|walking distance)\b/);
  }

  // ---- locality ---------------------------------------------------------
  // Longest name first, so "HSR Layout" is not shadowed by "HSR".
  const localityCandidates = LOCALITIES.flatMap((l) =>
    [l.name, ...l.aliases].map((n) => ({ name: l.name, token: n.toLowerCase() })),
  ).sort((a, b) => b.token.length - a.token.length);

  for (const cand of localityCandidates) {
    const re = new RegExp('\\b' + cand.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    if (re.test(text)) {
      filters.locality = cand.name;
      eat(re);
      break;
    }
  }

  // ---- attributes: 2bhk / 3 bhk ----------------------------------------
  const bhk = text.match(/\b(\d)\s*bhk\b/);
  if (bhk) {
    filters.attributes.bhk = parseInt(bhk[1], 10);
    filters.vertical = 'property';
    eat(new RegExp(bhk[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  // ---- rating -----------------------------------------------------------
  const rating = text.match(/\b([1-5](?:\.\d)?)\s*\+?\s*(?:star|stars|rating|rated)\b/);
  if (rating) {
    filters.min_rating = parseFloat(rating[1]);
    eat(new RegExp(rating[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  // ---- flags ------------------------------------------------------------
  if (/\bverified\b|\btrusted\b/.test(text)) {
    filters.verified_only = true;
    eat(/\bverified\b|\btrusted\b/);
  }
  if (/\bending soon\b|\bexpiring\b|\blast chance\b|\bending today\b/.test(text)) {
    filters.ending_soon = true;
    eat(/\bending soon\b|\bexpiring\b|\blast chance\b|\bending today\b/);
  }

  // ---- sort -------------------------------------------------------------
  if (/\bcheapest\b|\bbest value\b|\bbiggest discount\b|\bmost off\b/.test(text)) {
    filters.sort = 'best_value';
    eat(/\bcheapest\b|\bbest value\b|\bbiggest discount\b|\bmost off\b/);
  } else if (/\bnearest\b|\bclosest\b/.test(text)) {
    filters.sort = 'distance';
    eat(/\bnearest\b|\bclosest\b/);
  }

  // ---- time of day ------------------------------------------------------
  if (/\bbreakfast\b|\bmorning\b|\bsunrise\b/.test(text)) {
    filters.time_of_day = 'morning';
  } else if (/\blunch\b|\bafternoon\b|\bmidday\b/.test(text)) {
    filters.time_of_day = 'lunch';
  } else if (/\bevening\b|\bsunset\b|\bhigh tea\b/.test(text)) {
    filters.time_of_day = 'evening';
  } else if (/\bnight\b|\bdinner\b|\blate\b/.test(text)) {
    filters.time_of_day = 'night';
  }

  // ---- days -------------------------------------------------------------
  if (/\bweekend\b/.test(text)) {
    filters.day_of_week = [0, 6];
    eat(/\bweekend\b/);
  } else if (/\bweekday|weekdays\b/.test(text)) {
    filters.day_of_week = [1, 2, 3, 4, 5];
    eat(/\bweekdays?\b/);
  } else if (/\btoday\b/.test(text)) {
    filters.day_of_week = [new Date().getDay()];
    eat(/\btoday\b/);
  } else if (/\btomorrow\b/.test(text)) {
    filters.day_of_week = [(new Date().getDay() + 1) % 7];
    eat(/\btomorrow\b/);
  } else {
    for (const [name, dow] of Object.entries(DAY_NAMES)) {
      const re = new RegExp('\\b' + name + '\\b');
      if (re.test(text)) {
        filters.day_of_week = [dow];
        eat(re);
        break;
      }
    }
  }

  // ---- deal types -------------------------------------------------------
  for (const [re, code] of DEAL_TYPE_PATTERNS) {
    if (re.test(text) && !filters.deal_types.includes(code)) {
      filters.deal_types.push(code);
    }
  }

  // ---- category and vertical -------------------------------------------
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (!filters.category_slug) {
    for (const w of words) {
      const slug = CATEGORY_SYNONYMS[w];
      if (slug) {
        filters.category_slug = slug;
        const cat = CATEGORIES.find((c) => c.slug === slug);
        if (cat) filters.vertical = cat.vertical;
        break;
      }
    }
  }

  if (!filters.vertical) {
    for (const w of words) {
      const v = VERTICAL_SYNONYMS[w];
      if (v) {
        filters.vertical = v;
        break;
      }
    }
  }

  // An exact category name typed in full, e.g. "bars and pubs".
  if (!filters.category_slug) {
    for (const c of CATEGORIES) {
      if (c.parent_id && text.includes(' ' + c.name.toLowerCase() + ' ')) {
        filters.category_slug = c.slug;
        filters.vertical = c.vertical;
        break;
      }
    }
  }

  // ---- leftover keywords ------------------------------------------------
  filters.keywords = words.filter(
    (w) => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w),
  );

  return { filters, chips: describeFilters(filters) };
}

/** The removable chips under the search bar: how the query was understood. */
export function describeFilters(f: SearchFilters): ParseResult['chips'] {
  const chips: ParseResult['chips'] = [];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  if (f.vertical) chips.push({ key: 'vertical', label: cap(f.vertical) });
  if (f.category_slug) {
    const cat = CATEGORIES.find((c) => c.slug === f.category_slug);
    if (cat) chips.push({ key: 'category_slug', label: cat.name });
  }
  if (f.locality) chips.push({ key: 'locality', label: f.locality });
  if (f.radius_km != null) {
    chips.push({
      key: 'radius_km',
      label: f.radius_km < 1 ? Math.round(f.radius_km * 1000) + ' m' : f.radius_km + ' km',
    });
  }
  if (f.price_max != null) {
    chips.push({ key: 'price_max', label: 'Max ₹' + f.price_max.toLocaleString('en-IN') });
  }
  if (f.price_min != null) {
    chips.push({ key: 'price_min', label: 'Min ₹' + f.price_min.toLocaleString('en-IN') });
  }
  if (f.time_of_day) chips.push({ key: 'time_of_day', label: cap(f.time_of_day) });
  if (f.day_of_week.length > 0) {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const label =
      f.day_of_week.length === 2 && f.day_of_week.includes(0) && f.day_of_week.includes(6)
        ? 'Weekend'
        : f.day_of_week.length === 5
          ? 'Weekdays'
          : f.day_of_week.map((d) => names[d]).join(', ');
    chips.push({ key: 'day_of_week', label });
  }
  for (const [k, v] of Object.entries(f.attributes)) {
    chips.push({ key: 'attributes', label: k === 'bhk' ? v + ' BHK' : k + ': ' + v });
  }
  for (const t of f.deal_types) {
    const labels: Partial<Record<DealTypeCode, string>> = {
      free: 'Free',
      flash: 'Flash Deal',
      bxgy: 'Buy X Get Y',
      bundle: 'Bundle',
      booking: 'Booking',
      time_based: 'Time-based',
      experience: 'Experience',
      service_package: 'Package',
    };
    chips.push({ key: 'deal_types', label: labels[t] ?? t });
  }
  if (f.min_rating != null) chips.push({ key: 'min_rating', label: f.min_rating + '+ rating' });
  if (f.verified_only) chips.push({ key: 'verified_only', label: 'Verified only' });
  if (f.ending_soon) chips.push({ key: 'ending_soon', label: 'Ending soon' });
  if (f.sort !== 'relevance') {
    const sortLabels: Record<SortKey, string> = {
      relevance: 'Relevance',
      distance: 'Nearest',
      ending_soon: 'Ending soon',
      best_value: 'Best value',
    };
    chips.push({ key: 'sort', label: sortLabels[f.sort] });
  }
  return chips;
}

/** Removing a chip clears exactly that filter and leaves the rest intact. */
export function removeFilter(f: SearchFilters, key: keyof SearchFilters): SearchFilters {
  const next: SearchFilters = { ...f, attributes: { ...f.attributes } };
  switch (key) {
    case 'day_of_week':
      next.day_of_week = [];
      break;
    case 'deal_types':
      next.deal_types = [];
      break;
    case 'attributes':
      next.attributes = {};
      break;
    case 'verified_only':
      next.verified_only = false;
      break;
    case 'ending_soon':
      next.ending_soon = false;
      break;
    case 'sort':
      next.sort = 'relevance';
      break;
    case 'keywords':
      next.keywords = [];
      break;
    default:
      (next as unknown as Record<string, unknown>)[key] = null;
  }
  return next;
}

/** Suggestions shown on the focused, empty search screen. */
export const SUGGESTED_QUERIES: readonly string[] = [
  'Lunch under ₹300 near me',
  'Coffee meeting near Koramangala',
  'Friday night events',
  'Gym offers nearby',
  '2BHK in HSR under ₹40000',
  'Free deals this weekend',
  'Salon under ₹2000',
  'Airport cab flat fare',
] as const;
