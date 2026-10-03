/**
 * In-memory DataSource.
 *
 * It enforces the same rules as the SQL — the lifecycle table, the eligibility
 * checks, the capacity decrement, the outbox write — so the app behaves
 * identically with or without a database. That is what lets the demo run with
 * no accounts and no network, and what makes the Supabase adapter a drop-in
 * swap rather than a rewrite.
 *
 * Deliberately not persisted: persistence belongs to the caller, so tests get a
 * clean store by constructing a new one.
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
import {
  RuleViolation,
  type ActionWithDeal,
  type AppViewer,
  type DataSource,
  type DealDraftInput,
  type FeedQuery,
  type MerchantStats,
  type SearchQuery,
  type SearchResult,
  type TakeActionInput,
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
import { scoreDeal, textRelevance } from '../domain/ranking';
import {
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
  SearchFilters,
} from './types';

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
  reports: { id: string; target_type: string; target_id: string; reason: string }[];
  /** Support requests, oldest first, with who filed them. */
  tickets: (SupportTicket & { profile_id: string })[];
  /** Every verification request, oldest first, with who filed it. */
  verifications: (BusinessVerification & { business_id: string; owner_profile_id: string })[];
  viewer: LocalViewer;
}

export function createStore(viewer: LocalViewer = DEMO_CUSTOMER): LocalStore {
  return {
    deals: [...SEED_DEALS, ...SEED_PIPELINE_DEALS, ...SEED_ADMIN_QUEUE_DEALS].map((d) => ({
      ...d,
    })),
    actions: [],
    notifications: [],
    history: [],
    saved: new Set<string>(),
    outbox: [],
    reports: [],
    verifications: [],
    tickets: [],
    viewer,
  };
}

export interface LocalDataSource extends DataSource {
  readonly kind: 'local';
  /** Switches the signed-in account: customer, merchant or admin. */
  setViewer(v: LocalViewer): void;
  getViewer(): LocalViewer;
  /** Direct access for tests and for the outbox worker. */
  readonly store: LocalStore;
}

