/**
 * In-memory DataSource.
 *
 * It enforces the same rules as the SQL — the lifecycle table, the eligibility
 * checks, the capacity decrement, the outbox write — so the app behaves
 * identically with or without a database. That is what lets the demo run with
 * no accounts and no network, and what makes the Supabase adapter a drop-in
 * swap rather than a rewrite.
 *
 * Not persisted by default, so tests get a clean store by constructing a new
 * one. The demo website opts in (loadStore and `persist`): the store is kept
 * in the browser, so a reload in the middle of a demo loses nothing.
 */

import {
  BUSINESSES,
  CATEGORIES,
  DEMO_BUSINESS_ID,
  LOCALITIES,
  businessById,
} from './seed-reference';
import { SEED_ADMIN_QUEUE_DEALS, SEED_DEALS, SEED_PIPELINE_DEALS } from './seed-deals';
import { dealToCard, haversineKm } from './mapping';
import { matchPhoto } from './photo-library';
import { PAY_METHOD_LABEL, paymentOf } from '../lib/payment';
import { slotLabel } from '../lib/format';
import { SLOT_HOLDING, slotCapacity, slotKey } from './booking';
import { enrichBusinesses, seedReviews } from './seed-extras';
import {
  RuleViolation,
  type ActionWithDeal,
  type ActivityEvent,
  type AppViewer,
  type BusinessOrder,
  type ConsentPurpose,
  type HiddenItem,
  type SlotLoad,
  type NewReview,
  type DataSource,
  type DealDraftInput,
  type FeedQuery,
  type MerchantStats,
  type SearchQuery,
  type SearchResult,
  type TakeActionInput,
  type TasteItem,
  type ReportGroup,
  type BusinessVerification,
  type SupportQueueItem,
  type SupportTicket,
  type VerificationRequest,
} from './api';
import {
  CONSTITUTION_LABEL,
  LICENCE_LABEL,
  fssaiProblem,
  gstinProblem,
  normaliseId,
  panConstitutionProblem,
  panOfGstin,
  panProblem,
  udyamProblem,
} from '../lib/india-ids';
import { canTransition, isPubliclyVisible, type Actor } from '../domain/lifecycle';
import { dealParty, partyFits } from './party';
import { computeTaste, tasteAffinity, TASTE_SHARE, type TasteSignal } from '../domain/taste';
import { dealVehicleTags } from './vehicles';
import { scoreDeal, searchRelevance, textRelevance, vehicleRelevance } from '../domain/ranking';
import {
  ageFrom,
  checkAction,
  generateRedemptionCode,
  initialStatus,
  isVisibleTo,
  mintsCode,
} from '../domain/rules';
import type {
  Business,
  Category,
  CustomerAction,
  Deal,
  DealCardModel,
  DealStatus,
  DealStatusHistoryEntry,
  LatLng,
  Locality,
  Notification,
  Review,
  SearchFilters,
} from './types';

// Menus, photos, hours, cost for two and amenities for the demo businesses.
enrichBusinesses(BUSINESSES, [...SEED_DEALS, ...SEED_PIPELINE_DEALS]);

/** The demo accounts use the same viewer shape the Supabase session produces. */
export type LocalViewer = AppViewer;

export const DEMO_CUSTOMER: LocalViewer = {
  id: 'usr-demo-customer',
  full_name: 'Aarav Sharma',
  phone: '+91 98450 12345',
  email: 'aarav@example.in',
  date_of_birth: '1996-04-12', // old enough for the 21+ pub deals
  is_yolo_verified: true,
  is_admin: false,
  business_ids: [],
  onboarded: true,
  // Agreed to personalised suggestions at the welcome, so the demo shows them.
  personalised: true,
};

export const DEMO_MERCHANT: LocalViewer = {
  id: 'usr-demo-merchant',
  full_name: 'Meera Rao',
  phone: '+91 98860 54321',
  email: 'meera@rangolikitchen.in',
  date_of_birth: '1988-09-02',
  is_yolo_verified: true,
  is_admin: false,
  business_ids: [DEMO_BUSINESS_ID],
  onboarded: true,
};

export const DEMO_ADMIN: LocalViewer = {
  id: 'usr-demo-admin',
  full_name: 'YOLO Ops',
  phone: '+91 80 4000 0000',
  email: 'ops@yolodeals.in',
  date_of_birth: '1990-01-01',
  is_yolo_verified: true,
  is_admin: true,
  business_ids: [],
  onboarded: true,
};

interface OutboxEvent {
  id: string;
  type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  occurred_at: string;
  dispatched_at: string | null;
}

let seq = 0;
const uid = (prefix: string) => prefix + '-' + (++seq).toString(36) + Date.now().toString(36);

export interface LocalStore {
  deals: Deal[];
  actions: CustomerAction[];
  notifications: Notification[];
  history: DealStatusHistoryEntry[];
  saved: Set<string>;
  outbox: OutboxEvent[];
  reports: {
    id: string;
    target_type: string;
    target_id: string;
    reason: string;
    details: string | null;
    status: 'open' | 'actioned' | 'dismissed';
    created_at: string;
  }[];
  /** Support requests, oldest first, with who filed them. */
  tickets: (SupportTicket & { profile_id: string })[];
  /** Who opened which deal and when: the "view" signal taste learns from. */
  views: { deal_id: string; profile_id: string; at: number }[];
  /** When each save happened, for the same reason. */
  savedAt: Map<string, number>;
  /** Every verification request, oldest first, with who filed it. */
  verifications: (BusinessVerification & { business_id: string; owner_profile_id: string })[];
  /** Every account by id: the three demo ones and any made by signing in with a new email. */
  users: Record<string, LocalViewer>;
  reviews: Review[];
  /** Consent answers, oldest first (0018's consent_records). */
  consents: { profile_id: string; purpose: ConsentPurpose; granted: boolean; at: string }[];
  /** "Not for me" (0018's hidden_items). */
  hidden: { profile_id: string; kind: HiddenItem['kind']; target_id: string; at: string }[];
  /** What people did (0018's activity_events); tied to them only with consent. */
  activity: { profile_id: string | null; name: string; deal_id: string | null; business_id: string | null; at: number }[];
  viewer: LocalViewer;
  /**
   * False while nobody is signed in: `viewer` is then only the last account,
   * and calls act as they do with no auth.uid() (nothing tied to anyone).
   */
  signedIn: boolean;
}

/** An open claim the demo customer holds, so the demo merchant can always try Redeem. */
export const DEMO_REDEEM_CODE = 'YOLO-RNG7K2';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Claims already made on the demo merchant's deals, matching how many each
 * deal says are taken, spread over the last month: older ones redeemed,
 * the last day's still open. Without them the merchant dashboard, the deal
 * pages and Insights read zero while the customer side says "66 taken".
 */
function seedActions(): CustomerAction[] {
  const now = Date.now();
  const out: CustomerAction[] = [];
  for (const deal of SEED_DEALS) {
    // Bookings have their own seeding, with times (seedBookings).
    if (deal.business_id !== DEMO_BUSINESS_ID || deal.capacity_total == null || deal.booking_required) continue;
    const taken = deal.capacity_total - (deal.capacity_remaining ?? deal.capacity_total);
    for (let i = 0; i < taken; i++) {
      const daysAgo = (i * 29) / Math.max(taken, 1) + 0.1;
      const demo = deal.id === 'd-011' && i === 0;
      let code = '';
      for (let k = 0; k < 6; k++) code += CODE_CHARS[(i * 7 + k * 13 + deal.id.length * 3) % CODE_CHARS.length];
      out.push({
        id: 'act-seed-' + deal.id + '-' + i,
        deal_id: deal.id,
        customer_id: demo ? DEMO_CUSTOMER.id : 'usr-seed-' + (i % 37),
        action_type: 'claim',
        status: demo || daysAgo < 1 ? 'confirmed' : 'redeemed',
        quantity: 1,
        slot_start: null,
        redemption_code: demo ? DEMO_REDEEM_CODE : 'YOLO-' + code,
        // Paid at checkout like any order on a priced deal (lib/payment.ts).
        payload:
          (deal.deal_price ?? 0) > 0
            ? {
                payment: {
                  status: 'paid',
                  method: (['upi', 'upi', 'card', 'netbanking'] as const)[i % 4],
                  amount: deal.deal_price,
                  currency: 'INR',
                  order_id: 'ORD-' + code,
                  paid_at: new Date(now - (demo ? 0.08 : daysAgo) * 86_400_000).toISOString(),
                  mock: true,
                },
              }
            : {},
        created_at: new Date(now - (demo ? 0.08 : daysAgo) * 86_400_000).toISOString(),
      });
    }
  }
  return out;
}

/** Names for the seeded customers, so the merchant's orders read like real ones. */
const SEED_NAMES = [
  'Ananya Rao', 'Rahul Menon', 'Fatima Sheikh', 'Karthik Iyer', 'Sneha Patil', 'Arjun Nair', 'Divya Shetty',
  'Vikram Reddy', 'Meghna Das', 'Rohan Kulkarni', 'Priya Hegde', 'Imran Khan', 'Kavya Gowda', 'Nikhil Jain',
];

function seedCustomers(): LocalViewer[] {
  return Array.from({ length: 37 }, (_, i) => ({
    id: 'usr-seed-' + i,
    full_name: SEED_NAMES[i % SEED_NAMES.length],
    phone: '',
    email: '',
    date_of_birth: null,
    is_yolo_verified: false,
    is_admin: false,
    business_ids: [],
  }));
}

/** An instant in IST: today plus `days`, at hh:mm. Slots are built the same way in the app. */
function istAt(days: number, hh: number, mm = 0): Date {
  const ist = new Date(Date.now() + 330 * 60_000);
  const midnight = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 330 * 60_000;
  return new Date(midnight + days * 86_400_000 + (hh * 60 + mm) * 60_000);
}

/**
 * Table bookings on the demo merchant's dinner table: a few tonight, and
 * tomorrow at 8 PM every table taken, so "Full" shows in the booking sheet
 * and Today's bookings has something in it.
 */
