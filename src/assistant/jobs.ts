/**
 * The assistant's jobs: what it does with a request instead of only opening
 * a screen. Each returns an Answer for the voice sheet, from the person's own
 * orders, with buttons that act. Anything that changes something (cancel,
 * pause, redeem) asks for one tap to confirm first.
 */

import { router, type Href } from 'expo-router';
import { db } from '../data';
import type { ActionWithDeal } from '../data/api';
import type { DealCardModel, LatLng } from '../data/types';
import { amenityLabel } from '../data/amenities';
import { timeLabel } from '../lib/format';
import { istClock, openNow } from '../lib/hours';
import { paymentOf } from '../lib/payment';
import { distanceLabel, inr } from '../theme/tokens';
import type { IconName } from '../components';
import type { CustomerIntent } from '../voice/types';
import { findDeal, nextOnLabel, orderableNow, takesBookings } from './find';
import {
  dealMatches,
  isLiveDeal,
  matchScore,
  loadHistory,
  sameBusiness,
  savedOn,
  timesLabel,
  whenLabel,
  type History,
} from './history';
import { picksFor, type Pick } from './recommend';

export interface AnswerAction {
  label: string;
  tone?: 'cta' | 'secondary' | 'danger';
  icon?: IconName;
  /** A new answer to show, or 'close' once it has taken them somewhere. */
  run: () => Promise<Answer | 'close'> | Answer | 'close';
}

/** A code or booking they hold, as the answer lists it. */
export interface AnswerCode {
  deal: DealCardModel;
  code: string | null;
  when: string;
}

export interface Answer {
  title: string;
  /** A finished action: shows a tick. */
  done?: boolean;
  stats?: { label: string; value: string; highlight?: boolean }[];
  lines?: (string | null)[];
  picks?: Pick[];
  codes?: AnswerCode[];
  /** Small print at the end. */
  note?: string;
  actions?: AnswerAction[];
}

export interface JobContext {
  origin: LatLng;
  signedIn: boolean;
  /** The business an owner is acting for, on merchant screens. */
  businessId: string | null;
}

// ------------------------------------------------------------- helpers ----

const go = (href: Href): 'close' => {
  router.push(href);
  return 'close';
};

/** The deal page; with `take` the checkout opens straight away. */
export const openDeal = (deal: DealCardModel, take = false, quantity = 1): 'close' =>
  go({
    pathname: '/deal/[id]',
    params: { id: deal.id, ...(take ? { take: '1' } : {}), ...(take && quantity > 1 ? { qty: String(quantity) } : {}) },
  });

const signIn = (title: string, why: string): Answer => ({
  title,
  lines: [why],
  actions: [{ label: 'Sign in', tone: 'cta', icon: 'user', run: () => go('/sign-in') }],
});