export function createLocalDataSource(
  store: LocalStore = createStore(),
): LocalDataSource {
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

  const notify = (
    profileId: string,
    kind: Notification['kind'],
    title: string,
    body: string,
    data: Record<string, unknown> = {},
  ) => {
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

  const isMember = (businessId: string) =>
    store.viewer.business_ids.includes(businessId) || store.viewer.is_admin;

  /** Resolves the acting role the way transition_deal() does. */
  const actorFor = (businessId: string): Actor => {
    if (store.viewer.is_admin) return 'admin';
    if (store.viewer.business_ids.includes(businessId)) return 'merchant';
    return 'system';
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

  /** The live, visible, in-radius candidate set both reads start from. */
  const candidates = (origin: LatLng | null, radiusKm: number | null): DealCardModel[] => {
    const now = Date.now();
    return store.deals
      .filter((d) => d.status === 'ACTIVE')
      .filter((d) => new Date(d.ends_at).getTime() > now)
      .filter((d) => new Date(d.starts_at).getTime() <= now)
      .map((d) => dealToCard(d, origin))
      .filter((c) => isVisibleTo(c, store.viewer))
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
    },
    getViewer() {
      return store.viewer;
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
      if (input.full_name !== undefined && input.full_name.trim().length < 2) {
        throw new RuleViolation('Enter your name');
      }
      // Kept on the demo account itself, so switching accounts and back keeps it;
      // the fresh object is what makes subscribers re-render.
      Object.assign(store.viewer, input);
      store.viewer = { ...store.viewer };
    },

    // The demo keeps the picked file's own URI; it lasts until the page reloads.
    async setAvatar(image): Promise<string> {
      Object.assign(store.viewer, { avatar_url: image.uri });
      store.viewer = { ...store.viewer };
      return image.uri;
    },

    async removeAvatar(): Promise<void> {
      Object.assign(store.viewer, { avatar_url: null });
      store.viewer = { ...store.viewer };
    },

    async createSupportTicket(input): Promise<string> {
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
      });
      emit('support.ticket_created', 'support_ticket', id, { topic: input.topic });
      return id;
    },

    async listMySupportTickets(): Promise<SupportTicket[]> {
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
        location: locality.centroid,
      });
      // Kept on the demo account too, so switching accounts and back keeps the
      // business; the fresh object is what makes subscribers re-render.
      store.viewer.business_ids.push(id);
      store.viewer = { ...store.viewer, business_ids: [...store.viewer.business_ids] };
      emit('merchant.business_created', 'business', id, { name });
      return id;
    },

    // Mirrors submit_business_verification() in 0006_merchant_onboarding.sql.
    async submitBusinessVerification(businessId, input): Promise<'pending'> {
      if (!store.viewer.business_ids.includes(businessId)) {
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
      if (!store.viewer.business_ids.includes(businessId) && !store.viewer.is_admin) return null;
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
        relevance: textRelevance(c, f.keywords),
      }));

      const ranked = scored
        .map((s) => ({
          card: s.card,
          score: scoreDeal({ deal: s.card, relevance: s.relevance, radiusKm }),
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
              return b.score - a.score;
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
        (a) => a.deal_id === id && a.customer_id === store.viewer.id,
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

      const verdict = checkAction({
        deal: card,
        viewer: store.viewer,
        actionType: input.action_type,
        quantity,
        slotStart: input.slot_start ?? null,
        existing: store.actions.filter((a) => a.customer_id === store.viewer.id),
      });
      if (!verdict.ok) throw new RuleViolation(verdict.reason ?? 'Not allowed');

      if (deal.capacity_remaining != null) {
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

      // Sold out closes the deal, same as the SQL does in one transaction.
      if (deal.capacity_remaining === 0) {
        move(deal.id, 'EXPIRED', 'sold out', 'system');
      }
      return action;
    },

    async cancelAction(actionId): Promise<CustomerAction> {
      const action = store.actions.find((a) => a.id === actionId);
      if (!action) throw new RuleViolation('Booking not found');
      if (action.customer_id !== store.viewer.id && !store.viewer.is_admin) {
        throw new RuleViolation('Not your booking');
      }
      if (action.status !== 'pending' && action.status !== 'confirmed') {
        throw new RuleViolation('This can no longer be cancelled');
      }
      action.status = 'cancelled';

      const deal = store.deals.find((d) => d.id === action.deal_id);
      if (deal && deal.capacity_remaining != null) {
        deal.capacity_remaining = Math.min(
          deal.capacity_remaining + action.quantity,
          deal.capacity_total ?? Number.MAX_SAFE_INTEGER,
        );
      }
      emit('action.cancelled', 'action', action.id, { deal_id: action.deal_id });
      return action;
    },

    async listMyActions(): Promise<ActionWithDeal[]> {
      return store.actions
        .filter((a) => a.customer_id === store.viewer.id)
        .map((a) => {
          const deal = store.deals.find((d) => d.id === a.deal_id)!;
          return { ...a, deal: dealToCard(deal, null) };
        });
    },

    async toggleSavedDeal(dealId): Promise<boolean> {
      if (store.saved.has(dealId)) {
        store.saved.delete(dealId);
        return false;
      }
      store.saved.add(dealId);
      return true;
    },

    async listSavedDeals(origin): Promise<DealCardModel[]> {
      return [...store.saved]
        .map((id) => store.deals.find((d) => d.id === id))
        .filter((d): d is Deal => Boolean(d))
        .map((d) => dealToCard(d, origin ?? null));
    },

    async reportTarget(targetType, targetId, reason): Promise<string> {
      const id = uid('rep');
      store.reports.push({ id, target_type: targetType, target_id: targetId, reason });
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

    async submitDeal(dealId): Promise<DealStatus> {
      return move(dealId, 'SUBMITTED');
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

      return {
        views: mine.reduce((s, d) => s + d.views, 0),
        searches: mine.reduce((s, d) => s + d.searches, 0),
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
      return action;
    },

    async listDealActions(dealId): Promise<CustomerAction[]> {
      const deal = findDeal(dealId);
      if (!isMember(deal.business_id)) throw new RuleViolation('Not your deal');
      return store.actions.filter((a) => a.deal_id === dealId);
    },

    async listReviewQueue(): Promise<DealCardModel[]> {
      if (!store.viewer.is_admin) throw new RuleViolation('Admin only');
      return store.deals
        .filter((d) => d.status === 'SUBMITTED' || d.status === 'VERIFICATION')
        .map((d) => dealToCard(d, null));
    },

    async reviewDeal(dealId, approve, reason): Promise<DealStatus> {
      if (!store.viewer.is_admin) throw new RuleViolation('Admin only');
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

      notify(
        DEMO_MERCHANT.id,
        approve ? 'deal_approved' : 'deal_rejected',
        approve ? 'Deal approved' : 'Deal needs changes',
        approve
          ? deal.title + ' is live and visible to customers.'
          : reason ?? 'Please review and resubmit.',
        { deal_id: dealId },
      );
      return status;
    },

    async listVerificationQueue(): Promise<VerificationRequest[]> {
      if (!store.viewer.is_admin) throw new RuleViolation('Admin only');
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

    async listSupportQueue(): Promise<SupportQueueItem[]> {
      if (!store.viewer.is_admin) throw new RuleViolation('Admin only');
      const people = [DEMO_CUSTOMER, DEMO_MERCHANT, DEMO_ADMIN];
      return store.tickets
        .filter((t) => t.status !== 'closed')
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
            deal_title: deal?.title ?? null,
            reply: t.reply,
          };
        });
    },

    async replySupportTicket(ticketId, reply, close): Promise<'answered' | 'closed'> {
      if (!store.viewer.is_admin) throw new RuleViolation('Admin only');
      if (reply.trim().length < 2) throw new RuleViolation('Write a reply first');
      const t = store.tickets.find((x) => x.id === ticketId);
      if (!t) throw new RuleViolation('That request no longer exists');
      t.status = close ? 'closed' : 'answered';
      t.reply = reply.trim();
      t.replied_at = new Date().toISOString();
      notify(t.profile_id, 'support_reply', 'YOLO support replied', reply.trim().slice(0, 160), {
        ticket_id: ticketId,
      });
      return t.status;
    },

    // Mirrors review_business() in 0006_merchant_onboarding.sql.
    async reviewBusiness(businessId, approve, reason): Promise<'verified' | 'rejected'> {
      if (!store.viewer.is_admin) throw new RuleViolation('Admin only');
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
        approve ? 'You are YOLO Verified' : 'Verification needs changes',
        approve ? b.name + ' now shows the YOLO Verified badge.' : reason!.trim(),
        { business_id: businessId },
      );
      emit('merchant.verification_changed', 'business', businessId, { status: state, reason });
      return state;
    },

    async listNotifications(): Promise<Notification[]> {
      return store.notifications.filter((n) => n.profile_id === store.viewer.id);
    },

    async markNotificationRead(id): Promise<void> {
      const n = store.notifications.find((x) => x.id === id);
      if (n) n.read_at = new Date().toISOString();
    },

    async recordEvents(events): Promise<void> {
      for (const e of events) {
        const deal = store.deals.find((d) => d.id === e.deal_id);
        if (!deal) continue;
        if (e.event_type === 'view') deal.views += 1;
        if (e.event_type === 'search_appearance') deal.searches += 1;
      }
    },
  };

  return src;
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
