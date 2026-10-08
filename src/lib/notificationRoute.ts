/**
 * Where a notification takes its reader, shared by the Notifications screen
 * and the live alert that pops up when one arrives: a merchant's deal in the
 * merchant view, a customer's in the deal page, a reply in Help.
 */

import { router } from 'expo-router';
import type { Notification } from '../data/types';

/** Notes about a merchant's own deals and orders. */
export const MERCHANT_KINDS = new Set<Notification['kind']>([
  'deal_approved',
  'deal_rejected',
  'deal_paused',
  'new_claim',
  'new_review',
  'order_cancelled',
]);

export function openNotification(n: Notification): void {
  const dealId = typeof n.data.deal_id === 'string' ? n.data.deal_id : null;
  if (MERCHANT_KINDS.has(n.kind) && dealId) {
    router.push({ pathname: '/merchant/deal/[id]', params: { id: dealId } });
  } else if (n.kind === 'review_needed') {
    router.push('/admin');
  } else if (n.kind === 'verification_needed') {
    router.push('/admin/businesses');
  } else if (n.kind === 'rate_visit') {
    router.push({ pathname: '/my-deals', params: { tab: 'past' } });
  } else if (n.kind === 'business_verified' || n.kind === 'business_rejected') {
    router.push('/merchant');
  } else if (n.kind === 'support_reply') {
    const ticket = typeof n.data.ticket_id === 'string' ? n.data.ticket_id : undefined;
    router.push({ pathname: '/account/help', params: ticket ? { ticket } : {} });
  } else if (dealId) {
    router.push({ pathname: '/deal/[id]', params: { id: dealId, from: 'notification' } });
  }
}

// ------------------------------------------------------------ live events --

const live = new Set<(n: Notification) => void>();

/** Screens that show orders refresh when a notification arrives (new booking, cancellation). */
export function onLiveNotification(cb: (n: Notification) => void): () => void {
  live.add(cb);
  return () => {
    live.delete(cb);
  };
}

export function emitLiveNotification(n: Notification): void {
  live.forEach((cb) => cb(n));
}