function seedBookings(): CustomerAction[] {
  const deal = SEED_DEALS.find((d) => d.id === 'd-077');
  if (!deal) return [];
  const plan: [number, number, number][] = [
    // [days from today, hour, how many]
    [0, 19, 2],
    [0, 20, 3],
    [0, 21, 1],
    [1, 19, 2],
    [1, 20, slotCapacity(deal.attributes) ?? 6],
    [2, 20, 3],
  ];
  const out: CustomerAction[] = [];
  let n = 0;
  for (const [days, hour, count] of plan) {
    const slot = istAt(days, hour);
    for (let i = 0; i < count; i++, n++) {
      let code = '';
      for (let k = 0; k < 6; k++) code += CODE_CHARS[(n * 11 + k * 7 + 5) % CODE_CHARS.length];
      out.push({
        id: 'act-book-' + n,
        deal_id: deal.id,
        customer_id: 'usr-seed-' + ((n * 5) % 37),
        action_type: 'reserve',
        // Tonight's earlier tables have been and gone.
        status: slot.getTime() < Date.now() ? 'redeemed' : 'confirmed',
        quantity: 4,
        slot_start: slot.toISOString(),
        redemption_code: 'YOLO-' + code,
        payload: {
          payment: {
            status: 'paid',
            method: (['upi', 'card', 'upi', 'netbanking'] as const)[n % 4],
            amount: deal.deal_price,
            currency: 'INR',
            order_id: 'ORD-' + code,
            paid_at: new Date(slot.getTime() - (2 + (n % 30)) * 3_600_000).toISOString(),
            mock: true,
          },
        },
        created_at: new Date(Math.min(Date.now() - 60_000 * (n + 1), slot.getTime() - (2 + (n % 30)) * 3_600_000)).toISOString(),
      });
    }
  }
  return out;
}

/**
 * The demo customer's own past orders over the last six weeks, so the
 * assistant has something to learn from: weekday lunches at Saffron Dum
 * Biryani (their usual), coffee at Brewline, a kebab plate, a biryani pack, a
 * comedy night and a bike wash. All paid and used.
 */
const DEMO_HISTORY: [dealId: string, daysAgo: number, hh: number, mm: number, qty: number][] = [
  ['d-048', 3, 13, 10, 1],
  ['d-003', 6, 9, 40, 1],
  ['d-048', 10, 13, 25, 1],
  ['d-068', 12, 20, 15, 1],
  ['d-020', 15, 19, 30, 2],
  ['d-048', 17, 13, 5, 1],
  ['d-003', 20, 10, 5, 1],
  ['d-004', 24, 20, 45, 1],
  ['d-062', 27, 11, 0, 1],
  ['d-048', 31, 13, 20, 1],
  ['d-003', 41, 9, 15, 1],
];

function seedHistory(): CustomerAction[] {
  return DEMO_HISTORY.flatMap(([dealId, daysAgo, hh, mm, qty], n) => {
    const deal = SEED_DEALS.find((d) => d.id === dealId);
    if (!deal) return [];
    let code = '';
    for (let k = 0; k < 6; k++) code += CODE_CHARS[(n * 17 + k * 5 + 3) % CODE_CHARS.length];
    const at = istAt(-daysAgo, hh, mm);
    const amount = (deal.deal_price ?? 0) * qty;
    return [
      {
        id: 'act-hist-' + n,
        deal_id: deal.id,
        customer_id: DEMO_CUSTOMER.id,
        action_type: deal.booking_required ? 'booking' : 'claim',
        status: 'redeemed',
        quantity: qty,
        slot_start: deal.booking_required ? at.toISOString() : null,
        redemption_code: 'YOLO-' + code,
        payload:
          amount > 0
            ? {
                payment: {
                  status: 'paid',
                  method: (['upi', 'upi', 'card'] as const)[n % 3],
                  amount,
                  currency: 'INR',
                  order_id: 'ORD-' + code,
                  paid_at: new Date(at.getTime() - 20 * 60_000).toISOString(),
                  mock: true,
                },
              }
            : {},
        created_at: new Date(at.getTime() - 20 * 60_000).toISOString(),
      } satisfies CustomerAction,
    ];
  });
}

/** Two of those visits the demo customer has already rated. */
function seedHistoryReviews(actions: CustomerAction[]): Review[] {
  const rated: [string, number, string][] = [
    ['act-hist-2', 5, 'Quick lunch, generous biryani portion. My weekday go-to.'],
    ['act-hist-6', 4, 'Good coffee and the offer worked without any fuss.'],
  ];
  return rated.flatMap(([actionId, rating, body]) => {
    const a = actions.find((x) => x.id === actionId);
    const deal = a && SEED_DEALS.find((d) => d.id === a.deal_id);
    if (!a || !deal) return [];
    return [
      {
        id: 'rev-' + actionId,
        deal_id: deal.id,
        deal_title: deal.title,
        business_id: deal.business_id,
        customer_id: DEMO_CUSTOMER.id,
        customer_name: 'Aarav S.',
        rating,
        body,
        created_at: new Date(new Date(a.created_at).getTime() + 3 * 3_600_000).toISOString(),
        action_id: a.id,
      },
    ];
  });
}

export function createStore(viewer: LocalViewer = DEMO_CUSTOMER): LocalStore {
  const history = seedHistory();
  return {
    deals: [...SEED_DEALS, ...SEED_PIPELINE_DEALS, ...SEED_ADMIN_QUEUE_DEALS].map((d) => ({
      ...d,
    })),
    actions: [...seedActions(), ...seedBookings(), ...history],
    notifications: [],
    history: [],
    saved: new Set<string>(),
    outbox: [],
    reports: [],
    verifications: [],
    tickets: [],
    views: [],
    savedAt: new Map<string, number>(),
    users: Object.fromEntries([DEMO_CUSTOMER, DEMO_MERCHANT, DEMO_ADMIN, ...seedCustomers()].map((u) => [u.id, u])),
    reviews: [...seedHistoryReviews(history), ...seedReviews(BUSINESSES, SEED_DEALS)],
    consents: [
      { profile_id: DEMO_CUSTOMER.id, purpose: 'adult', granted: true, at: new Date(Date.now() - 50 * 86_400_000).toISOString() },
      { profile_id: DEMO_CUSTOMER.id, purpose: 'personalisation', granted: true, at: new Date(Date.now() - 50 * 86_400_000).toISOString() },
    ],
    hidden: [],
    activity: [],
    viewer,
    signedIn: true,
  };
}

// ----------------------------------------------------------- persistence ----

// Bumped when the seed data changes shape or gains deals, so old snapshots give way to it.
const STORAGE_KEY = 'yolo-demo-data-v5';
const OLD_KEYS = ['yolo-demo-data-v1', 'yolo-demo-data-v2', 'yolo-demo-data-v3', 'yolo-demo-data-v4'];

function webStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

interface Snapshot {
  v: 1;
  deals: Deal[];
  actions: CustomerAction[];
  notifications: Notification[];
  history: DealStatusHistoryEntry[];
  saved: string[];
  reports: LocalStore['reports'];
  verifications: LocalStore['verifications'];
  tickets: LocalStore['tickets'];
  views: LocalStore['views'];
  savedAt: [string, number][];
  users: Record<string, LocalViewer>;
  businesses: Business[];
  reviews: Review[];
  consents?: LocalStore['consents'];
  hidden?: LocalStore['hidden'];
  activity?: LocalStore['activity'];
}

function snapshot(store: LocalStore, dropPhotos = false): Snapshot {
  store.users[store.viewer.id] = store.viewer;
  // A photo picked from the device is a data: URL; if the browser's storage
  // is full, those go and the deal falls back to a matched library photo.
  const deals = dropPhotos
    ? store.deals.map((d) => (d.image.startsWith('data:') ? { ...d, image: matchPhoto({ id: d.id, title: d.title, tags: d.tags }) } : d))
    : store.deals;
  return {
    v: 1,
    deals,
    actions: store.actions,
    notifications: store.notifications,
    history: store.history,
    saved: [...store.saved],
    reports: store.reports,
    verifications: store.verifications,
    tickets: store.tickets,
    views: store.views.slice(-500),
    savedAt: [...store.savedAt],
    users: store.users,
    businesses: BUSINESSES,
    reviews: store.reviews,
    consents: store.consents,
    hidden: store.hidden,
    activity: store.activity.slice(-500),
  };
}

/** A store from what this browser kept, or the seed data the first time. */
export function loadStore(): LocalStore {
  const store = createStore();
  // The demo starts signed out; the session puts the remembered account back (signInAs).
  store.signedIn = false;
  const ls = webStorage();
  if (!ls) return store;
  try {
    for (const k of OLD_KEYS) ls.removeItem(k);
    const raw = ls.getItem(STORAGE_KEY);
    if (!raw) return store;
    const s = JSON.parse(raw) as Snapshot;
    if (s.v !== 1) return store;
    store.deals = s.deals;
    store.actions = s.actions;
    store.notifications = s.notifications;
    store.history = s.history;
    store.saved = new Set(s.saved);
    store.reports = s.reports;
    store.verifications = s.verifications;
    store.tickets = s.tickets;
    store.views = s.views;
    store.savedAt = new Map(s.savedAt);
    store.users = { ...store.users, ...s.users };
    // The saved account, not the seed constant: that would be written back over
    // it (allUsers, snapshot), undoing edits and withdrawn consent.
    store.viewer = store.users[store.viewer.id] ?? store.viewer;
    store.reviews = s.reviews ?? store.reviews;
    store.consents = s.consents ?? store.consents;
    store.hidden = s.hidden ?? store.hidden;
    store.activity = s.activity ?? store.activity;
    BUSINESSES.splice(0, BUSINESSES.length, ...s.businesses);
  } catch {
    // A snapshot that does not read starts the demo afresh.
  }
  return store;
}

export function saveStore(store: LocalStore): void {
  const ls = webStorage();
  if (!ls) return;
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(snapshot(store)));
  } catch {
    try {
      ls.setItem(STORAGE_KEY, JSON.stringify(snapshot(store, true)));
    } catch {
      // Still too big: this session keeps working, it just will not survive a reload.
    }
  }
}

/** Forget everything this browser kept: the next load starts from the seed data, signed out. */
export function clearSavedDemo(): void {
  const ls = webStorage();
  ls?.removeItem(STORAGE_KEY);
  ls?.removeItem('yolo-session');
}

export interface LocalDataSource extends DataSource {
  readonly kind: 'local';
  /** Switches the signed-in account: customer, merchant or admin. */
  setViewer(v: LocalViewer): void;
  /** Nobody signed in: calls then act as the RPCs do when auth.uid() is null. */
  signOut(): void;
  getViewer(): LocalViewer;
  /** The account for an email, made on first use: the demo signs in without a code. */
  userForEmail(email: string): LocalViewer;
  /** An account by id, for putting the remembered one back after a reload. */
  userById(id: string): LocalViewer | null;
  /** Direct access for tests and for the outbox worker. */
  readonly store: LocalStore;
}

