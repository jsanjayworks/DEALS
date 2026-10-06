/**
 * Stock photos for deals that have none of their own, chosen to show what
 * the deal is: a kebab plate gets kebabs, a car wash gets a car being washed,
 * never a generic picture for the category.
 *
 * The library (photo-library-data.ts) is a set of topics, each with the words
 * that call for it and a few free Unsplash photos that were looked at one by
 * one. matchPhoto() scores every topic against the deal's title, tags,
 * description and category, and takes the best; the deal's id picks one of
 * that topic's photos, so two kebab deals do not look identical.
 *
 * Merchants can upload their own photo or search this library in the deal
 * wizard; the importer uses the same match for deals that arrive without one.
 */

import type { Vertical } from './types';
import { PHOTO_TOPICS, type PhotoTopic } from './photo-library-data';

export { PHOTO_TOPICS, type PhotoTopic };

export function photoUrl(id: string, w = 800, h = 600): string {
  return 'https://images.unsplash.com/photo-' + id + '?w=' + w + '&h=' + h + '&fit=crop&q=70&auto=format';
}

/** Words too broad to choose a photo on their own: "chicken" could be curry, kebab or wings. */
const BROAD = new Set([
  'chicken', 'veg', 'non-veg', 'bar', 'party', 'group', 'night', 'music', 'bike', 'bikes', 'car', 'ride',
  'rides', 'lunch', 'dinner', 'meals', 'class', 'classes', 'workshop', 'festival', 'family', 'friends',
  'sharing', 'platter', 'room', 'rooms', 'rent', 'shop', 'print', 'digital', 'design', 'health',
  'checkup', 'kids', 'games', 'play', 'curry', 'bowl', 'healthy', 'snacks', 'snack', 'drinks', 'cafe',
  'breakfast', 'trip', 'outdoor', 'hair', 'skin', 'glow', 'art', 'talk', 'coach', 'jacket', 'gloves',
  'membership', 'strength', 'sports', 'beauty', 'decor', 'chair', 'audio', 'camera', 'baked', 'gold',
  'feast', 'buffet', 'mechanic', 'garage', 'oil change', 'chain', 'combo',
]);

/** The topic for a category when nothing in the deal's words decides it. */
export const CATEGORY_TOPIC: Record<string, string> = {
  food: 'feast', lunch: 'thali', brunch: 'pancakes', cafe: 'coffee', dinner: 'dinner', bar: 'beer',
  retail: 'fashion', fashion: 'fashion', electronics: 'electronics', grocery: 'grocery',
  events: 'concert', comedy: 'comedy', music: 'concert', nightlife: 'nightlife', workshop: 'painting',
  classes: 'classroom', volunteer: 'volunteer',
  mobility: 'cab', cab: 'cab', 'bike-rental': 'motorcycle',
  property: 'apartment', rent: 'apartment', villa: 'villa', coliving: 'pg-room',
  services: 'spa', salon: 'haircut', makeup: 'makeup', facials: 'facial', cleaning: 'cleaning',
  repair: 'ac-repair', fitness: 'gym', 'vehicle-care': 'car-service',
  business: 'coworking', coworking: 'coworking', b2b: 'printing',
  community: 'volunteer',
};

export interface PhotoQuery {
  /** Varies the pick between equally good photos; the deal id, or anything stable. */
  id?: string;
  title: string;
  tags?: string[];
  description?: string | null;
  categorySlug?: string | null;
  categoryName?: string | null;
  vertical?: Vertical | null;
}

