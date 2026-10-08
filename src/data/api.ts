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

import type { Constitution, LicenceType } from '../lib/india-ids';
import type {
  AttributeValue,
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
  MenuItem,
  Review,
} from './types';
import type { Viewer } from '../domain/rules';

/**
 * The signed-in person as the app needs them: what the eligibility rules read,
 * plus the two gates (admin, business membership) that unlock admin and
 * merchant mode. Built from the session on Supabase; one of the demo accounts
 * locally.
 */
export interface AppViewer extends Viewer {
  is_admin: boolean;
  /** Businesses this account is a member of — the merchant-mode gate. */
  business_ids: string[];
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  /** Profile picture, ready to display; null when there is none. */
  avatar_url?: string | null;
  /** The first-run welcome is done (name, age, suggestions). Missing means done (older accounts). */
  onboarded?: boolean;
  /** Agreed to personalised suggestions and said they are 18 or older (migration 0018). */
  personalised?: boolean;
}

/** What a person can agree to, each on its own (DPDP Act 2023). */
export type ConsentPurpose = 'personalisation' | 'voice' | 'location' | 'marketing' | 'adult';

export interface ConsentState {
  purpose: ConsentPurpose;
  granted: boolean;
  created_at: string;
}

/** One thing someone did, for track() (0018); the server decides what it keeps. */
export interface ActivityEvent {
  name: string;
  session_id?: string;
  surface?: string;
  position?: number;
  deal_id?: string;
  business_id?: string;
  query?: string;
  props?: Record<string, unknown>;
}

/** Something they said "not for me" to. */
export interface HiddenItem {
  kind: 'deal' | 'business' | 'category';
  target_id: string;
  /** The deal's title, the place's or the category's name. */
  label: string;
  created_at: string;
}

/** The version of the privacy notice the app shows; recorded with every consent. */
export const NOTICE_VERSION = '2026-10-v1';

/** A picked image, as expo-image-picker returns it. */
export interface PickedImage {
  uri: string;
  mimeType?: string | null;
}

/** Where a one-time code is sent: a phone in E.164, or an email address. */
export type OtpTarget = { phone: string } | { email: string };

/**
 * Sign-in by one-time code. Only the Supabase backend has one; the local
 * demo switches accounts instead.
 */
export interface AuthApi {
  sendCode(target: OtpTarget): Promise<void>;
  verifyCode(target: OtpTarget, code: string): Promise<void>;
  signOut(): Promise<void>;
  /** The demo only: any email signs in straight away, no code. */
  signInWithoutCode?(target: OtpTarget): Promise<void>;
}

export interface FeedQuery {
  origin: LatLng;
  radius_m: number;
  section: FeedSection;
  limit?: number;
  offset?: number;
}

/** Open reports on one deal or business, for the admin reports queue. */
export interface ReportGroup {
  target_type: 'deal' | 'business' | 'review';
  target_id: string;
  title: string;
  business_id: string | null;
  business_name: string | null;
  deal_status: DealStatus | null;
  open_count: number;
  /** The distinct reasons given, e.g. "Misleading". */
  reasons: string[];
  /** What reporters wrote, newest first. */
  details: string[];
  first_at: string;
  last_at: string;
}

/** Home's "For you" rail: deals near them, ranked by what they like. */
export interface ForYouQuery {
  origin: LatLng;
  radius_m: number;
  limit?: number;
}

