/**
 * Does what was asked. A search lands on Results, a screen opens, a booking
 * opens the deal with the booking sheet already set to the day, time and
 * party size they said, and a job (best for me, my usual, savings, cancel,
 * today's summary…) comes back as an answer for the sheet to show.
 */

import { router, type Href } from 'expo-router';
import { findDeal } from '../assistant/find';
import { runJob, type Answer, type JobContext } from '../assistant/jobs';
import type { CustomerIntent, Screen } from './types';

const SCREEN_ROUTE: Record<Screen, Href> = {
  home: '/',
  search: '/search',
  my_deals: '/my-deals',
  saved: { pathname: '/my-deals', params: { tab: 'saved' } },
  notifications: '/notifications',
  profile: '/profile',
  help: '/account/help',
  order_history: '/account/history',
  vehicle: '/vehicle',
  merchant_dashboard: '/merchant',
  merchant_bookings: '/merchant/bookings',
  merchant_redeem: '/merchant/redeem',
  merchant_new_deal: '/merchant/new',
  merchant_deals: '/merchant/deals',
  merchant_insights: '/merchant/insights',
};

export type Outcome = { kind: 'done' } | { kind: 'answer'; answer: Answer } | { kind: 'none' };

const DONE: Outcome = { kind: 'done' };
const NONE: Outcome = { kind: 'none' };

/** Runs the intent: it went somewhere, it has an answer to show, or nothing fitted. */
export async function runIntent(intent: CustomerIntent, ctx: JobContext): Promise<Outcome> {
  const answer = await runJob(intent, ctx);
  if (answer) return { kind: 'answer', answer };

  switch (intent.kind) {
    case 'go': {
      if (!intent.screen) return NONE;
      router.push(SCREEN_ROUTE[intent.screen]);
      return DONE;
    }
    case 'search': {
      const q = (intent.query ?? intent.heard ?? '').trim();
      if (!q) return NONE;
      // VoiceHost has recorded what was said; Results need not count it again as a typed search.
      router.push({ pathname: '/results', params: { q, from: 'voice' } });
      return DONE;
    }
    case 'open_business': {
      if (!intent.business) return NONE;
      const deal = await findDeal(intent.business, null, ctx.origin, false);
      if (deal) router.push({ pathname: '/shop/[id]', params: { id: deal.business.id } });
      else router.push({ pathname: '/results', params: { q: intent.business, from: 'voice' } });
      return DONE;
    }
    case 'book': {
      const deal = await findDeal(intent.business, intent.query, ctx.origin, true);
      if (!deal) {
        const q = [intent.query, intent.business].filter(Boolean).join(' ');
        if (!q) return NONE;
        router.push({ pathname: '/results', params: { q, from: 'voice' } });
        return DONE;
      }
      router.push({
        pathname: '/deal/[id]',
        params: {
          id: deal.id,
          take: '1',
          ...(intent.date ? { day: intent.date } : {}),
          ...(intent.time ? { time: intent.time } : {}),
          ...(intent.people ? { qty: String(intent.people) } : {}),
        },
      });
      return DONE;
    }
    default:
      return NONE;
  }
}