/** "Today, 8 PM", "Tomorrow, 7:30 PM", "Sat 12 Oct, 8 PM"; or "Use by 15 Oct". */
function whenOf(a: ActionWithDeal, now: number = Date.now()): string {
  if (a.slot_start) {
    const t = new Date(a.slot_start).getTime();
    const ist = new Date(t + 330 * 60_000);
    const hhmm = String(ist.getUTCHours()).padStart(2, '0') + ':' + String(ist.getUTCMinutes()).padStart(2, '0');
    const d = Math.floor((t + 330 * 60_000) / 86_400_000) - Math.floor((now + 330 * 60_000) / 86_400_000);
    const day =
      d === 0
        ? 'Today'
        : d === 1
          ? 'Tomorrow'
          : new Date(t).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
    return day + ', ' + timeLabel(hhmm);
  }
  return 'Use by ' + new Date(a.deal.ends_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

// ------------------------------------------------------------ customer ----

export async function recommend(query: string | null, ctx: JobContext, history?: History): Promise<Answer> {
  const h = history ?? (await loadHistory(ctx.signedIn));
  const picks = await picksFor({ origin: ctx.origin, query, history: h });
  if (picks.length === 0) {
    return {
      title: 'Nothing fits just now',
      lines: [query ? 'No live deals for "' + query + '" within 10 km.' : 'No live deals within 10 km of you.'],
      actions: [{ label: 'Browse all deals', tone: 'secondary', run: () => go('/') }],
    };
  }
  const personal = h.orders.length > 0;
  const more = query ?? h.kinds[0]?.name.toLowerCase() ?? null;
  const takeable = picks.find((p) => orderableNow(p.deal));
  return {
    title: query ? 'Best ' + query + ' for you' : personal ? 'Best for you today' : 'Best near you today',
    lines: [personal ? 'Picked from your ' + h.orders.length + ' orders and what is live near you now.' : null],
    picks,
    note: personal ? undefined : 'Sign in and order a few times, and these get picked from what you like.',
    actions: [
      ...(takeable
        ? [{ label: takeable === picks[0] ? 'Get the top pick' : 'Get the best one on now', tone: 'cta' as const, run: () => openDeal(takeable.deal, true) }]
        : []),
      ...(more
        ? [{ label: 'See more like these', tone: 'secondary' as const, run: () => go({ pathname: '/results', params: { q: more } }) }]
        : []),
    ],
  };
}

async function reorder(intent: CustomerIntent, ctx: JobContext): Promise<Answer> {
  if (!ctx.signedIn) return signIn('Sign in to order your usual', 'Your past orders are kept in your account.');
  const h = await loadHistory(true);
  if (h.deals.length === 0) {
    return {
      title: 'No orders yet',
      lines: ['Once you have ordered, say "order my usual" to get it again in one tap.'],
      actions: [{ label: 'Best deals for me today', tone: 'cta', run: () => recommend(null, ctx, h) }],
    };
  }
  let list = h.deals.filter((u) => dealMatches(u.deal, intent.query));
  if (intent.business) list = list.filter((u) => sameBusiness(intent.business!, u.deal.business.name));
  if (list.length === 0) {
    const fresh = await recommend(intent.query ?? intent.business, ctx, h);
    return { ...fresh, title: 'You have not ordered ' + (intent.query ?? intent.business) + ' yet', lines: ['These fit best from places near you.'] };
  }

  // The live ones, fresh from the server, in the order they are usually had.
  const live = (
    await Promise.all(list.slice(0, 4).map(async (u) => ({ u, d: await db.getDeal(u.deal.id, ctx.origin).catch(() => null) })))
  ).filter((x): x is { u: (typeof list)[number]; d: DealCardModel } => x.d !== null && isLiveDeal(x.d));
  const usual = list[0];
  if (live.length === 0) {
    const like = await picksFor({ origin: ctx.origin, query: usual.deal.tags[0] ?? usual.deal.category.name, history: h });
    return {
      title: usual.deal.title + ' has ended',
      lines: ['You had it ' + timesLabel(usual.count) + ' at ' + usual.deal.business.name + '. These are the closest now:'],
      picks: like,
      actions: like[0] ? [{ label: 'Get the top pick', tone: 'cta', run: () => openDeal(like[0].deal, true) }] : [],
    };
  }
  const ready = live.filter((x) => orderableNow(x.d));
  const later = live.filter((x) => !orderableNow(x.d));
  const shown = [...ready, ...later].slice(0, 3);
  const top = live[0];
  return {
    title: 'Your usual',
    picks: shown.map(({ u, d }) => ({
      deal: d,
      score: u.count,
      take: orderableNow(d) ? { quantity: u.quantity } : undefined,
      why: [
        (u === usual ? 'Your most ordered: ' : 'Had it ') + timesLabel(u.count) + ', last ' + whenLabel(u.last),
        ...(orderableNow(d) ? [] : [nextOnLabel(d)]),
      ],
    })),
    note:
      top.u !== usual
        ? usual.deal.title + ', your most ordered, has ended.'
        : ready.length === 0
          ? 'None of your usuals are on right now.'
          : undefined,
    actions: ready.length
      ? [{ label: 'Order again', tone: 'cta', icon: 'bag', run: () => openDeal(ready[0].d, true, ready[0].u.quantity) }]
      : [{ label: 'Best deals on now', tone: 'cta', run: () => recommend(null, ctx, h) }],
  };
}

async function savings(ctx: JobContext): Promise<Answer> {
  if (!ctx.signedIn) return signIn('Sign in to see your savings', 'Savings add up on your account as you use deals.');
  const h = await loadHistory(true);
  if (h.orders.length === 0) {
    return {
      title: 'Nothing saved yet',
      lines: ['Your savings add up here as you use deals.'],
      actions: [{ label: 'Best deals for me today', tone: 'cta', run: () => recommend(null, ctx, h) }],
    };
  }
  const today = istClock();
  const month = today.date.slice(0, 7);
  const thisMonth = h.orders.filter((a) => istClock(new Date(a.created_at).getTime()).date.startsWith(month));
  const monthSaved = thisMonth.reduce((s, a) => s + savedOn(a), 0);
  const byPlace = new Map<string, { name: string; saved: number }>();
  for (const a of h.orders) {
    const p = byPlace.get(a.deal.business.id) ?? { name: a.deal.business.name, saved: 0 };
    p.saved += savedOn(a);
    byPlace.set(a.deal.business.id, p);
  }
  const top = [...byPlace.values()].sort((a, b) => b.saved - a.saved)[0];
  return {
    title: 'Your savings',
    stats: [
      { label: 'Saved', value: inr(h.saved), highlight: true },
      { label: 'Spent', value: inr(h.spent) },
      { label: 'Orders', value: String(h.orders.length) },
    ],
    lines: [
      thisMonth.length
        ? 'This month: ' + inr(monthSaved) + ' saved on ' + thisMonth.length + (thisMonth.length === 1 ? ' order.' : ' orders.')
        : null,
      top && top.saved > 0 ? 'You save the most at ' + top.name + ' (' + inr(top.saved) + ').' : null,
    ],
    note: h.since ? 'Since your first order ' + whenLabel(h.since) + '.' : undefined,
    actions: [
      { label: 'Best deals for me today', tone: 'cta', run: () => recommend(null, ctx, h) },
      { label: 'See order history', tone: 'secondary', run: () => go('/account/history') },
    ],
  };
}

function openOnes(h: History, intent: CustomerIntent): ActionWithDeal[] {
  let open = h.open;
  if (intent.business) open = open.filter((a) => sameBusiness(intent.business!, a.deal.business.name));
  if (intent.query) open = open.filter((a) => dealMatches(a.deal, intent.query));
  return open;
}

async function myCodes(intent: CustomerIntent, ctx: JobContext): Promise<Answer> {
  if (!ctx.signedIn) return signIn('Sign in to see your codes', 'Codes and bookings are kept in your account.');
  const h = await loadHistory(true);
  const open = openOnes(h, intent);
  if (open.length === 0) {
    const last = h.orders[0];
    return {
      title: intent.business ? 'No codes for ' + intent.business : 'No codes to use right now',
      lines: [last ? 'Your last order was ' + last.deal.title + ', ' + whenLabel(new Date(last.created_at).getTime()) + '.' : null],
      actions: [
        ...(h.deals.length ? [{ label: 'Order your usual', tone: 'cta' as const, run: () => reorder({ ...intent, business: null, query: null }, ctx) }] : []),
        { label: 'Best deals for me today', tone: 'secondary', run: () => recommend(null, ctx, h) },
      ],
    };
  }
  return {
    title: open.length === 1 ? 'Your code' : 'You have ' + open.length + ' codes to use',
    codes: open.slice(0, 4).map((a) => ({ deal: a.deal, code: a.redemption_code, when: whenOf(a) })),
    actions: [{ label: 'Show the QR in My Deals', tone: 'cta', icon: 'qr', run: () => go('/my-deals') }],
  };
}

function confirmCancel(a: ActionWithDeal, ctx: JobContext): Answer {
  const paid = paymentOf(a);
  return {
    title: 'Cancel ' + a.deal.title + '?',
    lines: [
      a.deal.business.name + ' · ' + whenOf(a),
      paid ? 'The ' + inr(paid.amount) + ' you paid is refunded (mock).' : 'Your code stops working.',
      a.deal.cancellation_policy,
    ],
    actions: [
      {
        label: 'Yes, cancel it',
        tone: 'danger',
        run: async () => {
          await db.cancelAction(a.id);
          return {
            title: 'Cancelled',
            done: true,
            lines: [
              a.deal.title + ' at ' + a.deal.business.name + ' is cancelled.',
              paid ? 'Refund of ' + inr(paid.amount) + ' started (mock).' : null,
            ],
            actions: [{ label: 'Find something else', tone: 'secondary', run: () => recommend(null, ctx) }],
          };
        },
      },
      { label: 'Keep it', tone: 'secondary', run: () => 'close' },
    ],
  };
}

async function cancel(intent: CustomerIntent, ctx: JobContext): Promise<Answer> {
  if (!ctx.signedIn) return signIn('Sign in to manage your orders', 'Your codes and bookings are kept in your account.');
  const h = await loadHistory(true);
  const open = openOnes(h, intent);
  if (open.length === 0) {
    return {
      title: 'Nothing to cancel',
      lines: [
        intent.business || intent.query
          ? 'You have no open code or booking for ' + (intent.business ?? intent.query) + '.'
          : 'You have no open codes or bookings.',
      ],
    };
  }
  if (open.length > 1) {
    return {
      title: 'Which one?',
      lines: ['You have ' + open.length + ' open. Pick the one to cancel.'],
      actions: open.slice(0, 3).map((a) => ({ label: 'Cancel ' + a.deal.title, tone: 'secondary' as const, run: () => confirmCancel(a, ctx) })),
    };
  }
  return confirmCancel(open[0], ctx);
}

async function businessInfo(intent: CustomerIntent, ctx: JobContext): Promise<Answer> {
  const name = intent.business ?? intent.query;
  const deal = name ? await findDeal(name, null, ctx.origin, false) : null;
  if (!deal) {
    return {
      title: 'Could not find ' + (name ?? 'that place'),
      lines: ['Try the full name, or search for it.'],
      actions: name ? [{ label: 'Search for ' + name, tone: 'secondary', run: () => go({ pathname: '/results', params: { q: name } }) }] : [],
    };
  }
  const [b, offers] = await Promise.all([
    db.getBusiness(deal.business.id).then((x) => x ?? deal.business),
    db.listShopDeals(deal.business.id, ctx.origin).catch(() => [deal]),
  ]);
  const open = openNow(b.open_time, b.close_time);
  const bookable = offers.find(takesBookings);
  return {
    title: b.name,
    lines: [
      open === null
        ? null
        : open
          ? 'Open now · closes at ' + timeLabel(b.close_time!)
          : 'Closed now · opens at ' + timeLabel(b.open_time!),
      b.cost_for_two ? inr(b.cost_for_two) + ' for two' : null,
      b.rating_count ? b.rating_avg.toFixed(1) + '★ from ' + b.rating_count + ' ratings' : null,
      b.amenities?.length ? b.amenities.slice(0, 4).map(amenityLabel).join(' · ') : null,
      deal.locality_name + ' · ' + distanceLabel(deal.distance_km) + ' away',
    ],
    picks: offers.slice(0, 2).map((d) => ({ deal: d, why: [], score: 0 })),
    actions: [
      { label: 'Open shop page', tone: 'cta', icon: 'store', run: () => go({ pathname: '/shop/[id]', params: { id: b.id } }) },
      ...(bookable ? [{ label: 'Book a table', tone: 'secondary' as const, run: () => openDeal(bookable, true) }] : []),
    ],
  };
}

// ------------------------------------------------------------ merchant ----

const noBusiness = (): Answer => ({
  title: 'No business on this account',
  lines: ['List your business to post deals and see orders.'],
  actions: [{ label: 'List your business', tone: 'cta', run: () => go('/business') }],
});

async function merchantSummary(ctx: JobContext): Promise<Answer> {
  const id = ctx.businessId;
  if (!id) return noBusiness();
  const [biz, orders, deals, reviews] = await Promise.all([
    db.getBusiness(id),
    db.listBusinessOrders(id),
    db.listBusinessDeals(id),
    db.listReviews({ businessId: id }, 100).catch(() => []),
  ]);
  const today = istClock().date;
  const onToday = (iso: string) => istClock(new Date(iso).getTime()).date === today;
  const real = orders.filter((o) => o.status !== 'cancelled' && o.action_type !== 'enquiry');
  const todays = real.filter((o) => onToday(o.created_at));
  const earned = todays.reduce((s, o) => s + (paymentOf(o)?.amount ?? 0), 0);
  const tables = real.filter((o) => o.slot_start && onToday(o.slot_start));
  const next = tables
    .filter((o) => o.status === 'confirmed' && new Date(o.slot_start!).getTime() > Date.now())
    .sort((a, b) => a.slot_start!.localeCompare(b.slot_start!))[0];
  const toRedeem = real.filter((o) => o.status === 'confirmed' && !o.slot_start).length;
  const week = Date.now() - 7 * 86_400_000;
  const sold = new Map<string, { title: string; n: number }>();
  for (const o of real.filter((x) => new Date(x.created_at).getTime() >= week)) {
    const s = sold.get(o.deal_id) ?? { title: o.deal_title, n: 0 };
    s.n += 1;
    sold.set(o.deal_id, s);
  }
  const best = [...sold.values()].sort((a, b) => b.n - a.n)[0];
  const fresh = reviews.filter((r) => new Date(r.created_at).getTime() >= week);
  const avg = fresh.length ? fresh.reduce((s, r) => s + r.rating, 0) / fresh.length : 0;
  const live = deals.filter((d) => d.status === 'ACTIVE').length;
  const paused = deals.filter((d) => d.status === 'PAUSED').length;
  const nextAt = next
    ? (() => {
        const ist = new Date(new Date(next.slot_start!).getTime() + 330 * 60_000);
        return timeLabel(String(ist.getUTCHours()).padStart(2, '0') + ':' + String(ist.getUTCMinutes()).padStart(2, '0'));
      })()
    : null;
  return {
    title: 'Today at ' + (biz?.name ?? 'your business'),
    stats: [
      { label: 'Orders today', value: String(todays.length) },
      { label: 'Earned today', value: inr(earned), highlight: true },
      { label: 'Tables today', value: String(tables.length) },
    ],
    lines: [
      nextAt ? 'Next table at ' + nextAt + '.' : null,
      best ? 'Best seller this week: ' + best.title + ' (' + best.n + (best.n === 1 ? ' order).' : ' orders).') : null,
      toRedeem ? toRedeem + (toRedeem === 1 ? ' code is' : ' codes are') + ' waiting to be redeemed.' : null,
      fresh.length ? fresh.length + ' new ' + (fresh.length === 1 ? 'review' : 'reviews') + ' this week, average ' + avg.toFixed(1) + '★.' : null,
      live + (live === 1 ? ' deal' : ' deals') + ' live' + (paused ? ', ' + paused + ' paused.' : '.'),
    ],
    actions: [
      { label: "Open today's bookings", tone: 'cta', run: () => go('/merchant/bookings') },
      { label: 'Redeem a code', tone: 'secondary', run: () => go('/merchant/redeem') },
    ],
  };
}

async function merchantToggle(intent: CustomerIntent, ctx: JobContext, pause: boolean): Promise<Answer> {
  const id = ctx.businessId;
  if (!id) return noBusiness();
  const deals = await db.listBusinessDeals(id);
  const want = pause ? 'ACTIVE' : 'PAUSED';
  const pool = deals.filter((d) => d.status === want);
  const verb = pause ? 'Pause' : 'Resume';
  const confirm = (d: DealCardModel): Answer => ({
    title: verb + ' ' + d.title + '?',
    lines: [
      pause
        ? 'Customers stop seeing it straight away. Codes already sold still work.'
        : 'It goes back on the app for customers straight away.',
    ],
    actions: [
      {
        label: pause ? 'Pause it' : 'Make it live',
        tone: 'cta',
        run: async () => {
          await db.transitionDeal(d.id, pause ? 'PAUSED' : 'ACTIVE');
          return {
            title: pause ? 'Paused' : 'Live again',
            done: true,
            lines: [
              pause
                ? d.title + ' is hidden from customers. Say "resume ' + (intent.query ?? 'it') + '" to bring it back.'
                : d.title + ' is live for customers again.',
            ],
            actions: [{ label: 'See my deals', tone: 'secondary', run: () => go('/merchant/deals') }],
          };
        },
      },
      { label: 'Not now', tone: 'secondary', run: () => 'close' },
    ],
  });
  if (pool.length === 0) {
    return { title: pause ? 'No live deals to pause' : 'No paused deals', lines: [pause ? 'All your deals are off already.' : 'Every deal is live.'] };
  }
  // The deal the words name best; a tie means asking which.
  const ranked = intent.query
    ? pool
        .map((d) => ({ d, n: matchScore(d, intent.query!) }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n)
    : pool.map((d) => ({ d, n: 0 }));
  if (ranked.length === 1 || (ranked.length > 1 && ranked[0].n > ranked[1].n)) return confirm(ranked[0].d);
  const match = ranked.map((x) => x.d);
  return {
    title: match.length === 0 ? 'No ' + (pause ? 'live' : 'paused') + ' deal matches "' + intent.query + '"' : 'Which one?',
    lines: ['Pick the deal to ' + verb.toLowerCase() + '.'],
    actions: (match.length ? match : pool).slice(0, 4).map((d) => ({ label: d.title, tone: 'secondary' as const, run: () => confirm(d) })),
  };
}

async function merchantRedeem(intent: CustomerIntent, ctx: JobContext): Promise<Answer> {
  const id = ctx.businessId;
  if (!id) return noBusiness();
  const raw = (intent.code ?? '').toUpperCase().replace(/^YOLO-?/, '').replace(/[^A-Z0-9]/g, '');
  const code = 'YOLO-' + raw;
  const orders = await db.listBusinessOrders(id);
  const o = orders.find((x) => x.redemption_code === code);
  const typeIt = { label: 'Type the code', tone: 'secondary' as const, run: () => go('/merchant/redeem') };
  if (!raw || !o) {
    return { title: 'No order with code ' + (raw ? code : 'that'), lines: ['Check the letters with the customer, or type it in.'], actions: [typeIt] };
  }
  if (o.status === 'redeemed') return { title: 'Already redeemed', lines: [code + ' for ' + o.deal_title + ' was used already.'] };
  if (o.status !== 'confirmed') return { title: 'This code is ' + o.status, lines: [o.deal_title], actions: [typeIt] };
  const paid = paymentOf(o);
  return {
    title: 'Redeem ' + code + '?',
    lines: [
      o.deal_title + (o.quantity > 1 ? ' × ' + o.quantity : ''),
      o.customer_name ? 'For ' + o.customer_name : null,
      paid ? 'Paid ' + inr(paid.amount) + ' online' : 'Pays at the counter',
    ],
    actions: [
      {
        label: 'Redeem now',
        tone: 'cta',
        icon: 'check',
        run: async () => {
          await db.redeemAction(code);
          return {
            title: 'Redeemed',
            done: true,
            lines: [o.deal_title + ' for ' + (o.customer_name ?? 'the customer') + '.', 'They have been asked to rate their visit.'],
            actions: [{ label: 'Redeem another', tone: 'secondary', run: () => go('/merchant/redeem') }],
          };
        },
      },
      { label: 'Not now', tone: 'secondary', run: () => 'close' },
    ],
  };
}

/** Runs a job; null when the intent is not one (search, book, go, open). */
export async function runJob(intent: CustomerIntent, ctx: JobContext): Promise<Answer | null> {
  switch (intent.kind) {
    case 'recommend':
      return recommend(intent.query, ctx);
    case 'reorder':
      return reorder(intent, ctx);
    case 'savings':
      return savings(ctx);
    case 'my_codes':
      return myCodes(intent, ctx);
    case 'cancel':
      return cancel(intent, ctx);
    case 'business_info':
      return businessInfo(intent, ctx);
    case 'merchant_summary':
      return merchantSummary(ctx);
    case 'merchant_pause':
      return merchantToggle(intent, ctx, true);
    case 'merchant_resume':
      return merchantToggle(intent, ctx, false);
    case 'merchant_redeem':
      return merchantRedeem(intent, ctx);
    default:
      return null;
  }
}