/** One thing a customer is into, learned from what they open, save and claim. */
export interface TasteItem {
  kind: 'category' | 'tag';
  /** Category slug, or the tag itself. */
  key: string;
  label: string;
  weight: number;
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
  attributes?: Record<string, AttributeValue>;
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

/** The fields a person edits about themselves; phone is the login, so not here. */
export interface ProfileUpdate {
  full_name?: string;
  email?: string | null;
  /** YYYY-MM-DD. Unlocks 18+ and 21+ deals. */
  date_of_birth?: string | null;
  /** Marks the first-run welcome as done. */
  onboarded?: boolean;
}

export type SupportTopic =
  | 'claim_problem'
  | 'payment_refund'
  | 'deal_wrong'
  | 'account'
  | 'account_deletion'
  | 'other';

/** A customer's request to YOLO support; see create_support_ticket(). */
/** One message in a support conversation. */
export interface SupportMessage {
  author: 'customer' | 'team';
  body: string;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  topic: SupportTopic;
  message: string;
  status: 'open' | 'answered' | 'closed';
  reply: string | null;
  replied_at: string | null;
  action_id: string | null;
  deal_id: string | null;
  created_at: string;
  /** The whole conversation, oldest first, starting with the first message. */
  messages: SupportMessage[];
}

/** A request as the admin inbox shows it. */
export interface SupportQueueItem {
  id: string;
  topic: SupportTopic;
  message: string;
  status: 'open' | 'answered' | 'closed';
  created_at: string;
  customer_name: string;
  customer_contact: string;
  redemption_code: string | null;
  action_status: string | null;
  deal_id: string | null;
  deal_title: string | null;
  reply: string | null;
  messages: SupportMessage[];
}

/** What a new merchant fills in to list their business; see create_business(). */
export interface NewBusinessInput {
  name: string;
  primary_category_id: string;
  locality_id: string;
  address_line: string;
  phone?: string;
  email?: string;
  /** What the business does and sells, in the owner's words. */
  description?: string;
  keywords?: string[];
  owner_role?: string;
  /** The shop's exact position, when pinned with the device; else the area's centre. */
  location?: { lat: number; lng: number };
  cost_for_two?: number | null;
  amenities?: string[];
  cuisines?: string[];
  open_time?: string | null;
  close_time?: string | null;
  photos?: string[];
  menu?: MenuItem[];
}

/** Stars and words about a redeemed visit. */
export interface NewReview {
  action_id: string;
  rating: number;
  body?: string;
}

/** How many bookings one time slot of a deal already holds. */
export interface SlotLoad {
  slot_start: string;
  taken: number;
}

/** One customer order on a business's deals, for the merchant's Orders list. */
export interface BusinessOrder extends CustomerAction {
  deal_title: string;
  deal_price: number | null;
  /** The customer's name or email where the merchant may see it. */
  customer_name: string | null;
}

/**
 * What an owner submits for the YOLO Verified badge; see
 * submit_business_verification(). Either a GSTIN, or a PAN plus a
 * registration (licence_type and licence_number). FSSAI is required for food.
 */
export interface VerificationInput {
  legal_name: string;
  constitution: Constitution;
  gstin?: string;
  pan?: string;
  licence_type?: LicenceType;
  licence_number?: string;
  fssai?: string;
  registered_address: string;
  owner_name: string;
  owner_role: 'owner' | 'partner' | 'director' | 'manager';
  declared: boolean;
}

/** The owner's latest request and how it went, for the dashboard card and the form. */
export interface BusinessVerification extends VerificationInput {
  status: 'submitted' | 'approved' | 'rejected';
  rejection_reason: string | null;
  submitted_at: string;
}

/** A business waiting for the YOLO Verified badge, as the admin queue shows it. */
export interface VerificationRequest {
  business_id: string;
  name: string;
  category_name: string;
  locality_name: string;
  address_line: string;
  phone: string;
  email: string;
  legal_name: string;
  constitution: Constitution;
  gstin: string | null;
  pan: string;
  licence_type: LicenceType | null;
  licence_number: string | null;
  fssai: string | null;
  registered_address: string;
  owner_name: string;
  owner_role: string;
  /** Other businesses that used the same GSTIN or PAN in a request not turned down. */
  same_id_elsewhere: number;
  submitted_at: string;
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
  /** Empty for a signed-out visitor or someone with no history yet. */
  feedForYou(q: ForYouQuery): Promise<DealCardModel[]>;
  getMyTaste(): Promise<TasteItem[]>;
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

  // ---- account and support ----
  updateMyProfile(input: ProfileUpdate): Promise<void>;
  /** Uploads a new profile picture and returns its URL. */
  setAvatar(image: PickedImage): Promise<string>;
  /** A merchant's own photo for a deal; returns the public URL to save in its media. */
  uploadDealPhoto(businessId: string, image: PickedImage): Promise<string>;
  removeAvatar(): Promise<void>;
  createSupportTicket(input: {
    topic: SupportTopic;
    message: string;
    action_id?: string;
    deal_id?: string;
  }): Promise<string>;
  listMySupportTickets(): Promise<SupportTicket[]>;
  /** Cancels open claims, forgets saved deals, and asks the team to remove the login. */
  requestAccountDeletion(reason?: string): Promise<void>;

