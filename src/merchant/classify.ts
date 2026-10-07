/**
 * Plain words in, a category out. A merchant types what they are offering
 * ("Chicken biryani family pack for 4", "Royal Enfield full service") and
 * this picks where it is listed, the kind of deal, and the words customers
 * will find it by. The merchant sees the pick and can change it.
 *
 * Three readers, strongest first: the search parser's own category words
 * (the same ones customers type, so the deal lands where they look), then
 * the photo library's topics (300-odd words for dishes, services, vehicles,
 * places), then the parser's broad vertical. Nothing matched means the
 * merchant picks.
 */

import { CATEGORIES } from '../data/seed-reference';
import { CATEGORY_TOPIC, rankTopics } from '../data/photo-library';
import { parseQuery } from '../search/parser';
import type { DealTypeCode, Vertical } from '../data/types';

export interface Classified {
  vertical: Vertical;
  /** A subcategory slug when one fits, else the vertical's own slug. */
  category_slug: string;
  deal_type_code: DealTypeCode;
  /** A group size the words give ("for 4", "family pack"), smallest and largest. */
  party: [number, number] | null;
}

/** Topic → subcategory: the library's map turned round, plus topics it does not name. */
const TOPIC_CATEGORY: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(CATEGORY_TOPIC)
      .filter(([slug]) => CATEGORIES.some((c) => c.slug === slug && c.parent_id !== null))
      .map(([slug, topic]) => [topic, slug]),
  ),
  breakfast: 'brunch',
  chai: 'cafe',
  cocktails: 'bar',
  wine: 'bar',
  spa: 'salon',
  nails: 'salon',
  yoga: 'fitness',
  trainer: 'fitness',
  plumber: 'repair',
  electrician: 'repair',
  pest: 'cleaning',
  laundry: 'cleaning',
  'car-wash': 'vehicle-care',
  'bike-service': 'vehicle-care',
  tyres: 'vehicle-care',
  scooter: 'bike-rental',
  bicycle: 'bike-rental',
  pottery: 'workshop',
  cooking: 'workshop',
  dance: 'classes',
  guitar: 'classes',
  'office-space': 'coworking',
  meeting: 'coworking',
  marketing: 'b2b',
};

/** The kind of deal, from how it is worded. First match wins. */
const DEAL_TYPE_WORDS: [RegExp, DealTypeCode][] = [
  [/\b(buy\s*\d+\s*get\s*\d+|bogo|b1g1|1\s*\+\s*1|one\s+plus\s+one)\b/, 'bxgy'],
  [/^\s*free\b/, 'free'],
  [/\b(flash|today only|limited time|next \d+ hours?)\b/, 'flash'],
  [/\b(happy hours?|weekdays?|weekends?|before \d|after \d)\b/, 'time_based'],
  [/\b(combo|bundle|meal for|family pack|platter|thali for|set of)\b/, 'bundle'],
  [/\b(package|membership|subscription|monthly|per month|pass|full service|annual)\b/, 'service_package'],
  [/\b(workshop|class|classes|tour|experience|session|trek|trip)\b/, 'experience'],
  [/\b(booking|appointment|reservation|book a|table for)\b/, 'booking'],
];

const STOP = new Set(
  'a an and the for with of in on at to from by our your my per off get buy any all only just new now best deal deals offer offers special price prices rs inr flat upto up save instead every needs need also very each usually normally was were are is it its this that these those have has had will would can could should rupees rupee bucks'.split(
    ' ',
  ),
);

/** Where an offering belongs, or null when the words say nothing we know. */
export function classifyOffering(text: string): Classified | null {
  const t = text.trim();
  if (t.length < 3) return null;
  const lower = t.toLowerCase();

  const parsed = parseQuery(t).filters;
  const [top] = rankTopics({ title: t });
  const topic = top && top.score >= 1 ? top.topic : null;

  let vertical: Vertical | null = null;
  let slug: string | null = null;

  // Renting a two-wheeler is mobility, not the garage that services one.
  if (/\b(rent|rental|rentals|hire)\b/.test(lower) && /\b(bikes?|scooty|scooter|activa|cycle|bicycle|enfield)\b/.test(lower)) {
    vertical = 'mobility';
    slug = 'bike-rental';
  }
  if (!vertical && parsed.category_slug) {
    const cat = CATEGORIES.find((c) => c.slug === parsed.category_slug);
    if (cat) {
      vertical = cat.vertical;
      slug = cat.slug;
    }
  }
  if (!vertical && topic) {
    vertical = topic.vertical;
    const sub = TOPIC_CATEGORY[topic.key];
    if (sub && CATEGORIES.some((c) => c.slug === sub && c.vertical === vertical)) slug = sub;
  }
  if (!vertical && parsed.vertical) vertical = parsed.vertical;
  if (!vertical) return null;

  const dealType = DEAL_TYPE_WORDS.find(([re]) => re.test(lower))?.[1] ?? 'discount';
  // The same reading customers' searches get, so "family pack for 4" meets "dinner for 4".
  const party: [number, number] | null =
    parsed.party_min != null ? [parsed.party_min, parsed.party_max ?? parsed.party_min] : null;
  return { vertical, category_slug: slug ?? vertical, deal_type_code: dealType, party };
}

/**
 * The words a deal is found by: the offering's own, and any the merchant
 * added (comma or space separated), lower case and without filler.
 */
export function keywordsFrom(...texts: string[]): string[] {
  const out = new Set<string>();
  for (const text of texts) {
    for (const part of text.toLowerCase().split(/[,;\n]+/)) {
      const phrase = part.trim();
      if (!phrase) continue;
      // A typed phrase stays whole too ("royal enfield"), as well as its words.
      if (phrase.includes(' ') && phrase.length <= 30 && texts.length > 1 && text === texts[texts.length - 1]) {
        out.add(phrase);
      }
      for (const w of phrase.split(/[^a-z0-9₹+-]+/)) {
        if (w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)) out.add(w);
      }
    }
  }
  return [...out].slice(0, 20);
}

/** "Food › Dinner", for showing the pick. */
export function categoryPath(slug: string | null): string {
  const cat = CATEGORIES.find((c) => c.slug === slug);
  if (!cat) return '';
  const parent = cat.parent_id ? CATEGORIES.find((c) => c.id === cat.parent_id) : null;
  return parent ? parent.name + ' › ' + cat.name : cat.name;
}
