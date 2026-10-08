/**
 * The Supabase adapter: the same DataSource contract as local.ts, answered by
 * the RPCs and tables in supabase/migrations.
 *
 * Rules live in the database. This file only translates: arguments into the
 * p_-prefixed RPC parameters, rows back into the app's models through
 * mapping.ts, and Postgres errors into RuleViolation when they are the
 * user-facing kind ("only 2 left"). Nothing here decides who may do what.
 *
 * Screens never import this file; src/data/index.ts picks the adapter.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, REALTIME_SUBSCRIBE_STATES, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import {
  RuleViolation,
  type ActionWithDeal,
  type AppViewer,
  type AuthApi,
  type ConsentPurpose,
  type HiddenItem,
  NOTICE_VERSION,
  type BusinessVerification,
  type DataSource,
  type MerchantStats,
  type NewBusinessInput,
  type OtpTarget,
  type ReportGroup,
  type SupportMessage,
  type SupportQueueItem,
  type SupportTicket,
  type VerificationRequest,
} from './api';
import { draftToPayload, num, rowToAction, rowToDealCard, type DealCardRow } from './mapping';
import { ageFrom } from '../domain/rules';
import type {
  Business,
  Category,
  CustomerAction,
  DealCardModel,
  DealStatus,
  DealStatusHistoryEntry,
  Locality,
  Notification,
  Review,
} from './types';

/**
 * True while the website is being pre-rendered in Node at build time: no
 * window, no storage, no session. The page loads in a browser and signs in
 * from there.
 */
const PRERENDER = Platform.OS === 'web' && typeof window === 'undefined';

export function createSupabase(url: string, key: string): SupabaseClient {
  const client = createClient(url, key, {
    auth: {
      storage: PRERENDER ? undefined : AsyncStorage,
      autoRefreshToken: !PRERENDER,
      persistSession: !PRERENDER,
      // There is no URL to read a session from in a native app.
      detectSessionInUrl: false,
    },
  });

  // On a phone, refresh the session only while the app is in the foreground,
  // and pick up straight away when it comes back.
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (state) => {
      if (state === 'active') void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    });
  }
  return client;
}

// --------------------------------------------------------------- errors ----

/**
 * Business-rule refusals raised by the RPCs (P0001, and 42501 for "not a
 * member", "admin only") are meant for the person and become RuleViolation.
 * Anything else is a bug or an outage and stays a plain Error.
 */
function fail(error: PostgrestError): never {
  const message = error.message || 'Request failed';
  // P0002 "code not recognised" / "not found" and 22023 bad input are for the person too.
  if (error.code === 'P0001' || error.code === '42501' || error.code === 'P0002' || error.code === '22023') {
    throw new RuleViolation(message.charAt(0).toUpperCase() + message.slice(1));
  }
  throw new Error(message);
}

/** A uuid-typed parameter given something else, e.g. an old demo link to /deal/d-010. */
const isBadUuid = (e: PostgrestError | null) => e?.code === '22P02';

/** Numbers each live-notification channel, so no two share a topic. */
let channelSeq = 0;

/** A row from list_reviews, my_reviews or create_review (0016). */
interface ReviewRow {
  id: string;
  deal_id: string;
  deal_title: string | null;
  business_id: string | null;
  /** Only ever your own; null for other people's reviews. */
  customer_id: string | null;
  /** "Aarav S.", or null when they gave no name. */
  customer_name: string | null;
  rating: number;
  body: string | null;
  created_at: string;
  action_id: string | null;
}

function rowToReview(row: unknown): Review {
  const r = row as ReviewRow;
  return {
    id: r.id,
    deal_id: r.deal_id,
    deal_title: r.deal_title ?? undefined,
    business_id: r.business_id ?? '',
    customer_id: r.customer_id ?? '',
    customer_name: r.customer_name,
    rating: Number(r.rating),
    body: r.body,
    created_at: r.created_at,
    action_id: r.action_id,
  };
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/**
 * The optional shop details and the pin, only the ones given: update_business
 * leaves anything not sent as it was.
 */
function businessExtras(input: Omit<NewBusinessInput, 'primary_category_id'>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.location) {
    out.lat = input.location.lat;
    out.lng = input.location.lng;
  }
  const keys = [
    'description', 'keywords', 'owner_role', 'cost_for_two', 'amenities', 'cuisines',
    'open_time', 'close_time', 'photos', 'menu',
  ] as const;
  for (const k of keys) if (input[k] !== undefined) out[k] = input[k];
  return out;
}