export function createLocalDataSource(
  store: LocalStore = createStore(),
  { persist = false }: { persist?: boolean } = {},
): LocalDataSource {
  /** Every account, with the signed-in one as it is now (edits replace the object). */
  const allUsers = (): LocalViewer[] => {
    store.users[store.viewer.id] = store.viewer;
    return Object.values(store.users);
  };

  /** Who is signed in, or null for a visitor: what auth.uid() says in SQL. */
  const me = (): LocalViewer | null => (store.signedIn ? store.viewer : null);

  /** The signed-in account; a visitor is refused, as the RPCs refuse no auth.uid(). */
  const mustSignIn = (why = 'Sign in first'): LocalViewer => {
    if (!store.signedIn) throw new RuleViolation(why);
    return store.viewer;
  };

  /** may_personalise() in 0019: both consents given, and not under 18 by the date of birth. */
  const mayPersonalise = (v: LocalViewer): boolean => {
    const said = (p: ConsentPurpose) => {
      const mine = store.consents.filter((c) => c.profile_id === v.id && c.purpose === p);
      return mine.length > 0 && mine[mine.length - 1].granted;
    };
    return said('personalisation') && said('adult') && !isUnder18(v.date_of_birth);
  };

  const emit = (
    type: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown> = {},
  ) => {
    store.outbox.push({
      id: uid('evt'),
      type,
      aggregate_type: aggregateType,
      aggregate_id: aggregateId,
      payload,
      occurred_at: new Date().toISOString(),
      dispatched_at: null,
    });
  };

  /** Live listeners for the signed-in person's new notifications. */
  const liveListeners = new Set<(n: Notification) => void>();

  const notify = (
    profileId: string,
    kind: Notification['kind'],
    title: string,
    body: string,
    data: Record<string, unknown> = {},
  ) => {
    // Told after the call that caused it has finished, as Realtime would.
    setTimeout(() => {
      const n = store.notifications.find((x) => x.profile_id === profileId && x.title === title);
      if (n && store.signedIn && profileId === store.viewer.id) liveListeners.forEach((cb) => cb(n));
    }, 0);
    store.notifications.unshift({
      id: uid('ntf'),
      profile_id: profileId,
      kind,
      title,
      body,
      data,
      read_at: null,
      created_at: new Date().toISOString(),
    });
  };

  const findDeal = (id: string): Deal => {
    const d = store.deals.find((x) => x.id === id);
    if (!d) throw new RuleViolation('Deal not found');
    return d;
  };

  /** Who owns a business among the demo accounts, as business_members would say. */
  const ownersOf = (businessId: string): string[] =>
    allUsers()
      .filter((v) => v.business_ids.includes(businessId))
      .map((v) => v.id);

  /** An admin signed in now; the last account's flag means nothing once they sign out. */
  const isAdmin = () => store.signedIn && store.viewer.is_admin;

  const isMember = (businessId: string) =>
    store.signedIn && (store.viewer.business_ids.includes(businessId) || store.viewer.is_admin);

  /**
   * Resolves the acting role the way transition_deal() does. Nobody using the
   * app acts as the system; internal moves pass their actor explicitly.
   */
  const actorFor = (businessId: string): Actor => {
    if (isAdmin()) return 'admin';
    if (isMember(businessId)) return 'merchant';
    throw new RuleViolation('You cannot change this deal');
  };

  const move = (dealId: string, to: DealStatus, reason?: string, forceActor?: Actor) => {
    const deal = findDeal(dealId);
    const actor = forceActor ?? actorFor(deal.business_id);

    if (!canTransition(deal.status, to, actor)) {
      throw new RuleViolation(
        'A ' + actor + ' cannot move a deal from ' + deal.status + ' to ' + to,
      );
    }
    if (to === 'REJECTED' && !reason?.trim()) {
      throw new RuleViolation('A rejection reason is required');
    }

    const from = deal.status;
    deal.status = to;
    if (to === 'REJECTED') deal.rejection_reason = reason ?? null;
    if (to === 'DRAFT') deal.rejection_reason = null;
    if (to === 'PUBLISHED' && !deal.published_at) {
      deal.published_at = new Date().toISOString();
    }

    store.history.push({
      id: uid('hst'),
      deal_id: dealId,
      from_status: from,
      to_status: to,
      actor,
      reason: reason ?? null,
      created_at: new Date().toISOString(),
    });

    emit('deal.' + to.toLowerCase(), 'deal', dealId, {
      from,
      to,
      actor,
      reason: reason ?? null,
      business_id: deal.business_id,
      title: deal.title,
    });

    return to;
  };

  /**
   * Forgets what was learned about one person (0020's erase_activity_of).
   * "Not for me" choices are instructions, not tracking, so they stay; only
   * deleting the account removes them, and demo accounts cannot be deleted.
   */
  const eraseActivity = (profileId: string) => {
    store.activity = store.activity.filter((a) => a.profile_id !== profileId);
    store.views = store.views.filter((v) => v.profile_id !== profileId);
  };

  /** What the current viewer is into, from what they opened, saved and claimed. */
  const myTaste = (): TasteItem[] => {
    // Learning needs someone signed in, consent and 18+, as my_taste() in 0018.
    if (!store.signedIn || !store.viewer.personalised) return [];
    const me = store.viewer.id;
    const signal = (kind: TasteSignal['kind'], dealId: string, at: number): TasteSignal | null => {
      const d = store.deals.find((x) => x.id === dealId);
      if (!d) return null;
      const cat = CATEGORIES.find((c) => c.id === d.category_id);
      if (!cat) return null;
      return { kind, at, categorySlug: cat.slug, categoryName: cat.name, tags: d.tags };
    };
    const now = Date.now();
    const signals = [
      ...store.views
        .filter((v) => v.profile_id === me && now - v.at < 90 * 86_400_000)
        .map((v) => signal('view', v.deal_id, v.at)),
      ...[...store.saved].map((id) => signal('save', id, store.savedAt.get(id) ?? now)),
      ...store.actions
        .filter((a) => a.customer_id === me)
        .map((a) => signal('action', a.deal_id, new Date(a.created_at).getTime())),
    ].filter((s): s is TasteSignal => s !== null);
    return computeTaste(signals, now);
  };

  /** The live, visible, in-radius candidate set both reads start from. */
  const candidates = (origin: LatLng | null, radiusKm: number | null): DealCardModel[] => {
    const now = Date.now();
    return store.deals
      .filter((d) => d.status === 'ACTIVE')
      .filter((d) => new Date(d.ends_at).getTime() > now)
      .filter((d) => new Date(d.starts_at).getTime() <= now)
      .map((d) => dealToCard(d, origin))
      .filter((c) => isVisibleTo(c, me()))
      .filter((c) => radiusKm == null || origin == null || c.distance_km <= radiusKm);
  };

  const applyFilters = (cards: DealCardModel[], f: SearchFilters): DealCardModel[] => {
    const now = Date.now();
    return cards.filter((c) => {
      if (f.vertical && c.category.vertical !== f.vertical) return false;
      if (f.category_slug && c.category.slug !== f.category_slug) {
        // A vertical-level query should still match its leaves.
        const parent = CATEGORIES.find((x) => x.slug === f.category_slug);
        if (!parent || parent.parent_id !== null) return false;
        if (c.category.vertical !== parent.vertical) return false;
      }
      const price = c.deal_price ?? 0;
      if (f.price_min != null && price < f.price_min) return false;
      if (f.price_max != null && price > f.price_max) return false;
      if (f.min_rating != null && c.rating_avg < f.min_rating) return false;
      if (f.verified_only && !c.is_verified) return false;
      if (f.ending_soon && !c.ending_soon) return false;
      if (f.deal_types.length > 0 && !f.deal_types.includes(c.deal_type_code)) return false;

      if (f.day_of_week.length > 0 && c.availability.days.length > 0) {
        if (!f.day_of_week.some((d) => c.availability.days.includes(d))) return false;
      }

      if (f.time_of_day) {
        const windows: Record<string, [string, string]> = {
          morning: ['06:00', '11:00'],
          lunch: ['12:00', '15:30'],
          evening: ['17:00', '21:00'],
          night: ['21:00', '23:59'],
        };
        const [from, to] = windows[f.time_of_day];
        if (!(c.availability.start_time < to && c.availability.end_time > from)) return false;
      }

      for (const [k, v] of Object.entries(f.attributes)) {
        if (String(c.attributes[k] ?? '') !== String(v)) return false;
      }

      if (!partyFits(dealParty(c.attributes), f.party_min, f.party_max)) return false;
      if ((f.amenities ?? []).length > 0) {
        const has = c.business.amenities ?? [];
        if (!f.amenities.every((a) => has.includes(a))) return false;
      }
      if (f.max_cost_for_two != null) {
        const cost = c.business.cost_for_two;
        if (cost == null || cost > f.max_cost_for_two) return false;
      }
      if (f.vehicle_tags.length > 0) {
        const fits = dealVehicleTags(c.attributes);
        if (!fits.some((t) => f.vehicle_tags.includes(t))) return false;
      }

      if (f.keywords.length > 0 && textRelevance(c, f.keywords) === 0) return false;
      void now;
      return true;
    });
  };

  const src: LocalDataSource = {
    kind: 'local',
    store,

    setViewer(v) {
      store.viewer = v;
      store.users[v.id] = v;
      store.signedIn = true;
    },
    signOut() {
      store.signedIn = false;
    },
    getViewer() {
      return store.viewer;
    },

    userForEmail(email) {
      const e = email.trim().toLowerCase();
      const found = allUsers().find((u) => (u.email ?? '').toLowerCase() === e);
      if (found) return found;
      const user: LocalViewer = {
        id: uid('usr'),
        full_name: '',
        phone: '',
        email: e,
        date_of_birth: null,
        is_yolo_verified: false,
        is_admin: false,
        business_ids: [],
        // A new account sees the welcome: name, age, and whether to personalise.
        onboarded: false,
        personalised: false,
      };
      store.users[user.id] = user;
      return user;
    },

    userById(id) {
      return allUsers().find((u) => u.id === id) ?? null;
    },

    async getCategories(): Promise<Category[]> {
      return CATEGORIES;
    },
    async getLocalities(): Promise<Locality[]> {
      return LOCALITIES;
    },
    async getBusiness(id): Promise<Business | null> {
      return BUSINESSES.find((b) => b.id === id) ?? null;
    },

    // ---- account and support (mirrors 0007_support_and_account.sql) ----

    async updateMyProfile(input): Promise<void> {
      const viewer = mustSignIn();
      if (input.full_name !== undefined && input.full_name.trim().length < 2) {
        throw new RuleViolation('Enter your name');
      }
      // A date of birth, once set, only support changes (0019's profiles_lock_dob).
      const dobChanged = input.date_of_birth !== undefined && (input.date_of_birth ?? null) !== (viewer.date_of_birth ?? null);
      if (dobChanged && viewer.date_of_birth && !viewer.is_admin) {
        throw new RuleViolation('Your date of birth is set. To correct it, contact support from Help');
      }
      // Kept on the demo account itself, so switching accounts and back keeps it;
      // the fresh object is what makes subscribers re-render.
      Object.assign(store.viewer, input);
      // Under 18 by the new date: what was learned is forgotten, and they are
      // recorded as not an adult (0020's profiles_minor_erase).
      if (dobChanged && isUnder18(store.viewer.date_of_birth)) {
        eraseActivity(viewer.id);
        store.consents.push({ profile_id: viewer.id, purpose: 'adult', granted: false, at: new Date().toISOString() });
      }
      store.viewer = { ...store.viewer, personalised: mayPersonalise(store.viewer) };
    },

    // The demo keeps the picked file's own URI; it lasts until the page reloads.
    async uploadDealPhoto(businessId, image): Promise<string> {
      if (!isMember(businessId)) throw new RuleViolation('Only the business can add its photos');
      // Nothing to upload to offline: the picked file's own URL serves this session.
      return image.uri;
    },

    async setAvatar(image): Promise<string> {
      mustSignIn();
      Object.assign(store.viewer, { avatar_url: image.uri });
      store.viewer = { ...store.viewer };
      return image.uri;
    },

    async removeAvatar(): Promise<void> {
      mustSignIn();
      Object.assign(store.viewer, { avatar_url: null });
      store.viewer = { ...store.viewer };
    },

    async createSupportTicket(input): Promise<string> {
      mustSignIn();
      const message = input.message.trim();
      if (message.length < 10) throw new RuleViolation('Tell us a little more, at least 10 characters');
      if (message.length > 2000) throw new RuleViolation('Keep it under 2,000 characters');
      let dealId = input.deal_id ?? null;
      if (input.action_id) {
        const action = store.actions.find((a) => a.id === input.action_id);
        if (!action || action.customer_id !== store.viewer.id) {
          throw new RuleViolation('That claim is not on your account');
        }
        dealId = action.deal_id;
      }
      const open = store.tickets.filter((t) => t.profile_id === store.viewer.id && t.status === 'open');
      if (open.length >= 5) throw new RuleViolation('You have 5 open requests. We will answer those first');
      const id = uid('tkt');
      store.tickets.push({
        id,
        profile_id: store.viewer.id,
        topic: input.topic,
        message,
        status: 'open',
        reply: null,
        replied_at: null,
        action_id: input.action_id ?? null,
        deal_id: dealId,
        created_at: new Date().toISOString(),
        messages: [{ author: 'customer', body: message, created_at: new Date().toISOString() }],
      });
      emit('support.ticket_created', 'support_ticket', id, { topic: input.topic });
      return id;
    },

    async listMySupportTickets(): Promise<SupportTicket[]> {
      if (!store.signedIn) return [];
      return store.tickets
        .filter((t) => t.profile_id === store.viewer.id)
        .map(({ profile_id: _p, ...t }) => t)
        .reverse();
    },

    async requestAccountDeletion(): Promise<void> {
      throw new RuleViolation(
        'Demo accounts cannot be deleted. On the live app this cancels your open claims and removes your account.',
      );
    },

    // Mirrors create_business() in 0006_merchant_onboarding.sql.
    async createBusiness(input): Promise<string> {
      mustSignIn();
      const name = input.name.trim();
      const address = input.address_line.trim();
      const phone = input.phone?.trim() || '';
      const email = input.email?.trim() || '';
      if (name.length < 2 || name.length > 80) {
        throw new RuleViolation('Business name must be 2 to 80 characters');
      }
      if (!CATEGORIES.some((c) => c.id === input.primary_category_id)) {
        throw new RuleViolation('Choose what kind of business this is');
      }
      const locality = LOCALITIES.find((l) => l.id === input.locality_id);
      if (!locality) throw new RuleViolation('Choose the area your business is in');
      if (address.length < 5) throw new RuleViolation('Enter the street address');
      if (phone && !/^\+?[0-9 ]{8,16}$/.test(phone)) throw new RuleViolation('Enter a valid phone number');
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        throw new RuleViolation('Enter a valid email address');
      }
      if (store.viewer.business_ids.length >= 5) {
        throw new RuleViolation('You can own up to five businesses. Contact support to add more');
      }
      const problem = shopProfileProblem(input);
      if (problem) throw new RuleViolation(problem);

      const id = uid('biz');
      BUSINESSES.push({
        id,
        name,
        phone,
        email,
        primary_category_id: input.primary_category_id,
        verification_status: 'unverified',
        rating_avg: 0,
        rating_count: 0,
        locality_id: locality.id,
        address_line: address,
        location: input.location ?? locality.centroid,
        description: input.description?.trim() || null,
        keywords: input.keywords ?? [],
        owner_role: input.owner_role?.trim() || null,
        cost_for_two: input.cost_for_two ?? null,
        amenities: input.amenities ?? [],
        cuisines: input.cuisines ?? [],
        open_time: input.open_time ?? null,
        close_time: input.close_time ?? null,
        photos: input.photos ?? [],
        menu: input.menu ?? [],
      });
      // Kept on the demo account too, so switching accounts and back keeps the
      // business; the fresh object is what makes subscribers re-render.
      store.viewer.business_ids.push(id);
      store.viewer = { ...store.viewer, business_ids: [...store.viewer.business_ids] };
      emit('merchant.business_created', 'business', id, { name });
      return id;
    },

    // Mirrors update_business() in 0012_business_details.sql.
    async updateBusiness(businessId, input): Promise<void> {
      if (!isMember(businessId)) throw new RuleViolation("Only the business's own team can change its details");
      const name = input.name.trim();
      const address = input.address_line.trim();
      const phone = input.phone?.trim() || '';
      const email = input.email?.trim() || '';
      if (name.length < 2 || name.length > 80) throw new RuleViolation('Business name must be 2 to 80 characters');
      const locality = LOCALITIES.find((l) => l.id === input.locality_id);
      if (!locality) throw new RuleViolation('Choose the area your business is in');
      if (address.length < 5) throw new RuleViolation('Enter the street address');
      if (phone && !/^\+?[0-9 ]{8,16}$/.test(phone)) throw new RuleViolation('Enter a valid phone number');
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        throw new RuleViolation('Enter a valid email address');
      }
      const biz = BUSINESSES.find((b) => b.id === businessId);
      if (!biz) throw new RuleViolation('Business not found');
      const problem = shopProfileProblem(input);
      if (problem) throw new RuleViolation(problem);
      const moved = biz.locality_id !== locality.id;
      Object.assign(biz, { name, phone, email, address_line: address, locality_id: locality.id });
      // The shop page: only what was sent changes.
      if (input.description !== undefined) biz.description = input.description || null;
      if (input.open_time !== undefined) biz.open_time = input.open_time;
      if (input.close_time !== undefined) biz.close_time = input.close_time;
      if (input.cost_for_two !== undefined) biz.cost_for_two = input.cost_for_two;
      if (input.amenities !== undefined) biz.amenities = input.amenities;
      if (input.menu !== undefined) biz.menu = input.menu;
      if (input.photos !== undefined) biz.photos = input.photos;
      // A pinned position wins; a new area without one uses the area's centre.
      const to = input.location ?? (moved ? locality.centroid : null);
      if (to) {
        biz.location = to;
        for (const d of store.deals) {
          if (d.business_id === businessId && !['EXPIRED', 'ARCHIVED', 'COMPLETED'].includes(d.status)) {
            d.location = to;
          }
        }
      }
      emit('merchant.business_updated', 'business', businessId, { name, locality: locality.name });
    },

    // Mirrors submit_business_verification() in 0006_merchant_onboarding.sql.
    async submitBusinessVerification(businessId, input): Promise<'pending'> {
      if (!mustSignIn().business_ids.includes(businessId)) {
        throw new RuleViolation('Only the owner can ask for verification');
      }
      const b = businessById(businessId);
      const legal = input.legal_name.trim();
      const gstin = input.gstin ? normaliseId(input.gstin) : '';
      let pan = input.pan ? normaliseId(input.pan) : '';
      let licenceType = input.licence_type ?? null;
      let licence = input.licence_number?.trim().toUpperCase() || '';
      const fssai = input.fssai?.replace(/\s/g, '') || '';

      if (legal.length < 2) throw new RuleViolation('Enter the registered business name');
      if (!CONSTITUTION_LABEL[input.constitution]) throw new RuleViolation('Choose the type of business');
      if (gstin) {
        if (gstinProblem(gstin)) {
          throw new RuleViolation('That GSTIN is not valid. Copy it from your GST certificate');
        }
        pan = panOfGstin(gstin);
        licenceType = null;
        licence = '';
      } else {
        if (panProblem(pan)) {
          throw new RuleViolation('Enter your GSTIN, or your PAN if you are not registered under GST');
        }
        if (!licenceType || !LICENCE_LABEL[licenceType]) {
          throw new RuleViolation('Without GST, add a Udyam, Shop and Establishment or trade licence number');
        }
        if (licence.length < 5) throw new RuleViolation('Enter the registration number');
        if (licenceType === 'udyam' && udyamProblem(licence)) throw new RuleViolation(udyamProblem(licence)!);
      }
      const mismatch = panConstitutionProblem(pan, input.constitution);
      if (mismatch) throw new RuleViolation(mismatch);

      const isFood = CATEGORIES.find((c) => c.id === b.primary_category_id)?.vertical === 'food';
      if (fssai && fssaiProblem(fssai)) throw new RuleViolation('FSSAI numbers have 14 digits');
      if (isFood && !fssai) {
        throw new RuleViolation('Food businesses need their 14-digit FSSAI licence or registration number');
      }
      if (input.registered_address.trim().length < 10) throw new RuleViolation('Enter the registered address');
      if (input.owner_name.trim().length < 2) throw new RuleViolation('Enter your full name as on your PAN or ID');
      if (!['owner', 'partner', 'director', 'manager'].includes(input.owner_role)) {
        throw new RuleViolation('Choose your role in the business');
      }
      if (input.declared !== true) throw new RuleViolation('Confirm that these details are correct');

      if (b.verification_status === 'pending') {
        throw new RuleViolation('Verification is already being reviewed');
      }
      if (b.verification_status === 'verified') {
        throw new RuleViolation('This business is already verified');
      }
      b.verification_status = 'pending';
      store.verifications.push({
        business_id: b.id,
        owner_profile_id: store.viewer.id,
        legal_name: legal,
        constitution: input.constitution,
        gstin: gstin || undefined,
        pan,
        licence_type: licenceType ?? undefined,
        licence_number: licence || undefined,
        fssai: fssai || undefined,
        registered_address: input.registered_address.trim(),
        owner_name: input.owner_name.trim(),
        owner_role: input.owner_role,
        declared: true,
        status: 'submitted',
        rejection_reason: null,
        submitted_at: new Date().toISOString(),
      });
      emit('merchant.verification_submitted', 'business', b.id);
      return 'pending';
    },

    async getBusinessVerification(businessId): Promise<BusinessVerification | null> {
      if (!isMember(businessId)) return null;
      const mine = store.verifications.filter((v) => v.business_id === businessId);
      const last = mine[mine.length - 1];
      if (!last) return null;
      const { business_id: _b, owner_profile_id: _o, ...rest } = last;
      return rest;
    },

    async feedNearby(q: FeedQuery): Promise<DealCardModel[]> {
      const radiusKm = q.radius_m / 1000;
      let cards = candidates(q.origin, radiusKm);
      const nowDow = new Date().getDay();

      if (q.section === 'today') {
        cards = cards.filter(
          (c) => c.availability.days.length === 0 || c.availability.days.includes(nowDow),
        );
      } else if (q.section === 'ending_soon') {
        cards = cards.filter((c) => c.ending_soon);
      } else if (q.section === 'new') {
        const cutoff = Date.now() - 3 * 86_400_000;
        cards = cards.filter(
          (c) => c.published_at != null && new Date(c.published_at).getTime() >= cutoff,
        );
      }

      const scored = cards.map((c) => ({
        card: c,
        score: scoreDeal({ deal: c, relevance: 0.5, radiusKm }),
      }));

      scored.sort((a, b) => {
        switch (q.section) {
          case 'trending':
            return b.card.views - a.card.views;
          case 'new':
            return (
              new Date(b.card.published_at ?? 0).getTime() -
              new Date(a.card.published_at ?? 0).getTime()
            );
          case 'ending_soon':
            return new Date(a.card.ends_at).getTime() - new Date(b.card.ends_at).getTime();
          default:
            return b.score - a.score || a.card.distance_km - b.card.distance_km;
        }
      });

      const offset = q.offset ?? 0;
      return scored.slice(offset, offset + (q.limit ?? 20)).map((s) => s.card);
    },

    async getMyTaste(): Promise<TasteItem[]> {
      return myTaste();
    },

    async feedForYou(q): Promise<DealCardModel[]> {
      const taste = myTaste();
      if (taste.length === 0) return [];
      const radiusKm = q.radius_m / 1000;
      const acted = new Set(
        store.actions.filter((a) => a.customer_id === store.viewer.id).map((a) => a.deal_id),
      );
      const hidden = store.hidden.filter((h) => h.profile_id === store.viewer.id);
      const isHidden = (c: DealCardModel) =>
        hidden.some(
          (h) =>
            (h.kind === 'deal' && h.target_id === c.id) ||
            (h.kind === 'business' && h.target_id === c.business_id) ||
            (h.kind === 'category' && h.target_id === c.category_id),
        );
      return candidates(q.origin, radiusKm)
        .filter((c) => !acted.has(c.id) && !isHidden(c))
        .map((c) => ({ card: c, a: tasteAffinity(c, taste) }))
        .filter((x) => x.a > 0)
        .map((x) => ({
          card: x.card,
          rank:
            x.a * TASTE_SHARE +
            scoreDeal({ deal: x.card, relevance: 0.5, radiusKm }) * (1 - TASTE_SHARE),
        }))
        .sort((a, b) => b.rank - a.rank || a.card.distance_km - b.card.distance_km)
        .slice(0, q.limit ?? 12)
        .map((x) => x.card);
    },

    async searchDeals(q: SearchQuery): Promise<SearchResult> {
      const f = q.filters;
      const radiusKm = f.radius_km ?? 5;

      // A named locality replaces the device location as the search centre.
      let origin = q.origin;
      if (f.locality) {
        const loc = LOCALITIES.find(
          (l) =>
            l.name.toLowerCase() === f.locality!.toLowerCase() ||
            l.aliases.includes(f.locality!.toLowerCase()),
        );
        if (loc) origin = loc.centroid;
      }

      const filtered = applyFilters(candidates(origin, radiusKm), f);

      const scored = filtered.map((c) => ({
        card: c,
        relevance: searchRelevance(c, f.keywords, f.vehicle_tags, dealVehicleTags(c.attributes)),
      }));

      const ranked = scored
        .map((s) => ({
          card: s.card,
          score: scoreDeal({ deal: s.card, relevance: s.relevance, radiusKm }),
          // Specialists for the vehicle first, then everything else that fits it.
          fit: vehicleRelevance(dealVehicleTags(s.card.attributes), f.vehicle_tags),
        }))
        .sort((a, b) => {
          switch (f.sort) {
            case 'distance':
              return a.card.distance_km - b.card.distance_km;
            case 'ending_soon':
              return new Date(a.card.ends_at).getTime() - new Date(b.card.ends_at).getTime();
            case 'best_value':
              return (b.card.discount_pct ?? 0) - (a.card.discount_pct ?? 0);
            default:
              return b.fit - a.fit || b.score - a.score;
          }
        });

      const offset = q.offset ?? 0;
      const page = ranked.slice(offset, offset + (q.limit ?? 20)).map((r) => r.card);

      emit('search.performed', 'search', uid('srch'), {
        q: q.q,
        filters: f as unknown as Record<string, unknown>,
        result_count: ranked.length,
      });

      return { deals: page, applied: f, parser: 'rules', total: ranked.length };
    },

    async getDeal(id, origin): Promise<DealCardModel | null> {
      const deal = store.deals.find((d) => d.id === id);
      if (!deal) return null;
      // Mirrors get_deal: public deals for anyone; otherwise the owning business,
      // an admin, or a customer who has already acted on it.
      const actedOn = store.actions.some(
        (a) => a.deal_id === id && a.customer_id === me()?.id,
      );
      if (!isPubliclyVisible(deal.status) && !isMember(deal.business_id) && !actedOn) return null;
      return dealToCard(deal, origin ?? null);
    },

    async getRawDeal(id): Promise<Deal | null> {
      return store.deals.find((d) => d.id === id) ?? null;
    },

    async takeDealAction(input: TakeActionInput): Promise<CustomerAction> {
      const deal = findDeal(input.deal_id);
      const card = dealToCard(deal, null);
      const quantity = input.quantity ?? 1;
      // A question takes nothing from what is left to sell (0020).
      const enquiry = input.action_type === 'enquiry';

      const verdict = checkAction({
        deal: enquiry ? { ...card, capacity_remaining: null } : card,
        viewer: me(),
        actionType: input.action_type,
        quantity,
        slotStart: input.slot_start ?? null,
        existing: store.actions.filter((a) => a.customer_id === store.viewer.id),
      });
      if (!verdict.ok) throw new RuleViolation(verdict.reason ?? 'Not allowed');
      // One open question per deal: the business has not answered the first yet (0020).
      if (
        enquiry &&
        store.actions.some(
          (a) =>
            a.deal_id === deal.id && a.customer_id === store.viewer.id && a.action_type === 'enquiry' && a.status === 'pending',
        )
      ) {
        throw new RuleViolation('You have already asked; the business will reply');
      }

      // One time slot takes only so many bookings (0014_slot_capacity.sql does the same).
      const perSlot = slotCapacity(deal.attributes);
      if (input.slot_start && perSlot != null) {
        const at = slotKey(input.slot_start);
        const held = store.actions.filter(
          (a) =>
            a.deal_id === deal.id &&
            a.slot_start != null &&
            slotKey(a.slot_start) === at &&
            (SLOT_HOLDING as readonly string[]).includes(a.status),
        ).length;
        if (held >= perSlot) throw new RuleViolation('That time is full. Pick another time.');
      }

      if (deal.capacity_remaining != null && !enquiry) {
        deal.capacity_remaining -= quantity;
      }

      const taken = new Set(
        store.actions.map((a) => a.redemption_code).filter((c): c is string => c !== null),
      );

      const action: CustomerAction = {
        id: uid('act'),
        deal_id: deal.id,
        customer_id: store.viewer.id,
        action_type: input.action_type,
        status: initialStatus(input.action_type),
        quantity,
        slot_start: input.slot_start ?? null,
        redemption_code: mintsCode(input.action_type) ? generateRedemptionCode(taken) : null,
        payload: input.payload ?? {},
        created_at: new Date().toISOString(),
      };
      store.actions.unshift(action);

      emit('action.created', 'action', action.id, {
        deal_id: deal.id,
        business_id: deal.business_id,
        action_type: input.action_type,
        quantity,
        code: action.redemption_code,
      });

      notify(
        store.viewer.id,
        'action_confirmed',
        input.action_type === 'enquiry' ? 'Enquiry sent' : 'You are all set',
        input.action_type === 'enquiry'
          ? deal.title + ' — the business will get back to you.'
          : deal.title + (action.redemption_code ? ' — code ' + action.redemption_code : ''),
        { deal_id: deal.id, action_id: action.id },
      );

      // The business hears about every order, paid or not, with a first name,
      // never contact details (0016's customer_action_notify).
      const paid = paymentOf(action);
      const who = firstName(store.viewer.full_name) ?? 'A customer';
      for (const owner of ownersOf(deal.business_id)) {
        notify(
          owner,
          'new_claim',
          (input.action_type === 'enquiry' ? 'New enquiry: ' : 'New order: ') + deal.title,
          paid
            ? who + ' paid ₹' + paid.amount.toLocaleString('en-IN') + ' by ' + PAY_METHOD_LABEL[paid.method] + ' · ' + paid.order_id
            : who + (quantity > 1 ? ' · ' + quantity + ' ×' : '') + (action.redemption_code ? ' · pays at the counter' : ''),
          { deal_id: deal.id, action_id: action.id },
        );
      }

      // Sold out closes the deal, same as the SQL does in one transaction.
      if (deal.capacity_remaining === 0 && !enquiry) {
        move(deal.id, 'EXPIRED', 'sold out', 'system');
      }
      return action;
    },

    async cancelAction(actionId): Promise<CustomerAction> {
      const viewer = mustSignIn();
      const action = store.actions.find((a) => a.id === actionId);
      if (!action) throw new RuleViolation('Booking not found');
      if (action.customer_id !== viewer.id && !viewer.is_admin) {
        throw new RuleViolation('Not your booking');
      }
      if (action.status !== 'pending' && action.status !== 'confirmed') {
        throw new RuleViolation('This can no longer be cancelled');
      }
      action.status = 'cancelled';

      const deal = store.deals.find((d) => d.id === action.deal_id);
      // An enquiry took nothing, so it gives nothing back (0020).
      if (deal && deal.capacity_remaining != null && action.action_type !== 'enquiry') {
        deal.capacity_remaining = Math.min(
          deal.capacity_remaining + action.quantity,
          deal.capacity_total ?? Number.MAX_SAFE_INTEGER,
        );
      }
      emit('action.cancelled', 'action', action.id, { deal_id: action.deal_id });
      // The business hears, as 0016's customer_action_notify tells its members.
      if (deal) {
        const customer = allUsers().find((u) => u.id === action.customer_id);
        const body = [firstName(customer?.full_name) ?? 'A customer', action.slot_start ? slotLabel(action.slot_start) : null];
        for (const owner of ownersOf(deal.business_id)) {
          notify(owner, 'order_cancelled', 'Cancelled: ' + deal.title, body.filter(Boolean).join(' · '), {
            deal_id: deal.id,
            action_id: action.id,
          });
        }
      }
      return action;
    },

    async listMyActions(): Promise<ActionWithDeal[]> {
      if (!store.signedIn) return [];
      return store.actions
        .filter((a) => a.customer_id === store.viewer.id)
        .map((a) => {
          const deal = store.deals.find((d) => d.id === a.deal_id)!;
          return { ...a, deal: dealToCard(deal, null) };
        });
    },

    async toggleSavedDeal(dealId): Promise<boolean> {
      mustSignIn('Sign in to save deals');
      if (store.saved.has(dealId)) {
        store.saved.delete(dealId);
        return false;
      }
      store.saved.add(dealId);
      store.savedAt.set(dealId, Date.now());
      return true;
    },

    async listSavedDeals(origin): Promise<DealCardModel[]> {
      if (!store.signedIn) return [];
      return [...store.saved]
        .map((id) => store.deals.find((d) => d.id === id))
        .filter((d): d is Deal => Boolean(d))
        .map((d) => dealToCard(d, origin ?? null));
    },

    async reportTarget(targetType, targetId, reason, details): Promise<string> {
      const id = uid('rep');
      store.reports.push({
        id,
        target_type: targetType,
        target_id: targetId,
        reason,
        details: details ?? null,
        status: 'open',
        created_at: new Date().toISOString(),
      });
      emit('report.created', targetType, targetId, { report_id: id, reason });
      return id;
    },

    async listBusinessDeals(businessId): Promise<DealCardModel[]> {
      if (!isMember(businessId)) throw new RuleViolation('Not a member of this business');
      return store.deals
        .filter((d) => d.business_id === businessId)
        .map((d) => dealToCard(d, null));
    },

    async saveDealDraft(input: DealDraftInput): Promise<string> {
      if (!isMember(input.business_id)) {
        throw new RuleViolation('Not a member of this business');
      }

      if (input.id) {
        const deal = findDeal(input.id);
        if (deal.status !== 'DRAFT' && deal.status !== 'REJECTED' && !store.viewer.is_admin) {
          throw new RuleViolation('Only draft or rejected deals can be edited');
        }
        const wasUnclaimed = deal.status === 'DRAFT' || deal.status === 'REJECTED';
        Object.assign(deal, stripUndefined(toDealPatch(input)));
        // Generated from the stored row in Postgres, so recompute from the merged row
        // rather than from whichever prices this save happened to include.
        deal.discount_pct = computeDiscount(deal.original_price, deal.deal_price);
        // Mirrors save_deal_draft: nothing is claimed before review, so what is left
        // follows the total. A live deal keeps its count.
        if (wasUnclaimed && input.capacity_total !== undefined) {
          deal.capacity_remaining = input.capacity_total;
        }
        return deal.id;
      }

      const business = businessById(input.business_id);
      const id = uid('deal');
      const now = new Date().toISOString();
      const base: Deal = {
        id,
        business_id: input.business_id,
        category_id:
          input.category_id ??
          CATEGORIES.find((c) => c.slug === input.category_slug)?.id ??
          business.primary_category_id,
        deal_type_code: (input.deal_type_code as Deal['deal_type_code']) ?? 'discount',
        offering_kind: (input.offering_kind as Deal['offering_kind']) ?? 'other',
        title: input.title ?? 'Untitled deal',
        short_description: input.short_description ?? '',
        description: input.description ?? '',
        status: 'DRAFT',
        original_price: input.original_price ?? null,
        deal_price: input.deal_price ?? null,
        discount_pct: computeDiscount(input.original_price, input.deal_price),
        price_unit: input.price_unit ?? null,
        taxes_note: input.taxes_note ?? null,
        min_purchase: input.min_purchase ?? null,
        max_qty_per_customer: input.max_qty_per_customer ?? 2,
        starts_at: input.starts_at ?? now,
        ends_at: input.ends_at ?? new Date(Date.now() + 14 * 86_400_000).toISOString(),
        capacity_total: input.capacity_total ?? null,
        capacity_remaining: input.capacity_total ?? null,
        booking_required: input.booking_required ?? false,
        cancellation_policy: input.cancellation_policy ?? null,
        terms: input.terms ?? null,
        attributes: input.attributes ?? {},
        tags: input.tags ?? [],
        location:
          input.lat != null && input.lng != null
            ? { lat: input.lat, lng: input.lng }
            : business.location,
        image: input.media?.[0]?.storage_path ?? 'https://picsum.photos/seed/' + id + '/800/600',
        primary_cta:
          (input.actions?.find((a) => a.is_primary)?.action_type as Deal['primary_cta']) ?? 'claim',
        secondary_ctas:
          (input.actions
            ?.filter((a) => !a.is_primary)
            .map((a) => a.action_type) as Deal['secondary_ctas']) ?? [],
        availability: {
          days: (input.availability ?? [])
            .map((a) => a.day_of_week)
            .filter((d): d is number => d !== null),
          start_time: input.availability?.[0]?.start_time ?? '09:00',
          end_time: input.availability?.[0]?.end_time ?? '21:00',
        },
        eligibility: {
          audience: (input.eligibility?.audience as Deal['eligibility']['audience']) ?? 'everyone',
          min_age: input.eligibility?.min_age ?? null,
          min_spend: input.eligibility?.min_spend ?? null,
          membership_required: input.eligibility?.membership_required ?? false,
          advance_booking_hours: input.eligibility?.advance_booking_hours ?? null,
          custom_rule: input.eligibility?.custom_rule ?? null,
        },
        rejection_reason: null,
        published_at: null,
        rating_avg: business.rating_avg,
        rating_count: 0,
        created_at: now,
        views: 0,
        searches: 0,
      };
      store.deals.push(base);
      return id;
    },

    // The demo publishes straight away so a new merchant's deal can be found at
    // once; the live app (transition_deal) waits for an admin to approve it.
    async submitDeal(dealId): Promise<DealStatus> {
      const deal = findDeal(dealId);
      move(dealId, 'SUBMITTED');
      move(dealId, 'VERIFICATION', undefined, 'admin');
      move(dealId, 'APPROVED', 'Demo: published without review', 'admin');
      let status = move(dealId, 'PUBLISHED', undefined, 'admin');
      if (new Date(deal.starts_at).getTime() <= Date.now()) status = move(dealId, 'ACTIVE', undefined, 'system');
      for (const owner of ownersOf(deal.business_id)) {
        notify(
          owner,
          'deal_approved',
          'Live: ' + deal.title,
          status === 'ACTIVE' ? 'Customers can see it and take it now.' : 'It goes live on its start date.',
          { deal_id: dealId },
        );
      }
      return status;
    },

    async transitionDeal(dealId, to, reason): Promise<DealStatus> {
      return move(dealId, to, reason);
    },

    async duplicateDeal(dealId): Promise<string> {
      const src2 = findDeal(dealId);
      if (!isMember(src2.business_id)) throw new RuleViolation('Not your deal');
      const id = uid('deal');
      store.deals.push({
        ...src2,
        id,
        title: (src2.title + ' (copy)').slice(0, 90),
        status: 'DRAFT',
        published_at: null,
        rejection_reason: null,
        capacity_remaining: src2.capacity_total,
        views: 0,
        searches: 0,
        created_at: new Date().toISOString(),
      });
      return id;
    },

    async getDealHistory(dealId): Promise<DealStatusHistoryEntry[]> {
      return store.history.filter((h) => h.deal_id === dealId);
    },

    async getMerchantStats(businessId, days = 7): Promise<MerchantStats> {
      if (!isMember(businessId)) throw new RuleViolation('Not a member of this business');
      const mine = store.deals.filter((d) => d.business_id === businessId);
      const ids = new Set(mine.map((d) => d.id));
      const since = Date.now() - days * 86_400_000;
      const acts = store.actions.filter(
        (a) => ids.has(a.deal_id) && new Date(a.created_at).getTime() >= since,
      );
      const count = (t: CustomerAction['action_type'][]) =>
        acts.filter((a) => t.includes(a.action_type)).length;

      // The seeded view counts are a month's worth; a shorter period shows its share.
      const share = Math.min(days, 30) / 30;
      return {
        views: Math.round(mine.reduce((s, d) => s + d.views, 0) * share),
        searches: Math.round(mine.reduce((s, d) => s + d.searches, 0) * share),
        claims: count(['claim']),
        bookings: count(['booking', 'reserve']),
        enquiries: count(['enquiry']),
        active_count: mine.filter((d) => d.status === 'ACTIVE').length,
        draft_count: mine.filter((d) => d.status === 'DRAFT').length,
        pending_count: mine.filter((d) =>
          ['SUBMITTED', 'VERIFICATION', 'APPROVED', 'PUBLISHED'].includes(d.status),
        ).length,
        expired_count: mine.filter((d) =>
          ['EXPIRED', 'COMPLETED', 'ARCHIVED'].includes(d.status),
        ).length,
      };
    },

    async redeemAction(code): Promise<CustomerAction> {
      const action = store.actions.find(
        (a) => a.redemption_code === code.trim().toUpperCase(),
      );
      if (!action) throw new RuleViolation('Code not recognised');
      const deal = findDeal(action.deal_id);
      if (!isMember(deal.business_id)) throw new RuleViolation('Not your deal');
      if (action.status === 'redeemed') throw new RuleViolation('Already redeemed');
      if (action.status !== 'confirmed') {
        throw new RuleViolation('This code is ' + action.status);
      }
      action.status = 'redeemed';
      emit('action.redeemed', 'action', action.id, {
        deal_id: deal.id,
        business_id: deal.business_id,
      });
      // Ask the customer how it went while it is fresh.
      notify(
        action.customer_id,
        'rate_visit',
        'How was ' + deal.title + '?',
        'Rate your visit to ' + (businessById(deal.business_id)?.name ?? 'the business') + '. It helps others choose.',
        { deal_id: deal.id, action_id: action.id },
      );
      return action;
    },

    async listDealActions(dealId): Promise<CustomerAction[]> {
      const deal = findDeal(dealId);
      if (!isMember(deal.business_id)) throw new RuleViolation('Not your deal');
      return store.actions.filter((a) => a.deal_id === dealId);
    },

    async listShopDeals(businessId, origin): Promise<DealCardModel[]> {
      return candidates(origin, null).filter((c) => c.business.id === businessId);
    },

    async listReviews(target, limit = 50): Promise<Review[]> {
      return store.reviews
        .filter((r) => (target.dealId ? r.deal_id === target.dealId : true))
        .filter((r) => (target.businessId ? r.business_id === target.businessId : true))
        .slice(0, limit);
    },

    async listMyReviews(): Promise<Review[]> {
      if (!store.signedIn) return [];
      return store.reviews.filter((r) => r.customer_id === store.viewer.id);
    },

    async createReview(input: NewReview): Promise<Review> {
      const viewer = mustSignIn('Sign in to rate your visit');
      const action = store.actions.find((a) => a.id === input.action_id);
      if (!action || action.customer_id !== viewer.id) throw new RuleViolation('Only your own visits can be rated');
      const deal = findDeal(action.deal_id);
      // A business's own team cannot rate its own deals (0020).
      if (viewer.business_ids.includes(deal.business_id)) throw new RuleViolation('You cannot review your own business');
      if (action.status !== 'redeemed') throw new RuleViolation('You can rate a visit once your code has been used');
      if (store.reviews.some((r) => r.deal_id === action.deal_id && r.customer_id === viewer.id)) {
        throw new RuleViolation('You have already rated this deal');
      }
      const rating = Math.round(input.rating);
      if (!(rating >= 1 && rating <= 5)) throw new RuleViolation('Pick from one to five stars');
      // The same limit as create_review; the Supabase adapter cuts at it too.
      const body = (input.body ?? '').trim().slice(0, 1000) || null;
      const review: Review = {
        id: uid('rev'),
        deal_id: deal.id,
        deal_title: deal.title,
        business_id: deal.business_id,
        customer_id: viewer.id,
        // "Aarav S.", never the email, as review_rows shows people.
        customer_name: displayName(viewer.full_name),
        rating,
        body,
        created_at: new Date().toISOString(),
        action_id: action.id,
      };
      store.reviews.unshift(review);
      // The business's rating moves with every review.
      const biz = BUSINESSES.find((b) => b.id === deal.business_id);
      if (biz) {
        biz.rating_avg = Math.round(((biz.rating_avg * biz.rating_count + rating) / (biz.rating_count + 1)) * 10) / 10;
        biz.rating_count += 1;
      }
      for (const owner of ownersOf(deal.business_id)) {
        notify(
          owner,
          'new_review',
          'New review: ' + '★'.repeat(rating) + ' on ' + deal.title,
          body ? (body.length > 90 ? body.slice(0, 90) + '…' : body) : 'No comment, just stars.',
          { deal_id: deal.id },
        );
      }
      return review;
    },

    async listSlotLoad(dealId): Promise<SlotLoad[]> {
      const now = Date.now();
      const load = new Map<number, number>();
      for (const a of store.actions) {
        if (a.deal_id !== dealId || a.slot_start == null) continue;
        if (!(SLOT_HOLDING as readonly string[]).includes(a.status)) continue;
        const at = slotKey(a.slot_start);
        if (at < now) continue;
        load.set(at, (load.get(at) ?? 0) + 1);
      }
      return [...load].map(([at, taken]) => ({ slot_start: new Date(at).toISOString(), taken }));
    },

    async listBusinessOrders(businessId): Promise<BusinessOrder[]> {
      if (!isMember(businessId)) throw new RuleViolation('Only the business can see its orders');
      const users = allUsers();
      const deals = new Map(store.deals.filter((d) => d.business_id === businessId).map((d) => [d.id, d]));
      return store.actions
        .filter((a) => deals.has(a.deal_id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 200)
        .map((a) => {
          const d = deals.get(a.deal_id)!;
          const u = users.find((x) => x.id === a.customer_id);
          // "Aarav S.", never contact details, as business_customer_names in 0019.
          return { ...a, deal_title: d.title, deal_price: d.deal_price, customer_name: displayName(u?.full_name) };
        });
    },

    async listReviewQueue(): Promise<DealCardModel[]> {
      if (!isAdmin()) throw new RuleViolation('Admin only');
      return store.deals
        .filter((d) => d.status === 'SUBMITTED' || d.status === 'VERIFICATION')
        .map((d) => dealToCard(d, null));
    },

    async reviewDeal(dealId, approve, reason): Promise<DealStatus> {
      if (!isAdmin()) throw new RuleViolation('Admin only');
      const deal = findDeal(dealId);

      if (deal.status === 'SUBMITTED') move(dealId, 'VERIFICATION', undefined, 'admin');

      let status: DealStatus;
      if (!approve) {
        status = move(dealId, 'REJECTED', reason, 'admin');
      } else {
        move(dealId, 'APPROVED', undefined, 'admin');
        status = move(dealId, 'PUBLISHED', undefined, 'admin');
        if (new Date(deal.starts_at).getTime() <= Date.now()) {
          status = move(dealId, 'ACTIVE', undefined, 'system');
        }
      }

      // Only the deal's own business hears about it, as review_deal() does.
      for (const owner of ownersOf(deal.business_id)) {
        notify(
          owner,
          approve ? 'deal_approved' : 'deal_rejected',
          approve ? 'Deal approved: ' + deal.title : 'Needs changes: ' + deal.title,
          approve
            ? status === 'ACTIVE'
              ? 'It is live and visible to customers.'
              : 'It goes live on ' + new Date(deal.starts_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + '.'
            : (reason ?? 'Please review and resubmit.'),
          { deal_id: dealId },
        );
      }
      return status;
    },

    async listReportsQueue(): Promise<ReportGroup[]> {
      if (!isAdmin()) throw new RuleViolation('Admin only');
      const groups = new Map<string, ReportGroup>();
      for (const r of store.reports.filter((x) => x.status === 'open')) {
        const k = r.target_type + ':' + r.target_id;
        const deal = r.target_type === 'deal' ? store.deals.find((d) => d.id === r.target_id) : undefined;
        const biz = deal
          ? businessById(deal.business_id)
          : BUSINESSES.find((b) => b.id === r.target_id);
        const g = groups.get(k) ?? {
          target_type: r.target_type as ReportGroup['target_type'],
          target_id: r.target_id,
          title: deal?.title ?? biz?.name ?? 'Removed item',
          business_id: biz?.id ?? null,
          business_name: biz?.name ?? null,
          deal_status: deal?.status ?? null,
          open_count: 0,
          reasons: [],
          details: [],
          first_at: r.created_at,
          last_at: r.created_at,
        };
        g.open_count += 1;
        if (!g.reasons.includes(r.reason)) g.reasons.push(r.reason);
        if (r.details?.trim()) g.details.unshift(r.details.trim());
        if (r.created_at < g.first_at) g.first_at = r.created_at;
        if (r.created_at > g.last_at) g.last_at = r.created_at;
        groups.set(k, g);
      }
      return [...groups.values()].sort(
        (a, b) => b.open_count - a.open_count || b.last_at.localeCompare(a.last_at),
      );
    },

    async resolveReports(targetType, targetId, action, note): Promise<number> {
      if (!isAdmin()) throw new RuleViolation('Admin only');
      if (action === 'pause') {
        if (targetType !== 'deal') throw new RuleViolation('Only a deal can be paused');
        if (!note?.trim()) throw new RuleViolation('Say why the deal is paused; the merchant sees it');
        const deal = findDeal(targetId);
        if (deal.status === 'ACTIVE') move(targetId, 'PAUSED', note.trim(), 'admin');
        for (const owner of ownersOf(deal.business_id)) {
          notify(owner, 'deal_paused', 'Paused: ' + deal.title, note.trim(), { deal_id: targetId });
        }
      }
      let n = 0;
      for (const r of store.reports) {
        if (r.target_type === targetType && r.target_id === targetId && r.status === 'open') {
          r.status = action === 'pause' ? 'actioned' : 'dismissed';
          n += 1;
        }
      }
      emit('reports.resolved', targetType, targetId, { action, count: n, note: note ?? null });
      return n;
    },

    async listVerificationQueue(): Promise<VerificationRequest[]> {
      if (!isAdmin()) throw new RuleViolation('Admin only');
      return store.verifications
        .filter((v) => v.status === 'submitted')
        .map((v) => {
          const b = businessById(v.business_id);
          const elsewhere = new Set(
            store.verifications
              .filter(
                (o) =>
                  o.business_id !== v.business_id &&
                  o.status !== 'rejected' &&
                  ((!!v.gstin && o.gstin === v.gstin) || o.pan === v.pan),
              )
              .map((o) => o.business_id),
          );
          return {
            business_id: b.id,
            name: b.name,
            category_name: CATEGORIES.find((c) => c.id === b.primary_category_id)?.name ?? '',
            locality_name: LOCALITIES.find((l) => l.id === b.locality_id)?.name ?? '',
            address_line: b.address_line,
            phone: b.phone,
            email: b.email,
            legal_name: v.legal_name,
            constitution: v.constitution,
            gstin: v.gstin ?? null,
            pan: v.pan ?? '',
            licence_type: v.licence_type ?? null,
            licence_number: v.licence_number ?? null,
            fssai: v.fssai ?? null,
            registered_address: v.registered_address,
            owner_name: v.owner_name,
            owner_role: v.owner_role,
            same_id_elsewhere: elsewhere.size,
            submitted_at: v.submitted_at,
          };
        });
    },

    async listSupportQueue(view = 'active'): Promise<SupportQueueItem[]> {
      if (!isAdmin()) throw new RuleViolation('Admin only');
      const people = [DEMO_CUSTOMER, DEMO_MERCHANT, DEMO_ADMIN];
      return store.tickets
        .filter((t) => (view === 'closed' ? t.status === 'closed' : t.status !== 'closed'))
        .sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || a.created_at.localeCompare(b.created_at))
        .map((t) => {
          const who = people.find((p) => p.id === t.profile_id);
          const action = t.action_id ? store.actions.find((a) => a.id === t.action_id) : undefined;
          const deal = t.deal_id ? store.deals.find((d) => d.id === t.deal_id) : undefined;
          return {
            id: t.id,
            topic: t.topic,
            message: t.message,
            status: t.status,
            created_at: t.created_at,
            customer_name: who?.full_name ?? '',
            customer_contact: who?.phone ?? who?.email ?? '',
            redemption_code: action?.redemption_code ?? null,
            action_status: action?.status ?? null,
            deal_id: t.deal_id,
            deal_title: deal?.title ?? null,
            reply: t.reply,
            messages: t.messages,
          };
        });
    },

    async replySupportTicket(ticketId, reply, close): Promise<'answered' | 'closed'> {
      if (!isAdmin()) throw new RuleViolation('Admin only');
      const body = reply.trim();
      if (body.length < 2 && !close) throw new RuleViolation('Write a reply first');
      const t = store.tickets.find((x) => x.id === ticketId);
      if (!t) throw new RuleViolation('That request no longer exists');
      t.status = close ? 'closed' : 'answered';
      if (body.length >= 2) {
        const at = new Date().toISOString();
        t.reply = body;
        t.replied_at = at;
        t.messages = [...t.messages, { author: 'team', body, created_at: at }];
        notify(t.profile_id, 'support_reply', 'YOLO support replied', body.slice(0, 160), { ticket_id: ticketId });
      }
      return t.status;
    },

    async followUpSupportTicket(ticketId, message): Promise<'open'> {
      const t = store.tickets.find((x) => x.id === ticketId);
      if (!t || t.profile_id !== me()?.id) throw new RuleViolation('That request is not yours');
      const body = message.trim();
      if (body.length < 2) throw new RuleViolation('Write your message first');
      if (body.length > 2000) throw new RuleViolation('Keep it under 2,000 characters');
      t.messages = [...t.messages, { author: 'customer', body, created_at: new Date().toISOString() }];
      t.status = 'open';
      emit('support.follow_up', 'support_ticket', ticketId, {});
      return 'open';
    },

    // Mirrors review_business() in 0006_merchant_onboarding.sql.
    async reviewBusiness(businessId, approve, reason): Promise<'verified' | 'rejected'> {
      if (!isAdmin()) throw new RuleViolation('Admin only');
      if (!approve && (reason?.trim().length ?? 0) < 5) {
        throw new RuleViolation('Give the owner a reason they can act on');
      }
      const req = [...store.verifications]
        .reverse()
        .find((v) => v.business_id === businessId && v.status === 'submitted');
      if (!req) throw new RuleViolation('Nothing is waiting for review for this business');

      const state = approve ? 'verified' : 'rejected';
      const b = businessById(businessId);
      b.verification_status = state;
      req.status = approve ? 'approved' : 'rejected';
      req.rejection_reason = approve ? null : reason!.trim();
      notify(
        req.owner_profile_id,
        approve ? 'business_verified' : 'business_rejected',
        approve ? 'You are YOLO Verified' : 'Verification needs changes: ' + b.name,
        approve ? b.name + ' now shows the YOLO Verified badge.' : reason!.trim(),
        { business_id: businessId },
      );
      emit('merchant.verification_changed', 'business', businessId, { status: state, reason });
      return state;
    },

    async listNotifications(): Promise<Notification[]> {
      if (!store.signedIn) return [];
      return store.notifications.filter((n) => n.profile_id === store.viewer.id);
    },

    async markNotificationRead(id): Promise<void> {
      const n = store.notifications.find((x) => x.id === id);
      if (n) n.read_at = new Date().toISOString();
    },

    // ---- activity and privacy (mirrors 0018) ----

    async track(events: ActivityEvent[]): Promise<void> {
      // Signed out, nothing is tied to anyone, as with no auth.uid().
      const learn = me()?.personalised ? store.viewer.id : null;
      for (const e of events.slice(0, 50)) {
        const deal = e.deal_id ? store.deals.find((d) => d.id === e.deal_id) : undefined;
        store.activity.push({
          profile_id: learn,
          name: e.name,
          deal_id: deal?.id ?? null,
          business_id: deal?.business_id ?? e.business_id ?? null,
          at: Date.now(),
        });
        if (e.name === 'deal_open' && deal) {
          deal.views += 1;
          if (learn) store.views.push({ deal_id: deal.id, profile_id: learn, at: Date.now() });
        }
      }
      if (store.activity.length > 1000) store.activity.splice(0, store.activity.length - 1000);
    },

    async getMyConsents() {
      if (!store.signedIn) return [];
      const latest = new Map<ConsentPurpose, { purpose: ConsentPurpose; granted: boolean; created_at: string }>();
      for (const c of store.consents) {
        if (c.profile_id === store.viewer.id) latest.set(c.purpose, { purpose: c.purpose, granted: c.granted, created_at: c.at });
      }
      return [...latest.values()];
    },

    async setConsent(purpose, granted) {
      const viewer = mustSignIn();
      if (purpose === 'adult' && granted && isUnder18(viewer.date_of_birth)) {
        throw new RuleViolation('Your date of birth says you are under 18');
      }
      store.consents.push({ profile_id: viewer.id, purpose, granted, at: new Date().toISOString() });
      // Withdrawing forgets what was learned; "not for me" stays (0020).
      if (!granted && (purpose === 'personalisation' || purpose === 'adult')) eraseActivity(viewer.id);
      // A fresh object, so screens that read the viewer re-render.
      store.viewer = { ...store.viewer, personalised: mayPersonalise(store.viewer) };
    },

    async eraseMyActivity() {
      eraseActivity(mustSignIn().id);
    },

    async getMyActivitySummary() {
      if (!store.signedIn) return [];
      const since = Date.now() - 180 * 86_400_000;
      const by = new Map<string, { name: string; events: number; last_at: string }>();
      for (const a of store.activity) {
        if (a.profile_id !== store.viewer.id || a.at < since) continue;
        const row = by.get(a.name) ?? { name: a.name, events: 0, last_at: new Date(a.at).toISOString() };
        row.events += 1;
        if (new Date(a.at).toISOString() > row.last_at) row.last_at = new Date(a.at).toISOString();
        by.set(a.name, row);
      }
      return [...by.values()].sort((a, b) => b.events - a.events);
    },

    async notInterested(dealId, scope) {
      const deal = store.deals.find((d) => d.id === dealId);
      if (!deal) throw new RuleViolation('That deal is not there any more');
      const target = scope === 'business' ? deal.business_id : scope === 'category' ? deal.category_id : deal.id;
      const id = mustSignIn().id;
      if (!store.hidden.some((h) => h.profile_id === id && h.kind === scope && h.target_id === target)) {
        store.hidden.push({ profile_id: id, kind: scope, target_id: target, at: new Date().toISOString() });
      }
    },

    async listHidden() {
      if (!store.signedIn) return [];
      return store.hidden
        .filter((h) => h.profile_id === store.viewer.id)
        .map((h) => ({
          kind: h.kind,
          target_id: h.target_id,
          created_at: h.at,
          label:
            h.kind === 'business'
              ? (businessById(h.target_id)?.name ?? 'A place')
              : h.kind === 'category'
                ? (CATEGORIES.find((c) => c.id === h.target_id)?.name ?? 'A kind of deal')
                : (store.deals.find((d) => d.id === h.target_id)?.title ?? 'A deal'),
        }))
        .reverse();
    },

    async unhide(kind, targetId) {
      const id = mustSignIn().id;
      store.hidden = store.hidden.filter((h) => !(h.profile_id === id && h.kind === kind && h.target_id === targetId));
    },

    subscribeNotifications(onNew) {
      liveListeners.add(onNew);
      return () => {
        liveListeners.delete(onNew);
      };
    },

    async recordEvents(events): Promise<void> {
      // Signed-in callers only, as record_deal_events since 0020.
      if (!store.signedIn) return;
      for (const e of events) {
        const deal = store.deals.find((d) => d.id === e.deal_id);
        if (!deal) continue;
        if (e.event_type === 'view') {
          deal.views += 1;
          store.views.push({ deal_id: deal.id, profile_id: store.viewer.id, at: Date.now() });
        }
        if (e.event_type === 'search_appearance') deal.searches += 1;
      }
    },
  };

  if (persist) {
    // Save shortly after any call, once, however many calls come together.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const later = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        saveStore(store);
      }, 300);
    };
    const methods = src as unknown as Record<string, unknown>;
    for (const key of Object.keys(methods)) {
      const fn = methods[key];
      if (typeof fn !== 'function' || key === 'getViewer') continue;
      methods[key] = (...args: unknown[]) => {
        const out = (fn as (...a: unknown[]) => unknown)(...args);
        if (out instanceof Promise) out.then(later, later);
        else later();
        return out;
      };
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('pagehide', () => saveStore(store));
    }
  }

  return src;
}

