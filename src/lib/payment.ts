/**
 * The demo's mock payment. No money moves: checkout records what a payment
 * gateway would hand back (method, amount, an order id) on the customer
 * action's payload, so My Deals and the merchant's orders can show it, and a
 * real gateway can later fill the same fields.
 */

import type { CustomerActionType, DealCardModel } from '../data/types';

export type PayMethod = 'upi' | 'card' | 'netbanking';

export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Net banking',
};

export interface MockPayment {
  status: 'paid';
  method: PayMethod;
  amount: number;
  currency: 'INR';
  order_id: string;
  paid_at: string;
  mock: true;
}

/** Every priced deal is paid at checkout; free deals and enquiries are not. */
export function needsPayment(deal: Pick<DealCardModel, 'deal_price'>, actionType: CustomerActionType): boolean {
  return actionType !== 'enquiry' && (deal.deal_price ?? 0) > 0;
}

/** "ORD-K7M2QX": short enough to read out at the counter. */
export function newOrderId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'ORD-' + s;
}

/** The payment on an order, or null for a free claim or pay-at-store. */
export function paymentOf(action: { payload?: Record<string, unknown> | null }): MockPayment | null {
  const p = action.payload?.payment as Partial<MockPayment> | undefined;
  return p && p.status === 'paid' && typeof p.amount === 'number' ? (p as MockPayment) : null;
}