function cards(rows: unknown): DealCardModel[] {
  return ((rows as DealCardRow[] | null) ?? []).map(rowToDealCard);
}

// -------------------------------------------------------------- session ----

async function userId(client: SupabaseClient): Promise<string | null> {
  const { data } = await client.auth.getSession();
  return data.session?.user.id ?? null;
}

async function requireUser(client: SupabaseClient, why: string): Promise<string> {
  const id = await userId(client);
  if (!id) throw new RuleViolation(why);
  return id;
}

/** The viewer for the current session, or null when signed out. */
export async function loadViewer(client: SupabaseClient): Promise<AppViewer | null> {
  const id = await userId(client);
  if (!id) return null;
  const [profile, members, consents] = await Promise.all([
    client
      .from('profiles')
      .select('full_name, phone, email, date_of_birth, is_yolo_verified, is_admin, avatar_path, onboarded_at')
      .eq('id', id)
      .maybeSingle(),
    client.from('business_members').select('business_id').eq('profile_id', id),
    client.rpc('my_consents'),
  ]);
  if (profile.error) fail(profile.error);
  if (members.error) fail(members.error);
  const p = profile.data;
  // A database without 0018 yet answers with an error: nobody is personalised then.
  const said = (purpose: string) =>
    ((consents.data as { purpose: string; granted: boolean }[] | null) ?? []).some(
      (c) => c.purpose === purpose && c.granted,
    );
  // As may_personalise() in 0019: a date of birth under 18 stops it, whatever was said.
  const age = ageFrom(p?.date_of_birth ?? null);
  return {
    id,
    date_of_birth: p?.date_of_birth ?? null,
    is_yolo_verified: p?.is_yolo_verified ?? false,
    is_admin: p?.is_admin ?? false,
    business_ids: (members.data ?? []).map((m) => m.business_id as string),
    full_name: p?.full_name ?? null,
    phone: p?.phone ?? null,
    email: p?.email ?? null,
    avatar_url: p?.avatar_path ? avatarUrl(client, p.avatar_path) : null,
    onboarded: Boolean(p?.onboarded_at),
    personalised: said('personalisation') && said('adult') && !(age !== null && age < 18),
  };
}

/** Public URL of a file in the avatars bucket. */
function avatarUrl(client: SupabaseClient, path: string): string {
  return client.storage.from(AVATARS).getPublicUrl(path).data.publicUrl;
}

const AVATARS = 'avatars';
const DEAL_PHOTOS = 'deal-photos';
const AVATAR_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function createSupabaseAuth(client: SupabaseClient): AuthApi {
  return {
    async sendCode(target: OtpTarget) {
      const { error } =
        'phone' in target
          ? await client.auth.signInWithOtp({ phone: target.phone })
          : await client.auth.signInWithOtp({ email: target.email });
      if (error) throw new RuleViolation(error.message);
    },
    async verifyCode(target: OtpTarget, code: string) {
      const { error } =
        'phone' in target
          ? await client.auth.verifyOtp({ phone: target.phone, token: code, type: 'sms' })
          : await client.auth.verifyOtp({ email: target.email, token: code, type: 'email' });
      if (error) throw new RuleViolation(error.message);
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw new Error(error.message);
    },
  };
}

// ------------------------------------------------------------ data source ----

