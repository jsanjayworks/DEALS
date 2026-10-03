/**
 * Subheadings for a category page, built from data rather than written into
 * the screen.
 *
 * Two sources, both owned by the backend:
 *   1. The taxonomy: a top-level category's children (Salon, Makeup, Home
 *      Cleaning under Services).
 *   2. Facet attributes: properties marked x-facet in the category's
 *      attribute_schema (cuisine under Food, BHK under Property, vehicle under
 *      Mobility), with values taken from the deals actually live nearby.
 *
 * So a new subcategory row, or a deal tagged with a new cuisine, shows up on
 * the page with no app release. Each subheading carries the exact
 * SearchFilters patch that selects it, which search_deals already honours.
 */

import type { Category, DealCardModel, SearchFilters, Vertical } from '../data/types';

export interface Subhead {
  id: string;
  label: string;
  count: number;
  patch: Pick<Partial<SearchFilters>, 'category_slug' | 'attributes'>;
}

export interface SubheadGroup {
  /** "type" for the taxonomy row, else the attribute key. */
  key: string;
  title: string;
  items: Subhead[];
}

export function topCategory(categories: readonly Category[], vertical: Vertical): Category | undefined {
  return categories.find((c) => c.parent_id === null && c.vertical === vertical);
}

export function subheadGroups(
  categories: readonly Category[],
  vertical: Vertical,
  deals: readonly DealCardModel[],
): SubheadGroup[] {
  const top = topCategory(categories, vertical);
  if (!top) return [];
  const groups: SubheadGroup[] = [];

  // 1. Subcategories. Ones with nothing live nearby still show, last, so the
  // shape of the category is visible even on a quiet day.
  const leaves = categories.filter((c) => c.parent_id === top.id);
  if (leaves.length > 0) {
    groups.push({
      key: 'type',
      title: 'Browse',
      items: leaves
        .map((c) => ({
          id: 'cat:' + c.slug,
          label: c.name,
          count: deals.filter((d) => d.category.slug === c.slug).length,
          patch: { category_slug: c.slug },
        }))
        .sort((a, b) => Number(b.count > 0) - Number(a.count > 0)),
    });
  }

  // 2. Facet attributes, one row each, values from live deals only.
  for (const [key, spec] of Object.entries(top.attribute_schema?.properties ?? {})) {
    if (!spec['x-facet']) continue;
    const seen = new Map<string, { value: string | number; count: number }>();
    for (const d of deals) {
      const v = d.attributes[key];
      if (v == null || v === '' || typeof v === 'boolean') continue;
      const k = String(v);
      seen.set(k, { value: v, count: (seen.get(k)?.count ?? 0) + 1 });
    }
    if (seen.size === 0) continue;

    const numeric = spec.type === 'integer' || spec.type === 'number';
    const items = [...seen.values()]
      .sort((a, b) =>
        numeric ? Number(a.value) - Number(b.value) : b.count - a.count || String(a.value).localeCompare(String(b.value)),
      )
      .map(({ value, count }) => ({
        id: 'attr:' + key + ':' + value,
        label: spec['x-label'] ? spec['x-label'].replace('{value}', String(value)) : String(value),
        count,
        // The value keeps its JSON type: search_deals matches with jsonb @>,
        // where 2 and "2" are different.
        patch: { attributes: { [key]: value } },
      }));
    groups.push({ key, title: spec.title ?? key, items });
  }

  return groups;
}
