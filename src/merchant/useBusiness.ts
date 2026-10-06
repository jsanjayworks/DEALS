/**
 * The business merchant mode is acting for.
 *
 * Membership comes from the viewer, the same business_members gate the
 * database applies. Re-read whenever the demo account changes.
 */

import { useCallback } from 'react';
import { db } from '../data';
import type { Business } from '../data/types';
import { useQuery } from '../lib/useQuery';
import { useViewer } from '../state/session';

export function useBusinessId(): string | null {
  return useViewer()?.business_ids[0] ?? null;
}

export function useBusiness(): { business: Business | null; loading: boolean; reload: () => void } {
  const id = useBusinessId();
  const fetchBusiness = useCallback(
    () => (id ? db.getBusiness(id) : Promise.resolve(null)),
    [id],
  );
  const { data, loading, reload } = useQuery(fetchBusiness);
  return { business: data ?? null, loading, reload };
}

/** Status buckets the merchant thinks in, rather than the eleven lifecycle states. */
export const BUCKETS = {
  live: { label: 'Live', statuses: ['ACTIVE', 'PAUSED'] },
  review: { label: 'In review', statuses: ['SUBMITTED', 'VERIFICATION', 'APPROVED', 'PUBLISHED'] },
  drafts: { label: 'Drafts', statuses: ['DRAFT', 'REJECTED'] },
  ended: { label: 'Ended', statuses: ['EXPIRED', 'COMPLETED', 'ARCHIVED'] },
} as const;

export type BucketKey = keyof typeof BUCKETS;

/**
 * Whether a deal belongs in a bucket. A deleted draft is archived without
 * ever having gone live; it is gone as far as the merchant is concerned.
 */
export function inBucket(deal: { status: string; published_at: string | null }, k: BucketKey): boolean {
  if (deal.status === 'ARCHIVED' && !deal.published_at) return false;
  return (BUCKETS[k].statuses as readonly string[]).includes(deal.status);
}
