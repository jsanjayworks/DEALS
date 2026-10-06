/**
 * Taste: what a customer is into, learned from what they do.
 *
 * Opening a deal counts 1, saving it 3, claiming, booking or buying it 5,
 * and every signal fades with age (it halves in about three weeks), so last
 * month's binge does not decide this week's Home. The result is a weight per
 * category and per tag; a deal's affinity is how well its category and tags
 * line up with them.
 *
 * Mirrors my_taste() and feed_for_you() in 0009_smart_search_and_taste.sql;
 * the local adapter uses it so the demo learns the same way.
 */

import type { TasteItem } from '../data/api';

export const SIGNAL_WEIGHT = { view: 1, save: 3, action: 5 } as const;
/** Days for a signal to fall to 1/e of its weight. */
const DECAY_DAYS = 30;

export interface TasteSignal {
  kind: keyof typeof SIGNAL_WEIGHT;
  at: number;
  categorySlug: string;
  categoryName: string;
  tags: string[];
}

export function computeTaste(signals: TasteSignal[], now: number = Date.now()): TasteItem[] {
  const cats = new Map<string, TasteItem>();
  const tags = new Map<string, TasteItem>();
  for (const s of signals) {
    const ageDays = Math.max(0, (now - s.at) / 86_400_000);
    const w = SIGNAL_WEIGHT[s.kind] * Math.exp(-ageDays / DECAY_DAYS);
    const c = cats.get(s.categorySlug) ?? {
      kind: 'category' as const,
      key: s.categorySlug,
      label: s.categoryName,
      weight: 0,
    };
    c.weight += w;
    cats.set(s.categorySlug, c);
    for (const t of s.tags) {
      const item = tags.get(t) ?? { kind: 'tag' as const, key: t, label: t, weight: 0 };
      item.weight += w;
      tags.set(t, item);
    }
  }
  return [...cats.values(), ...tags.values()].sort((a, b) => b.weight - a.weight).slice(0, 60);
}

/** 0..1: the deal's category counts 60%, its tags 40%. */
export function tasteAffinity(
  deal: { category: { slug: string }; tags: string[] },
  taste: TasteItem[],
): number {
  let catMax = 0;
  let tagMax = 0;
  for (const t of taste) {
    if (t.kind === 'category') catMax = Math.max(catMax, t.weight);
    else tagMax = Math.max(tagMax, t.weight);
  }
  const cat = taste.find((t) => t.kind === 'category' && t.key === deal.category.slug)?.weight ?? 0;
  const tagSum = taste
    .filter((t) => t.kind === 'tag' && deal.tags.includes(t.key))
    .reduce((sum, t) => sum + t.weight, 0);
  return (
    0.6 * (catMax > 0 ? cat / catMax : 0) + 0.4 * Math.min(tagMax > 0 ? tagSum / tagMax : 0, 1)
  );
}

/** The share of a For-you rank that is taste; the rest is the usual score. */
export const TASTE_SHARE = 0.65;
