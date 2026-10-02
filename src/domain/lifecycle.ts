/**
 * The deal lifecycle, mirrored from the deal_transitions table seeded in
 * 0001_init.sql. The database is the authority; this copy exists so the UI can
 * grey out an impossible action before a round trip, and so the local adapter
 * enforces the same rules with no database at all.
 *
 * Keep the two in step: a row added there needs a line added here.
 */

import type { DealStatus } from '../data/types';

export type Actor = 'merchant' | 'admin' | 'system';

export interface Transition {
  from: DealStatus;
  to: DealStatus;
  actor: Actor;
}

export const TRANSITIONS: readonly Transition[] = [
  { from: 'DRAFT', to: 'SUBMITTED', actor: 'merchant' },
  { from: 'SUBMITTED', to: 'VERIFICATION', actor: 'admin' },
  { from: 'SUBMITTED', to: 'APPROVED', actor: 'admin' },
  { from: 'SUBMITTED', to: 'REJECTED', actor: 'admin' },
  { from: 'VERIFICATION', to: 'APPROVED', actor: 'admin' },
  { from: 'VERIFICATION', to: 'REJECTED', actor: 'admin' },
  { from: 'REJECTED', to: 'DRAFT', actor: 'merchant' },
  { from: 'APPROVED', to: 'PUBLISHED', actor: 'system' },
  { from: 'APPROVED', to: 'PUBLISHED', actor: 'admin' },
  { from: 'PUBLISHED', to: 'ACTIVE', actor: 'system' },
  { from: 'ACTIVE', to: 'PAUSED', actor: 'merchant' },
  { from: 'ACTIVE', to: 'PAUSED', actor: 'admin' },
  { from: 'PAUSED', to: 'ACTIVE', actor: 'merchant' },
  { from: 'PAUSED', to: 'ACTIVE', actor: 'admin' },
  { from: 'ACTIVE', to: 'EXPIRED', actor: 'system' },
  { from: 'PUBLISHED', to: 'EXPIRED', actor: 'system' },
  { from: 'PAUSED', to: 'EXPIRED', actor: 'system' },
  { from: 'EXPIRED', to: 'COMPLETED', actor: 'system' },
  { from: 'COMPLETED', to: 'ARCHIVED', actor: 'admin' },
  { from: 'COMPLETED', to: 'ARCHIVED', actor: 'system' },
  { from: 'EXPIRED', to: 'ARCHIVED', actor: 'admin' },
  { from: 'DRAFT', to: 'ARCHIVED', actor: 'merchant' },
] as const;

export function canTransition(from: DealStatus, to: DealStatus, actor: Actor): boolean {
  return TRANSITIONS.some((t) => t.from === from && t.to === to && t.actor === actor);
}

/** What this actor is allowed to do next — drives enabled buttons. */
export function nextStatuses(from: DealStatus, actor: Actor): DealStatus[] {
  return TRANSITIONS.filter((t) => t.from === from && t.actor === actor).map((t) => t.to);
}

/** Only DRAFT and REJECTED are editable by the merchant. */
export function isEditable(status: DealStatus): boolean {
  return status === 'DRAFT' || status === 'REJECTED';
}

/** Statuses a customer can ever see. */
export function isPubliclyVisible(status: DealStatus): boolean {
  return status === 'ACTIVE' || status === 'PUBLISHED';
}

/** The ordered timeline shown on the merchant deal screen. */
export const LIFECYCLE_ORDER: readonly DealStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'VERIFICATION',
  'APPROVED',
  'PUBLISHED',
  'ACTIVE',
  'PAUSED',
  'EXPIRED',
  'COMPLETED',
  'ARCHIVED',
] as const;

export const STATUS_LABEL: Record<DealStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  VERIFICATION: 'In Verification',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  PUBLISHED: 'Published',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  EXPIRED: 'Expired',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

// Status colour is a presentation concern and lives with the components:
// see TONE_BY_LABEL in src/components/Badges.tsx. Keeping it out of here stops
// the domain layer from depending on the theme.