  // ---- merchant ----
  /** Lists a business owned by the caller; the caller becomes a merchant. Returns its id. */
  createBusiness(input: NewBusinessInput): Promise<string>;
  /** Owner asks for the YOLO Verified badge; the business moves to 'pending'. */
  submitBusinessVerification(businessId: string, input: VerificationInput): Promise<'pending'>;
  /** The latest request for a business the caller belongs to, or null if none. */
  getBusinessVerification(businessId: string): Promise<BusinessVerification | null>;
  /** Name, phone, email, address and area; the same checks as createBusiness. */
  updateBusiness(businessId: string, input: Omit<NewBusinessInput, 'primary_category_id'>): Promise<void>;
  listBusinessDeals(businessId: string): Promise<DealCardModel[]>;
  saveDealDraft(input: DealDraftInput): Promise<string>;
  submitDeal(dealId: string): Promise<DealStatus>;
  transitionDeal(dealId: string, to: DealStatus, reason?: string): Promise<DealStatus>;
  duplicateDeal(dealId: string): Promise<string>;
  getDealHistory(dealId: string): Promise<DealStatusHistoryEntry[]>;
  getMerchantStats(businessId: string, days?: number): Promise<MerchantStats>;
  redeemAction(code: string): Promise<CustomerAction>;
  listDealActions(dealId: string): Promise<CustomerAction[]>;
  /** Orders on all of a business's deals, newest first. */
  listBusinessOrders(businessId: string): Promise<BusinessOrder[]>;
  /** Bookings held per upcoming time slot of a deal, for marking full slots. Anyone may ask. */
  listSlotLoad(dealId: string): Promise<SlotLoad[]>;

  /** A business's live deals, for its public shop page. */
  listShopDeals(businessId: string, origin: LatLng): Promise<DealCardModel[]>;

  // ---- reviews ----
  /** Visible reviews of a business or one deal, newest first. */
  listReviews(target: { businessId?: string; dealId?: string }, limit?: number): Promise<Review[]>;
  listMyReviews(): Promise<Review[]>;
  /** Rates a redeemed visit; one review per deal per customer. */
  createReview(input: NewReview): Promise<Review>;

  // ---- admin ----
  listReviewQueue(): Promise<DealCardModel[]>;
  reviewDeal(dealId: string, approve: boolean, reason?: string): Promise<DealStatus>;
  listVerificationQueue(): Promise<VerificationRequest[]>;
  /** Active requests (open, then answered), or closed ones. */
  listSupportQueue(view?: 'active' | 'closed'): Promise<SupportQueueItem[]>;
  /** The customer answers back on their own request; it opens again. */
  followUpSupportTicket(ticketId: string, message: string): Promise<'open'>;
  /** Admin: reported deals and businesses, most reported first. */
  listReportsQueue(): Promise<ReportGroup[]>;
  /** Admin: dismiss the reports, or pause the deal with a note its owner sees. Returns how many were settled. */
  resolveReports(
    targetType: ReportGroup['target_type'],
    targetId: string,
    action: 'dismiss' | 'pause',
    note?: string,
  ): Promise<number>;
  /** A reply, a close, or both; closing needs no reply. */
  replySupportTicket(ticketId: string, reply: string, close?: boolean): Promise<'answered' | 'closed'>;
  reviewBusiness(businessId: string, approve: boolean, reason?: string): Promise<'verified' | 'rejected'>;

  // ---- activity and privacy (0018) ----
  /** Fire and forget: never throws. */
  track(events: ActivityEvent[]): Promise<void>;
  getMyConsents(): Promise<ConsentState[]>;
  /** A yes or no for one purpose; no to personalisation also forgets what was learned. */
  setConsent(purpose: ConsentPurpose, granted: boolean, channel?: 'app' | 'voice' | 'web'): Promise<void>;
  /** "Clear my activity". */
  eraseMyActivity(): Promise<void>;
  /** "What do you know about me": counts of what was recorded. */
  getMyActivitySummary(): Promise<{ name: string; events: number; last_at: string }[]>;
  /** "Not for me": never suggest this deal, this place or this kind of thing again. */
  notInterested(dealId: string, scope: HiddenItem['kind']): Promise<void>;
  listHidden(): Promise<HiddenItem[]>;
  unhide(kind: HiddenItem['kind'], targetId: string): Promise<void>;

  // ---- notifications and analytics ----
  listNotifications(): Promise<Notification[]>;
  /** New notifications for the signed-in person as they are written; returns the unsubscribe. */
  subscribeNotifications(onNew: (n: Notification) => void): () => void;
  markNotificationRead(id: string): Promise<void>;
  recordEvents(
    events: { deal_id: string; event_type: string; source?: string }[],
  ): Promise<void>;

  /** Raw deal rows, used by the merchant wizard to rehydrate a draft. */
  getRawDeal(id: string): Promise<Deal | null>;
}
