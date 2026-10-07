/**
 * What the demo businesses need to read like places on District or Zomato,
 * worked out from what they already have: a menu from their deals, photos
 * from their deals and the photo library, hours from when their deals run,
 * a cost for two from their prices, cuisines, amenities that fit their
 * kind of business, and a handful of reviews that agree with their rating.
 *
 * Deterministic: the same business always gets the same extras.
 */

import { CATEGORIES } from './seed-reference';
import { matchPhoto } from './photo-library';
import type { Business, Deal, MenuItem, Review } from './types';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const pick = <T,>(xs: readonly T[], seed: number): T => xs[seed % xs.length];

const AMENITIES_BY_CATEGORY: Record<string, string[]> = {
  bar: ['serves_alcohol', 'live_music', 'outdoor_seating', 'card_payment'],
  dinner: ['family_friendly', 'ac', 'parking', 'card_payment'],
  lunch: ['family_friendly', 'ac', 'card_payment'],
  brunch: ['outdoor_seating', 'wifi', 'pet_friendly', 'card_payment'],
  cafe: ['wifi', 'ac', 'card_payment'],
  food: ['family_friendly', 'card_payment'],
  fitness: ['ac', 'parking', 'card_payment'],
  salon: ['ac', 'card_payment'],
  facials: ['ac', 'card_payment'],
  makeup: ['ac', 'card_payment'],
  coworking: ['wifi', 'ac', 'parking', 'card_payment'],
  retail: ['parking', 'card_payment', 'wheelchair'],
  fashion: ['parking', 'card_payment', 'wheelchair', 'ac'],
};

export function enrichBusinesses(businesses: Business[], deals: Deal[]): void {
  for (const b of businesses) {
    if (b.menu) continue;
    const own = deals.filter((d) => d.business_id === b.id);
    const cat = CATEGORIES.find((c) => c.id === b.primary_category_id);
    const top = cat?.parent_id ? CATEGORIES.find((c) => c.id === cat.parent_id) : cat;
    const food = top?.vertical === 'food';
    const h = hash(b.id);

    b.menu = own.slice(0, 8).map<MenuItem>((d) => ({
      name: d.title,
      price: d.deal_price,
      description: d.short_description || null,
      veg: food ? /\b(veg|paneer|dosa|idli|thali|coffee|chai|salad|pizza)\b/i.test(d.title) && !/\b(chicken|mutton|fish|egg|prawn)\b/i.test(d.title) : null,
      photo: d.image,
    }));

    const extra = [0, 1, 2].map((i) =>
      matchPhoto({ id: b.id + '-' + i, title: (cat?.name ?? '') + ' ' + b.name, categorySlug: cat?.slug, vertical: top?.vertical }),
    );
    b.photos = [...new Set([...own.map((d) => d.image), ...extra])].slice(0, 8);

    const starts = own.map((d) => d.availability?.start_time).filter(Boolean) as string[];
    const ends = own.map((d) => d.availability?.end_time).filter(Boolean) as string[];
    b.open_time = starts.length ? starts.sort()[0].slice(0, 5) : '10:00';
    b.close_time = ends.length ? ends.sort().slice(-1)[0].slice(0, 5) : '21:00';

    // A meal for one, doubled: monthly plans and group packs would inflate it.
    const meals = own
      .filter((d) => !d.price_unit && !(typeof d.attributes?.party_min === 'number' && d.attributes.party_min > 2))
      .map((d) => d.deal_price)
      .filter((p): p is number => p != null && p > 0)
      .sort((x, y) => x - y);
    const median = meals.length ? meals[Math.floor(meals.length / 2)] : 0;
    b.cost_for_two = food && median ? Math.max(200, Math.round(Math.min(median * 2, 3000) / 50) * 50) : null;

    b.cuisines = food
      ? [...new Set(own.map((d) => d.attributes?.cuisine).filter((c): c is string => typeof c === 'string'))]
      : [];

    const base = AMENITIES_BY_CATEGORY[cat?.slug ?? ''] ?? AMENITIES_BY_CATEGORY[top?.slug ?? ''] ?? ['card_payment'];
    // Rooftops, outdoor seating and pure veg are for places people eat and drink at.
    const possible = food ? ['parking', 'wheelchair', 'outdoor_seating', 'pure_veg', 'rooftop'] : ['parking', 'wheelchair'];
    const extras = possible.filter(
      (a, i) => !base.includes(a) && (h >>> i) % 3 === 0 && (a !== 'pure_veg' || !/meat|biryani|kebab|chicken|tandoor|sushi|bbq|grill/i.test(b.name)),
    );
    b.amenities = [...base, ...extras];
    if (/\b(sky|roof|terrace|toit)\b/i.test(b.name)) b.amenities.push('rooftop');
    if (food && b.cuisines.includes('South Indian') && h % 2 === 0 && !b.amenities.includes('pure_veg')) b.amenities.push('pure_veg');
  }
}