/** "Aarav S.": a first name and the last word's initial, as display_name() in 0016. */
function displayName(fullName: string | null | undefined): string | null {
  const name = (fullName ?? '').trim();
  if (!name) return null;
  if (!name.includes(' ')) return name;
  return name.split(' ')[0] + ' ' + name.replace(/^.*\s/, '').charAt(0).toUpperCase() + '.';
}

/** The first word of a name, or null: how the order notes in 0016 name a customer. */
function firstName(fullName: string | null | undefined): string | null {
  return (fullName ?? '').trim().split(' ')[0] || null;
}

/** 0019's is_under_18: by the date of birth they gave; none counts as not under. */
function isUnder18(dob: string | null | undefined): boolean {
  const age = ageFrom(dob ?? null);
  return age !== null && age < 18;
}

/** What apply_business_profile (0020) refuses in the hours or cost for two, or null. */
function shopProfileProblem(input: {
  open_time?: string | null;
  close_time?: string | null;
  cost_for_two?: number | null;
}): string | null {
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (input.open_time && !hhmm.test(input.open_time)) return 'Opening time should look like 10:00';
  if (input.close_time && !hhmm.test(input.close_time)) return 'Closing time should look like 22:00';
  const cost = input.cost_for_two;
  if (cost != null && !(Number.isInteger(cost) && cost >= 0 && cost <= 100000)) {
    return 'Cost for two must be a number of rupees, up to 1,00,000';
  }
  return null;
}

