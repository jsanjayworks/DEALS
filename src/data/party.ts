/**
 * Group deals: a deal can say how many people it is for, in
 * attributes.party_min and attributes.party_max ("Biryani Feast for 5" is for
 * 4 to 6). A search for a group matches a deal when the two ranges overlap,
 * so "4-5 people" finds the feast for 4–6 and the platter for 3–5, and not
 * the brunch for two.
 */

/** A deal's group size, when it declares one. */
export function dealParty(attributes: Record<string, unknown>): [number, number] | null {
  const min = Number(attributes.party_min);
  const max = Number(attributes.party_max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min) return null;
  return [min, max];
}

/** Does a deal for `deal` people suit a group of min..max (either end open)? */
export function partyFits(
  deal: [number, number] | null,
  min: number | null,
  max: number | null,
): boolean {
  if (min == null && max == null) return true;
  if (!deal) return false;
  return deal[0] <= (max ?? 99) && deal[1] >= (min ?? 1);
}

/** "For 2 people", "For 4–6 people"; short: "For 4–6". */
export function partyLabel(p: [number, number], short = false): string {
  const n = p[0] === p[1] ? String(p[0]) : p[0] + '–' + p[1];
  if (short) return 'For ' + n;
  return 'For ' + n + (p[1] === 1 ? ' person' : ' people');
}

/** The chip for a group filter: "2 people", "4–5 people", "6+ people". */
export function partyFilterLabel(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (max == null) return (min ?? 1) + '+ people';
  if (min == null || min === max) return max === 1 ? 'Just me' : max + ' people';
  return min + '–' + max + ' people';
}

/** The "Who's going" choices in the filter sheet. */
export const PARTY_OPTIONS: readonly { label: string; min: number; max: number | null }[] = [
  { label: 'Just me', min: 1, max: 1 },
  { label: '2', min: 2, max: 2 },
  { label: '3–4', min: 3, max: 4 },
  { label: '5–6', min: 5, max: 6 },
  { label: '7+', min: 7, max: null },
];