// ---------------------------------------------------------------- reviews ----

const NAMES = [
  'Ananya R', 'Rahul M', 'Fatima S', 'Karthik I', 'Sneha P', 'Arjun N', 'Divya S', 'Vikram R', 'Meghna D',
  'Rohan K', 'Priya H', 'Imran K', 'Kavya G', 'Nikhil J', 'Shreya B', 'Aditya V', 'Pooja M', 'Sameer A',
];

const GOOD: Record<string, string[]> = {
  food: [
    'Portions were generous and everything came out hot. The deal is genuinely good value.',
    'Came with family on a weekend, staff were quick even when it was full. Will be back.',
    'Tasted exactly like home. The code worked at the counter without any fuss.',
    'Great flavours and clean place. Showed the QR and they applied the offer straight away.',
  ],
  services: [
    'On time, professional and friendly. Booking through the app was smooth.',
    'Really happy with the result, and the price was much less than usual.',
    'Clean place, good hygiene, and they did not push any extras. Recommended.',
  ],
  retail: ['Good stock and helpful staff. The deal applied at billing without arguments.', 'Exactly what was listed. Easy pickup.'],
  mobility: ['Driver was on time and polite. Fair price compared to the usual apps.', 'Smooth booking and the bike was in good condition.'],
  events: ['Loved the session, well organised and worth every rupee.', 'Fun evening with friends. Entry with the code was quick.'],
  property: ['Owner was responsive and the place matched the photos.', 'Visited the same day I enquired. Genuine listing.'],
  business: ['Quiet, fast Wi-Fi and good coffee. Good for a work day.', 'Professional service and on time delivery.'],
};
const OKAY = [
  'Decent, but it was crowded and we waited a bit. The offer itself was fine.',
  'Good overall, though parking was a struggle on a Friday evening.',
  'Nice experience. Would be five stars if the service were a little faster.',
];
const MEH = ['Average this time. The deal was honoured but the experience could be better.'];

/** Between three and six reviews per business, with stars that average near its rating. */
export function seedReviews(businesses: Business[], deals: Deal[], now: number = Date.now()): Review[] {
  const out: Review[] = [];
  for (const b of businesses) {
    const own = deals.filter((d) => d.business_id === b.id);
    if (own.length === 0) continue;
    const cat = CATEGORIES.find((c) => c.id === b.primary_category_id);
    const vertical = cat?.vertical ?? 'food';
    const good = GOOD[vertical] ?? GOOD.food;
    const h = hash(b.id);
    const n = 3 + (h % 4);
    for (let i = 0; i < n; i++) {
      const r = hash(b.id + ':' + i);
      // Mostly 5s and 4s, more 3s for lower-rated places.
      const roll = (r % 100) / 100;
      const rating = roll < (b.rating_avg - 3.6) / 1.4 ? 5 : roll < 0.85 ? 4 : roll < 0.97 ? 3 : 2;
      const body = rating >= 4 ? pick(good, r >>> 3) : rating === 3 ? pick(OKAY, r >>> 3) : pick(MEH, r >>> 3);
      const deal = own[r % own.length];
      out.push({
        id: 'rev-seed-' + b.id + '-' + i,
        deal_id: deal.id,
        deal_title: deal.title,
        business_id: b.id,
        customer_id: 'usr-seed-' + (r % 37),
        customer_name: pick(NAMES, r >>> 5),
        rating,
        body,
        created_at: new Date(now - (1 + (r % 60)) * 86_400_000 - (r % 86_400) * 1000).toISOString(),
        action_id: null,
      });
    }
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