function computeDiscount(mrp?: number | null, price?: number | null): number | null {
  if (mrp == null || price == null || mrp <= 0) return null;
  return Math.round((1 - price / mrp) * 1000) / 10;
}

/** Only the fields the wizard may change; status and counters are excluded. */
function toDealPatch(input: DealDraftInput): Partial<Deal> {
  const patch: Partial<Deal> = {
    title: input.title,
    short_description: input.short_description,
    description: input.description,
    original_price: input.original_price,
    deal_price: input.deal_price,
    price_unit: input.price_unit,
    taxes_note: input.taxes_note,
    min_purchase: input.min_purchase,
    max_qty_per_customer: input.max_qty_per_customer,
    starts_at: input.starts_at ?? undefined,
    ends_at: input.ends_at ?? undefined,
    capacity_total: input.capacity_total,
    booking_required: input.booking_required,
    cancellation_policy: input.cancellation_policy,
    terms: input.terms,
    attributes: input.attributes,
    tags: input.tags,
    deal_type_code: input.deal_type_code as Deal['deal_type_code'] | undefined,
    offering_kind: input.offering_kind as Deal['offering_kind'] | undefined,
  };
  // The rest mirror save_deal_draft's update branch: the category follows a
  // slug or id, and eligibility and CTAs are replaced wholesale when posted.
  const categoryId =
    input.category_id ?? CATEGORIES.find((c) => c.slug === input.category_slug)?.id;
  if (categoryId) patch.category_id = categoryId;
  if (input.eligibility) {
    patch.eligibility = {
      audience: (input.eligibility.audience as Deal['eligibility']['audience']) ?? 'everyone',
      min_age: input.eligibility.min_age ?? null,
      min_spend: input.eligibility.min_spend ?? null,
      membership_required: input.eligibility.membership_required ?? false,
      advance_booking_hours: input.eligibility.advance_booking_hours ?? null,
      custom_rule: input.eligibility.custom_rule ?? null,
    };
  }
  if (input.actions) {
    patch.primary_cta =
      (input.actions.find((a) => a.is_primary)?.action_type as Deal['primary_cta']) ?? 'claim';
    patch.secondary_ctas = input.actions
      .filter((a) => !a.is_primary)
      .map((a) => a.action_type) as Deal['secondary_ctas'];
  }
  if (input.lat != null && input.lng != null) {
    patch.location = { lat: input.lat, lng: input.lng };
  }
  if (input.availability) {
    patch.availability = {
      days: input.availability.map((a) => a.day_of_week).filter((d): d is number => d !== null),
      start_time: input.availability[0]?.start_time ?? '09:00',
      end_time: input.availability[0]?.end_time ?? '21:00',
    };
  }
  if (input.media?.[0]) patch.image = input.media[0].storage_path;
  return patch;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/** Distance helper re-exported so screens do not reach into mapping.ts. */
export { haversineKm };