// Hyphens become spaces on both sides, so "cold-pressed" meets "cold pressed".
const norm = (s: string) =>
  ' ' + s.toLowerCase().replace(/[^a-z0-9%+]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';

/**
 * The part of a title that names the main thing: up to the first "and",
 * "with", comma or colon that follows a match. "Masala Dosa and Filter
 * Coffee" is a dosa deal; "Mutton Biryani" is biryani, the last word of the
 * name (Indian dish names put the dish last).
 */
const SPLIT = /\s(?:and|with|plus|&|\+)\s|[,:|·]\s/;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Every topic with a score for this deal, best first. Zero means no word matched. */
export function rankTopics(q: PhotoQuery): { topic: PhotoTopic; score: number }[] {
  const title = norm(q.title);
  const segments = q.title.split(SPLIT).map(norm);
  const tags = norm((q.tags ?? []).join(' '));
  const rest = norm(
    [q.description ?? '', q.categoryName ?? '', (q.categorySlug ?? '').replace(/-/g, ' ')].join(' '),
  );
  const has = (text: string, word: string) =>
    text.includes(' ' + word + ' ') || text.includes(' ' + word + 's ') || text.includes(' ' + word + 'es ');
  const preferred = q.categorySlug ? CATEGORY_TOPIC[q.categorySlug] : undefined;

  const scored = PHOTO_TOPICS.map((topic) => {
    let score = 0;
    for (const raw of topic.tags) {
      const word = norm(raw).trim();
      const w = BROAD.has(raw) ? 0.4 : 1;
      if (has(title, word)) score += 3 * w;
      else if (has(tags, word)) score += 2 * w;
      else if (has(rest, word)) score += w;
    }
    // A word from another vertical ("bar" for a gym) counts for less.
    if (q.vertical && topic.vertical !== q.vertical) score *= 0.7;
    if (score > 0 && preferred === topic.key) score += 0.5;
    return { topic, score };
  });

  // The main thing named first wins a near tie, and within it the last word.
  const lead = segments.find((seg) =>
    scored.some((s) => s.score > 0 && s.topic.tags.some((t) => !BROAD.has(t) && has(seg, norm(t).trim()))),
  );
  if (lead) {
    let lastAt = -1;
    let last: (typeof scored)[number] | null = null;
    for (const s of scored) {
      const at = Math.max(
        ...s.topic.tags.filter((t) => !BROAD.has(t)).map((t) => lead.lastIndexOf(' ' + norm(t).trim())),
      );
      if (at >= 0) {
        s.score += 1;
        if (at > lastAt) {
          lastAt = at;
          last = s;
        }
      }
    }
    if (last) last.score += 0.3;
  }
  return scored.sort((a, b) => b.score - a.score);
}

function fallbackTopic(q: PhotoQuery): PhotoTopic {
  const key =
    (q.categorySlug && CATEGORY_TOPIC[q.categorySlug]) || (q.vertical && CATEGORY_TOPIC[q.vertical]) || 'feast';
  return PHOTO_TOPICS.find((t) => t.key === key) ?? PHOTO_TOPICS[0];
}

/** The photo id that best shows this deal. */
export function matchPhotoId(q: PhotoQuery): string {
  const [best] = rankTopics(q);
  const topic = best && best.score > 0 ? best.topic : fallbackTopic(q);
  return topic.photos[hash(q.id ?? q.title) % topic.photos.length];
}

export function matchPhoto(q: PhotoQuery, w?: number, h?: number): string {
  return photoUrl(matchPhotoId(q), w, h);
}

export interface LibraryHit {
  id: string;
  url: string;
  topic: string;
}

/**
 * The library search in the deal wizard. Words rank topics the same way a
 * title does; with no words, the category's own topics come first.
 */
export function searchLibrary(text: string, vertical?: Vertical | null, limit = 24): LibraryHit[] {
  const words = text.trim();
  let topics: PhotoTopic[];
  if (words) {
    topics = rankTopics({ title: words, vertical: vertical ?? null })
      .filter((r) => r.score > 0)
      .map((r) => r.topic);
    const loose = norm(words);
    for (const t of PHOTO_TOPICS) {
      if (!topics.includes(t) && loose.includes(' ' + t.key.replace(/-/g, ' ') + ' ')) topics.push(t);
    }
  } else {
    topics = PHOTO_TOPICS.filter((t) => !vertical || t.vertical === vertical);
  }
  const out: LibraryHit[] = [];
  for (const t of topics) {
    for (const id of t.photos) {
      if (out.some((o) => o.id === id)) continue;
      out.push({ id, url: photoUrl(id), topic: t.key });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** True for a photo from this library (as opposed to the merchant's own). */
export function isLibraryPhoto(url: string | null | undefined): boolean {
  return !!url && url.startsWith('https://images.unsplash.com/photo-');
}