export function createSupabaseDataSource(client: SupabaseClient): DataSource {
  const rpc = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
    const { data, error } = await client.rpc(fn, args);
    if (error) fail(error);
    return data as T;
  };

  return {
    kind: 'supabase',

    // ---- taxonomy and reference ----

    async getCategories(): Promise<Category[]> {
      const { data, error } = await client
        .from('categories')
        .select('id, slug, name, vertical, icon, parent_id, attribute_schema')
        .order('sort_order');
      if (error) fail(error);
      return (data ?? []).map((c) => ({
        ...c,
        icon: c.icon ?? '',
        attribute_schema: c.attribute_schema ?? {},
      })) as Category[];
    },

    async getLocalities(): Promise<Locality[]> {
      const rows = await rpc<
        { id: string; name: string; city: string; lat: number; lng: number; aliases: string[] }[]
      >('list_localities');
      return rows.map((l) => ({
        id: l.id,
        name: l.name,
        city: l.city,
        centroid: { lat: l.lat, lng: l.lng },
        aliases: l.aliases ?? [],
      }));
    },

    async getBusiness(id): Promise<Business | null> {
      const { data, error } = await client.rpc('get_business', { p_business_id: id });
      if (isBadUuid(error)) return null;
      if (error) fail(error);
      const b = (data as Record<string, unknown>[] | null)?.[0];
      if (!b) return null;
      return {
        id: String(b.id),
        name: String(b.name),
        phone: (b.phone as string | null) ?? '',
        email: (b.email as string | null) ?? '',
        primary_category_id: (b.primary_category_id as string | null) ?? '',
        verification_status: b.verification_status as Business['verification_status'],
        rating_avg: num(b.rating_avg as string | number | null) ?? 0,
        rating_count: Number(b.rating_count ?? 0),
        locality_id: (b.locality_id as string | null) ?? '',
        address_line: (b.address_line as string | null) ?? '',
        location: { lat: Number(b.lat ?? 0), lng: Number(b.lng ?? 0) },
        description: str(b.description),
        keywords: strs(b.keywords),
        owner_role: str(b.owner_role),
        cost_for_two: b.cost_for_two == null ? null : Number(b.cost_for_two),
        amenities: strs(b.amenities),
        cuisines: strs(b.cuisines),
        open_time: str(b.open_time),
        close_time: str(b.close_time),
        photos: strs(b.photos),
        menu: Array.isArray(b.menu) ? (b.menu as Business['menu']) : [],
      };
    },

    // ---- customer reads ----

    async feedNearby(q) {
      return cards(
        await rpc('feed_nearby', {
          p_lat: q.origin.lat,
          p_lng: q.origin.lng,
          p_radius_m: q.radius_m,
          p_section: q.section,
          p_limit: q.limit ?? 20,
          p_offset: q.offset ?? 0,
        }),
      );
    },

    async feedForYou(q) {
      if (!(await userId(client))) return [];
      return cards(
        await rpc('feed_for_you', {
          p_lat: q.origin.lat,
          p_lng: q.origin.lng,
          p_radius_m: q.radius_m,
          p_limit: q.limit ?? 12,
        }),
      );
    },

    async getMyTaste() {
      if (!(await userId(client))) return [];
      const rows = await rpc<{ kind: 'category' | 'tag'; key: string; label: string; weight: number }[]>(
        'my_taste',
      );
      return (rows ?? []).map((r) => ({ ...r, weight: Number(r.weight) }));
    },

    async searchDeals(q) {
      // search_deals ranks the whole match set; PostgREST pages it and counts
      // the total, so "24 deals" and infinite scroll both come from one call.
      const limit = q.limit ?? 20;
      const offset = q.offset ?? 0;
      const { data, error, count } = await client
        .rpc(
          'search_deals',
          {
            p_filters: { ...q.filters, q: q.q },
            p_lat: q.origin.lat,
            p_lng: q.origin.lng,
            p_limit: 1000,
            p_offset: 0,
          },
          { count: 'exact' },
        )
        .range(offset, offset + limit - 1);
      if (error) fail(error);
      return { deals: cards(data), applied: q.filters, parser: 'rules', total: count ?? 0 };
    },

    async getDeal(id, origin) {
      const { data, error } = await client.rpc('get_deal', {
        p_deal_id: id,
        p_lat: origin?.lat ?? null,
        p_lng: origin?.lng ?? null,
      });
      if (isBadUuid(error)) return null;
      if (error) fail(error);
      return cards(data)[0] ?? null;
    },

    // ---- customer writes ----

    async takeDealAction(input): Promise<CustomerAction> {
      return rowToAction(
        await rpc('take_deal_action', {
          p_deal_id: input.deal_id,
          p_action_type: input.action_type,
          p_quantity: input.quantity ?? 1,
          p_slot_start: input.slot_start ?? null,
          p_payload: input.payload ?? {},
        }),
      );
    },

    async cancelAction(actionId) {
      return rowToAction(await rpc('cancel_action', { p_action_id: actionId }));
    },

    async listMyActions(): Promise<ActionWithDeal[]> {
      const id = await userId(client);
      if (!id) return [];
      const [actions, dealRows] = await Promise.all([
        client
          .from('customer_actions')
          .select('*')
          .eq('customer_id', id)
          .order('created_at', { ascending: false }),
        rpc('my_action_deals'),
      ]);
      if (actions.error) fail(actions.error);
      const byId = new Map(cards(dealRows).map((d) => [d.id, d]));
      return (actions.data ?? []).flatMap((row) => {
        const action = rowToAction(row);
        const deal = byId.get(action.deal_id);
        return deal ? [{ ...action, deal }] : [];
      });
    },

    async toggleSavedDeal(dealId) {
      const id = await requireUser(client, 'Sign in to save deals');
      const existing = await client
        .from('saved_deals')
        .select('deal_id')
        .eq('profile_id', id)
        .eq('deal_id', dealId)
        .maybeSingle();
      if (existing.error) fail(existing.error);
      if (existing.data) {
        const { error } = await client
          .from('saved_deals')
          .delete()
          .eq('profile_id', id)
          .eq('deal_id', dealId);
        if (error) fail(error);
        return false;
      }
      const { error } = await client.from('saved_deals').insert({ profile_id: id, deal_id: dealId });
      if (error) fail(error);
      return true;
    },

    async listSavedDeals(origin) {
      if (!(await userId(client))) return [];
      return cards(
        await rpc('saved_deal_cards', { p_lat: origin?.lat ?? null, p_lng: origin?.lng ?? null }),
      );
    },

    async reportTarget(targetType, targetId, reason, details) {
      return rpc<string>('report_target', {
        p_target_type: targetType,
        p_target_id: targetId,
        p_reason: reason,
        p_details: details ?? null,
      });
    },

    // ---- merchant ----

    async listBusinessDeals(businessId) {
      return cards(await rpc('business_deals', { p_business_id: businessId }));
    },

    async saveDealDraft(input) {
      return rpc<string>('save_deal_draft', { p_deal: draftToPayload(input) });
    },

    async submitDeal(dealId) {
      return rpc<DealStatus>('transition_deal', { p_deal_id: dealId, p_to_status: 'SUBMITTED' });
    },

    async transitionDeal(dealId, to, reason) {
      // The database works out whether the caller is acting as merchant or
      // admin from the session; nothing here can claim a role.
      return rpc<DealStatus>('transition_deal', {
        p_deal_id: dealId,
        p_to_status: to,
        p_reason: reason ?? null,
      });
    },

    async duplicateDeal(dealId) {
      return rpc<string>('duplicate_deal', { p_deal_id: dealId });
    },

    async getDealHistory(dealId): Promise<DealStatusHistoryEntry[]> {
      const { data, error } = await client
        .from('deal_status_history')
        .select('id, deal_id, from_status, to_status, actor, reason, created_at')
        .eq('deal_id', dealId)
        .order('created_at');
      if (error) fail(error);
      return (data ?? []).map((h) => ({ ...h, id: String(h.id) })) as DealStatusHistoryEntry[];
    },

    async getMerchantStats(businessId, days = 7): Promise<MerchantStats> {
      const rows = await rpc<MerchantStats[]>('merchant_stats', {
        p_business_id: businessId,
        p_days: days,
      });
      return (
        rows[0] ?? {
          views: 0,
          searches: 0,
          claims: 0,
          bookings: 0,
          enquiries: 0,
          active_count: 0,
          draft_count: 0,
          pending_count: 0,
          expired_count: 0,
        }
      );
    },

    async redeemAction(code) {
      return rowToAction(await rpc('redeem_action', { p_code: code.trim().toUpperCase() }));
    },

    async listDealActions(dealId) {
      const { data, error } = await client
        .from('customer_actions')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });
      if (error) fail(error);
      return (data ?? []).map(rowToAction);
    },

    async listShopDeals(businessId, origin) {
      const { data, error } = await client.rpc('shop_deals', {
        p_business_id: businessId,
        p_lat: origin?.lat ?? null,
        p_lng: origin?.lng ?? null,
      });
      // An old demo link (/shop/biz-rangoli): nothing to list, and the page says the shop is not there.
      if (isBadUuid(error)) return [];
      if (error) fail(error);
      return cards(data);
    },

    // Reviews go through 0016's RPCs: kept after a deal ends, with a first name
    // and initial, and written only for a visit whose code was used.
    async listReviews(target, limit = 50) {
      const { data, error } = await client.rpc('list_reviews', {
        p_business_id: target.businessId ?? null,
        p_deal_id: target.dealId ?? null,
        p_limit: limit,
      });
      if (isBadUuid(error)) return [];
      if (error) fail(error);
      return ((data as unknown[] | null) ?? []).map(rowToReview);
    },

    async listMyReviews() {
      const { data: auth } = await client.auth.getUser();
      if (!auth.user) return [];
      return ((await rpc<unknown[] | null>('my_reviews')) ?? []).map(rowToReview);
    },

    async createReview(input) {
      const rows = await rpc<unknown[] | null>('create_review', {
        p_action_id: input.action_id,
        p_rating: Math.round(input.rating),
        p_body: (input.body ?? '').trim().slice(0, 1000) || null,
      });
      const row = rows?.[0];
      if (!row) throw new Error('The review was not saved');
      return rowToReview(row);
    },

    async listSlotLoad(dealId) {
      const rows = await rpc<{ slot_start: string; taken: number }[] | null>('deal_slot_load', { p_deal_id: dealId });
      return (rows ?? []).map((r) => ({ slot_start: r.slot_start, taken: Number(r.taken) }));
    },

    async listBusinessOrders(businessId) {
      const deals = cards(await rpc('business_deals', { p_business_id: businessId }));
      if (deals.length === 0) return [];
      const byId = new Map(deals.map((d) => [d.id, d]));
      const { data, error } = await client
        .from('customer_actions')
        .select('*')
        .in(
          'deal_id',
          deals.map((d) => d.id),
        )
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) fail(error);
      // First name and initial for the team (0019); a database without it shows the code instead.
      const names = new Map<string, string | null>();
      const { data: named } = await client.rpc('business_customer_names', { p_business_id: businessId });
      for (const r of (named ?? []) as { action_id: string; customer_name: string | null }[]) {
        names.set(r.action_id, r.customer_name);
      }
      return (data ?? []).map(rowToAction).map((a) => ({
        ...a,
        deal_title: byId.get(a.deal_id)?.title ?? 'Deal',
        deal_price: byId.get(a.deal_id)?.deal_price ?? null,
        customer_name: names.get(a.id) ?? null,
      }));
    },

    // ---- account and support ----

    async updateMyProfile(input) {
      const uid = await userId(client);
      if (!uid) throw new RuleViolation('Sign in first');
      // Column grants (0003) allow exactly these fields; anything else is refused.
      const { onboarded, ...fields } = input;
      const row = { ...fields, ...(onboarded ? { onboarded_at: new Date().toISOString() } : {}) };
      const { error } = await client.from('profiles').update(row).eq('id', uid);
      if (error) fail(error);
    },

    async setAvatar(image) {
      const uid = await userId(client);
      if (!uid) throw new RuleViolation('Sign in first');
      const type = image.mimeType && AVATAR_TYPES[image.mimeType] ? image.mimeType : 'image/jpeg';
      // A new name every time: a fixed name would be served stale from caches.
      const path = uid + '/avatar-' + Date.now() + '.' + AVATAR_TYPES[type];
      const body = await (await fetch(image.uri)).arrayBuffer();
      if (body.byteLength > 2 * 1024 * 1024) throw new RuleViolation('Choose a picture under 2 MB');

      const up = await client.storage.from(AVATARS).upload(path, body, { contentType: type });
      if (up.error) throw new RuleViolation('That picture did not upload. Try another one.');

      const before = await client.from('profiles').select('avatar_path').eq('id', uid).maybeSingle();
      const { error } = await client.from('profiles').update({ avatar_path: path }).eq('id', uid);
      if (error) fail(error);
      // Best effort: the old file is only clutter if this fails.
      const old = before.data?.avatar_path as string | null | undefined;
      if (old && old !== path) void client.storage.from(AVATARS).remove([old]);
      return avatarUrl(client, path);
    },

    async uploadDealPhoto(businessId, image) {
      if (!(await userId(client))) throw new RuleViolation('Sign in first');
      const type = image.mimeType && AVATAR_TYPES[image.mimeType] ? image.mimeType : 'image/jpeg';
      const path = businessId + '/deal-' + Date.now() + '.' + AVATAR_TYPES[type];
      const body = await (await fetch(image.uri)).arrayBuffer();
      if (body.byteLength > 5 * 1024 * 1024) throw new RuleViolation('Choose a photo under 5 MB');
      const up = await client.storage.from(DEAL_PHOTOS).upload(path, body, { contentType: type });
      if (up.error) throw new RuleViolation('That photo did not upload. Try another one.');
      return client.storage.from(DEAL_PHOTOS).getPublicUrl(path).data.publicUrl;
    },

    async removeAvatar() {
      const uid = await userId(client);
      if (!uid) throw new RuleViolation('Sign in first');
      const before = await client.from('profiles').select('avatar_path').eq('id', uid).maybeSingle();
      const { error } = await client.from('profiles').update({ avatar_path: null }).eq('id', uid);
      if (error) fail(error);
      const old = before.data?.avatar_path as string | null | undefined;
      if (old) void client.storage.from(AVATARS).remove([old]);
    },

    async createSupportTicket(input) {
      return rpc<string>('create_support_ticket', { p: input });
    },

    async listMySupportTickets() {
      if (!(await userId(client))) return [];
      const { data, error } = await client
        .from('support_tickets')
        .select('id, topic, message, status, reply, replied_at, action_id, deal_id, created_at, support_messages(author, body, created_at)')
        .order('created_at', { ascending: false });
      if (error) fail(error);
      return ((data ?? []) as (Omit<SupportTicket, 'messages'> & { support_messages: SupportMessage[] | null })[]).map(
        ({ support_messages, ...t }) => ({
          ...t,
          messages: [...(support_messages ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
        }),
      );
    },

    async requestAccountDeletion(reason) {
      await rpc('request_account_deletion', { p_reason: reason ?? null });
    },

    // ---- merchant onboarding ----

    async createBusiness(input) {
      return rpc<string>('create_business', {
        p: {
          name: input.name,
          primary_category_id: input.primary_category_id,
          locality_id: input.locality_id,
          address_line: input.address_line,
          phone: input.phone || null,
          email: input.email || null,
          ...businessExtras(input),
        },
      });
    },

    async updateBusiness(businessId, input) {
      await rpc('update_business', {
        p_business_id: businessId,
        p: {
          name: input.name,
          locality_id: input.locality_id,
          address_line: input.address_line,
          phone: input.phone || null,
          email: input.email || null,
          ...businessExtras(input),
        },
      });
    },

    async submitBusinessVerification(businessId, input) {
      return rpc<'pending'>('submit_business_verification', { p_business_id: businessId, p: input });
    },

    // Read straight from the table: RLS lets members (and admins) see their own requests.
    async getBusinessVerification(businessId) {
      const { data, error } = await client
        .from('business_verifications')
        .select(
          'status, rejection_reason, created_at, legal_name, constitution, gstin, pan, licence_type, ' +
            'licence_number, fssai, registered_address, owner_name, owner_role',
        )
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (isBadUuid(error)) return null;
      if (error) fail(error);
      if (!data) return null;
      const r = data as unknown as Record<string, string | null>;
      return {
        status: r.status as BusinessVerification['status'],
        rejection_reason: r.rejection_reason,
        submitted_at: String(r.created_at),
        legal_name: r.legal_name ?? '',
        constitution: (r.constitution ?? 'other') as BusinessVerification['constitution'],
        gstin: r.gstin ?? undefined,
        pan: r.pan ?? undefined,
        licence_type: (r.licence_type ?? undefined) as BusinessVerification['licence_type'],
        licence_number: r.licence_number ?? undefined,
        fssai: r.fssai ?? undefined,
        registered_address: r.registered_address ?? '',
        owner_name: r.owner_name ?? '',
        owner_role: (r.owner_role ?? 'owner') as BusinessVerification['owner_role'],
        declared: true,
      };
    },

    // ---- admin ----

    async listVerificationQueue() {
      const rows = await rpc<Record<string, unknown>[]>('business_verification_queue');
      const text = (v: unknown) => (v as string | null) ?? '';
      const maybe = (v: unknown) => (v as string | null) ?? null;
      return (rows ?? []).map((r) => ({
        business_id: String(r.business_id),
        name: String(r.name),
        category_name: text(r.category_name),
        locality_name: text(r.locality_name),
        address_line: text(r.address_line),
        phone: text(r.phone),
        email: text(r.email),
        legal_name: text(r.legal_name),
        constitution: (r.constitution ?? 'other') as VerificationRequest['constitution'],
        gstin: maybe(r.gstin),
        pan: text(r.pan),
        licence_type: maybe(r.licence_type) as VerificationRequest['licence_type'],
        licence_number: maybe(r.licence_number),
        fssai: maybe(r.fssai),
        registered_address: text(r.registered_address),
        owner_name: text(r.owner_name),
        owner_role: text(r.owner_role),
        same_id_elsewhere: Number(r.same_id_elsewhere ?? 0),
        submitted_at: String(r.submitted_at),
      }));
    },

    async listReportsQueue() {
      const rows = await rpc<Record<string, unknown>[]>('reports_queue');
      return (rows ?? []).map((r) => ({
        target_type: r.target_type as ReportGroup['target_type'],
        target_id: String(r.target_id),
        title: String(r.title ?? ''),
        business_id: (r.business_id as string | null) ?? null,
        business_name: (r.business_name as string | null) ?? null,
        deal_status: (r.deal_status as DealStatus | null) ?? null,
        open_count: Number(r.open_count ?? 0),
        reasons: (r.reasons as string[] | null) ?? [],
        details: (r.details as string[] | null) ?? [],
        first_at: String(r.first_at),
        last_at: String(r.last_at),
      }));
    },

    async resolveReports(targetType, targetId, action, note) {
      return rpc<number>('resolve_reports', {
        p_target_type: targetType,
        p_target_id: targetId,
        p_action: action,
        p_note: note ?? null,
      });
    },

    async listSupportQueue(view) {
      return ((await rpc<SupportQueueItem[]>('support_queue', { p_view: view ?? 'active' })) ?? []).map((r) => ({
        ...r,
        customer_name: r.customer_name ?? '',
        customer_contact: r.customer_contact ?? '',
        messages: r.messages ?? [],
      }));
    },

    async followUpSupportTicket(ticketId, message) {
      return rpc<'open'>('follow_up_support_ticket', { p_ticket_id: ticketId, p_message: message });
    },

    async replySupportTicket(ticketId, reply, close) {
      return rpc<'answered' | 'closed'>('reply_support_ticket', {
        p_ticket_id: ticketId,
        p_reply: reply,
        p_close: close ?? false,
      });
    },

    async reviewBusiness(businessId, approve, reason) {
      return rpc<'verified' | 'rejected'>('review_business', {
        p_business_id: businessId,
        p_approve: approve,
        p_reason: reason ?? null,
      });
    },

    async listReviewQueue() {
      return cards(await rpc('review_queue'));
    },

    async reviewDeal(dealId, approve, reason) {
      return rpc<DealStatus>('review_deal', {
        p_deal_id: dealId,
        p_approve: approve,
        p_reason: reason ?? null,
      });
    },

    // ---- notifications and analytics ----

    async listNotifications(): Promise<Notification[]> {
      if (!(await userId(client))) return [];
      const { data, error } = await client
        .from('notifications')
        .select('id, profile_id, kind, title, body, data, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) fail(error);
      return (data ?? []).map((n) => ({ ...n, body: n.body ?? '', data: n.data ?? {} })) as Notification[];
    },

    async markNotificationRead(id) {
      const { error } = await client
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) fail(error);
    },

    // ---- activity and privacy (0018) ----

    async track(events) {
      if (events.length === 0) return;
      // Never throws: a lost event must not break a screen.
      await client.rpc('track', { p_events: events }).then(
        () => undefined,
        () => undefined,
      );
    },

    async getMyConsents() {
      const rows = await rpc<{ purpose: ConsentPurpose; granted: boolean; created_at: string }[] | null>('my_consents');
      return (rows ?? []).map((r) => ({ purpose: r.purpose, granted: r.granted, created_at: r.created_at }));
    },

    async setConsent(purpose, granted, channel = 'app') {
      await rpc('set_consent', {
        p_purpose: purpose,
        p_granted: granted,
        p_notice_version: NOTICE_VERSION,
        p_channel: channel,
      });
    },

    async eraseMyActivity() {
      await rpc('erase_my_activity');
    },

    async getMyActivitySummary() {
      const rows = await rpc<{ name: string; events: number; last_at: string }[] | null>('my_activity_summary');
      return (rows ?? []).map((r) => ({ name: r.name, events: Number(r.events), last_at: r.last_at }));
    },

    async notInterested(dealId, scope) {
      await rpc('not_interested', { p_deal_id: dealId, p_scope: scope });
    },

    async listHidden() {
      const { data, error } = await client
        .from('hidden_items')
        .select('kind, target_id, created_at')
        .order('created_at', { ascending: false });
      if (error) fail(error);
      const rows = (data ?? []) as { kind: HiddenItem['kind']; target_id: string; created_at: string }[];
      const ids = (k: HiddenItem['kind']) => rows.filter((r) => r.kind === k).map((r) => r.target_id);
      // Names to show; a deal no longer on offer may not be readable, so it keeps a plain label.
      const [biz, cats, deals] = await Promise.all([
        ids('business').length ? client.from('businesses').select('id, name').in('id', ids('business')) : null,
        ids('category').length ? client.from('categories').select('id, name').in('id', ids('category')) : null,
        ids('deal').length ? client.from('deals').select('id, title').in('id', ids('deal')) : null,
      ]);
      const name = new Map<string, string>();
      for (const r of (biz?.data ?? []) as { id: string; name: string }[]) name.set(r.id, r.name);
      for (const r of (cats?.data ?? []) as { id: string; name: string }[]) name.set(r.id, r.name);
      for (const r of (deals?.data ?? []) as { id: string; title: string }[]) name.set(r.id, r.title);
      return rows.map((r) => ({
        ...r,
        label: name.get(r.target_id) ?? (r.kind === 'deal' ? 'A deal' : r.kind === 'business' ? 'A place' : 'A kind of deal'),
      }));
    },

    async unhide(kind, targetId) {
      const { error } = await client.from('hidden_items').delete().eq('kind', kind).eq('target_id', targetId);
      if (error) fail(error);
    },

    subscribeNotifications(onNew) {
      // Realtime on the notifications table (0019 adds it to the publication); RLS keeps it to your own.
      let channel: ReturnType<typeof client.channel> | null = null;
      let stopped = false;
      void userId(client).then((uid) => {
        if (!uid || stopped) return;
        // A topic of its own each time: channel() hands back an existing one with the
        // same topic, and one still leaving after the last subscriber would never deliver.
        channel = client
          .channel('notifications:' + uid + ':' + ++channelSeq)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'profile_id=eq.' + uid },
            (payload) => onNew(payload.new as Notification),
          )
          .subscribe((status, err) => {
            // Live alerts are extra (the list still loads), so a dead channel is logged, not shown.
            if (status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR || status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT) {
              console.warn('Live notifications: ' + status, err?.message ?? '');
            }
          });
      });
      return () => {
        stopped = true;
        if (channel) void client.removeChannel(channel);
      };
    },

    async recordEvents(events) {
      if (events.length === 0) return;
      // Analytics must never break a screen; a lost view count is fine.
      await client.rpc('record_deal_events', { p_events: events });
    },

    async getRawDeal(id) {
      // The detail card carries everything the wizard rehydrates from:
      // availability, eligibility, actions and the rejection reason.
      return this.getDeal(id);
    },
  };
}
