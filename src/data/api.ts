/**
 * The single contract between the UI and the backend.
 *
 * Two adapters implement it:
 *   local.ts     — in-memory over the seed, no network, no accounts needed
 *   supabase.ts  — calls the RPCs in supabase/migrations/0002_functions.sql
 *
 * Every method name and argument shape matches a SQL function one-to-one, so
 * swapping adapters is a one-line change in index.ts and nothing in the UI
 * has to move. Screens must import from './data', never from an adapter.
 */

import type {
  Business,
  Category,
  CustomerAction,
  CustomerActionType,
  Deal,
  DealCardModel,
  DealStatus,
  DealStatusHistoryEntry,
  FeedSection,
  LatLng,
  Locality,
  Notification,
  SearchFilters,
} from './types';

export interface FeedQuery {
  origin: LatLng;
  radius_m: number;
  section: FeedSection;
  limit?: number;
  offset?: number;
}

export interface SearchQuery {
  /** The raw text the user typed, kept for logging and the chips row. */
  q: string;
  filters: SearchFilters;
  origin: LatLng;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  deals: DealCardModel[];
  /** Filters actually applied, so the UI can render removable chips. */
  applied: SearchFilters;
  /** Which parser produced them — drives the "Understood as" affordance. */
  parser: 'llm' | 'rules' | 'cache';
  total: number;
}

export interface TakeActionInput {
  deal_id: string;
  action_type: CustomerActionType;
  quantity?: number;
  slot_start?: string | null;
  payload?: Record<string, unknown>;
}

export interface MerchantStats {
  views: number;
  searches: number;
  claims: number;
  bookings: number;
  enquiries: number;
  active_count: number;
  draft_count: number;
  pending_count: number;
  expired_count: number;
}

/** What the 7-step wizard accumulates and posts on every Next / Save Draft. */
export interface DealDraftInput {
  id?: string;
  business_id: string;
  category_id?: string;
  category_slug?: string;
  deal_type_code?: string;
  offering_kind?: string;
  title?: string;
  short_description?: string;
  description?: string;
  original_price?: number | null;
  deal_price?: number | null;
  price_unit?: string | null;
  taxes_note?: string | null;
  min_purchase?: number | null;
  max_qty_per_customer?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  capacity_total?: number | null;
  booking_required?: boolean;
  cancellation_policy?: string | null;
  terms?: string | null;
  attributes?: Record<string, string | number | boolean>;
  tags?: string[];
  lat?: number;
  lng?: number;
  media?: { kind: 'image' | 'video'; storage_path: string }[];
  availability?: { day_of_week: number | null; start_time: string; end_time: string }[];
  eligibility?: {
    audience?: string;
    min_age?: number | null;
    min_spend?: number | null;
    membership_required?: boolean;
    advance_booking_hours?: number | null;
    custom_rule?: string | null;
  };
  actions?: { action_type: string; is_primary: boolean; label?: string }[];
}

export interface ActionWithDeal extends CustomerAction {
  deal: DealCardModel;
}

/**
 * A failure the UI is expected to show verbatim — "only 2 left", "this deal is
 * restricted to 21 and above". Anything else is a bug and should surface as a
 * generic error, so the two are deliberately distinguishable.
 */
export class RuleViolation extends Error {
  readonly expected = true;
  constructor(message: string) {
    super(message);
    this.name = 'RuleViolation';
  }
}

export interface DataSource {
  readonly kind: 'local' | 'supabase';

  // ---- taxonomy and reference ----
  getCategories(): Promise<Category[]>;
  getLocalities(): Promise<Locality[]>;
  getBusiness(id: string): Promise<Business | null>;

  // ---- customer reads ----
  feedNearby(q: FeedQuery): Promise<DealCardModel[]>;
  searchDeals(q: SearchQuery): Promise<SearchResult>;
  getDeal(id: string, origin?: LatLng): Promise<DealCardModel | null>;

  // ---- customer writes ----
  takeDealAction(input: TakeActionInput): Promise<CustomerAction>;
  cancelAction(actionId: string): Promise<CustomerAction>;
  listMyActions(): Promise<ActionWithDeal[]>;
  toggleSavedDeal(dealId: string): Promise<boolean>;
  listSavedDeals(origin?: LatLng): Promise<DealCardModel[]>;
  reportTarget(
    targetType: 'deal' | 'business' | 'review',
    targetId: string,
    reason: string,
    details?: string,
  ): Promise<string>;

  // ---- merchant ----
  listBusinessDeals(businessId: string): Promise<DealCardModel[]>;
  saveDealDraft(input: DealDraftInput): Promise<string>;
  submitDeal(dealId: string): Promise<DealStatus>;
  transitionDeal(dealId: string, to: DealStatus, reason?: string): Promise<DealStatus>;
  duplicateDeal(dealId: string): Promise<string>;
  getDealHistory(dealId: string): Promise<DealStatusHistoryEntry[]>;
  getMerchantStats(businessId: string, days?: number): Promise<MerchantStats>;
  redeemAction(code: string): Promise<CustomerAction>;
  listDealActions(dealId: string): Promise<CustomerAction[]>;

  // ---- admin ----
  listReviewQueue(): Promise<DealCardModel[]>;
  reviewDeal(dealId: string, approve: boolean, reason?: string): Promise<DealStatus>;

  // ---- notifications and analytics ----
  listNotifications(): Promise<Notification[]>;
  markNotificationRead(id: string): Promise<void>;
  recordEvents(
    events: { deal_id: string; event_type: string; source?: string }[],
  ): Promise<void>;

  /** Raw deal rows, used by the merchant wizard to rehydrate a draft. */
  getRawDeal(id: string): Promise<Deal | null>;
}
