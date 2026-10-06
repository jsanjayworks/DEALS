/**
 * The data entry point. Screens import from here and never from an adapter,
 * so swapping the backing store is a change to this file alone.
 *
 * With EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY set
 * (in .env.local, or the build environment), the app talks to Supabase and
 * people sign in with a one-time code. Without them it runs on the local
 * adapter: the same Bengaluru deals the database is seeded with, the same
 * rules, three demo accounts and no network. That keeps the app demoable
 * anywhere. The demo starts signed out; any email signs in straight away (a
 * new one makes a new account), and what happens is kept in the browser.
 *
 * The viewer (who is signed in) is cached here and pushed to listeners, so
 * screens can read it synchronously and still re-render when it changes.
 */

import Constants from 'expo-constants';
import {
  DEMO_ADMIN,
  DEMO_CUSTOMER,
  DEMO_MERCHANT,
  clearSavedDemo,
  createLocalDataSource,
  loadStore,
  type LocalDataSource,
} from './local';
import { createSupabase, createSupabaseAuth, createSupabaseDataSource, loadViewer } from './supabase';
import { RuleViolation, type AppViewer, type AuthApi, type DataSource, type OtpTarget } from './api';

function readExtra(key: string): string | undefined {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const value = extra?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// Expo inlines EXPO_PUBLIC_* only when written out literally like this.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || readExtra('supabaseUrl');
const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  readExtra('supabaseAnonKey');

/** True when a Supabase project is configured. */
export function hasSupabaseConfig(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

const client = hasSupabaseConfig() ? createSupabase(SUPABASE_URL!, SUPABASE_KEY!) : null;
// The demo keeps its data in the browser; alongside Supabase it is never used.
const local: LocalDataSource = client
  ? createLocalDataSource()
  : createLocalDataSource(loadStore(), { persist: true });

export const backend: 'local' | 'supabase' = client ? 'supabase' : 'local';
export const db: DataSource = client ? createSupabaseDataSource(client) : local;
// ---------------------------------------------------------------- viewer ----

let viewer: AppViewer | null = null;
/**
 * False until the first session check finishes. The stored session is
 * restored asynchronously (Supabase's, or the demo's remembered account), so
 * for a moment after launch "nobody" means "not known yet", not "signed out".
 * Gates must wait rather than redirect.
 */
let ready = false;
const listeners = new Set<(v: AppViewer | null) => void>();

function publish(v: AppViewer | null) {
  viewer = v;
  ready = true;
  listeners.forEach((cb) => cb(v));
}

/** The signed-in person, or null when signed out. */
export function currentViewer(): AppViewer | null {
  return viewer;
}

/** Whether currentViewer() is an answer yet; see `ready`. */
export function viewerReady(): boolean {
  return ready;
}

export function onViewerChange(cb: (v: AppViewer | null) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Re-read the viewer, e.g. after editing the profile. */
export async function refreshViewer(): Promise<AppViewer | null> {
  // The demo keeps a signed-out visitor signed out; a signed-in one re-reads
  // their (possibly edited) profile.
  publish(client ? await loadViewer(client).catch(() => null) : viewer ? local.getViewer() : null);
  return viewer;
}

if (client) {
  // Supabase warns against awaiting its own calls inside this callback, so the
  // reload is deferred to the next tick.
  client.auth.onAuthStateChange(() => {
    setTimeout(() => void refreshViewer(), 0);
  });
  void refreshViewer();
}

/**
 * Account switching for the local demo. Merchant mode is gated on belonging to
 * a business, exactly as business_members gates it in the database, so
 * switching here is the same decision the real app makes from the session.
 */
export const demoAccounts = {
  customer: DEMO_CUSTOMER,
  merchant: DEMO_MERCHANT,
  admin: DEMO_ADMIN,
} as const;

export function signInAs(v: AppViewer): void {
  if (client) return;
  // The kept copy, with any profile edits, over the seed constant.
  const user = local.userById(v.id) ?? v;
  local.setViewer(user);
  publish(user);
}

/** A demo account by id, for putting the remembered one back after a reload. */
export function demoUserById(id: string): AppViewer | null {
  return client ? null : local.userById(id);
}

/** Start the demo afresh: seed data, signed out. */
export function resetDemoData(): void {
  if (client) return;
  clearSavedDemo();
  if (typeof window !== 'undefined') window.location.reload();
}

/** Back to a visitor on the local demo. */
export function signOutDemo(): void {
  if (client) return;
  publish(null);
}

export type DemoAccountKind = keyof typeof demoAccounts;

/** The ready-made demo accounts, listed on the sign-in screens. No email is sent. */
export const DEMO_LOGINS: { kind: DemoAccountKind; label: string; who: string; email: string }[] = [
  { kind: 'customer', label: 'Customer', who: 'Aarav Sharma', email: 'customer@demo.yolodeals.in' },
  { kind: 'merchant', label: 'Merchant', who: 'Meera Rao, Rangoli Kitchen', email: 'merchant@demo.yolodeals.in' },
  { kind: 'admin', label: 'Admin', who: 'YOLO Ops', email: 'admin@demo.yolodeals.in' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A ready-made account for its address, or the account for any other email, made on first use. */
function demoAccountFor(target: OtpTarget): AppViewer {
  const email = 'email' in target ? target.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) throw new RuleViolation('Enter a valid email address');
  const known = DEMO_LOGINS.find((l) => l.email === email);
  return known ? demoAccounts[known.kind] : local.userForEmail(email);
}

/** The demo signs in without a code: any email goes straight in. */
const demoAuth: AuthApi = {
  async sendCode(target) {
    demoAccountFor(target);
  },
  async verifyCode(target) {
    signInAs(demoAccountFor(target));
  },
  async signInWithoutCode(target) {
    signInAs(demoAccountFor(target));
  },
  async signOut() {
    signOutDemo();
  },
};

/** Sign-in by code: Supabase's, or the demo's on the local backend. */
export const auth: AuthApi = client ? createSupabaseAuth(client) : demoAuth;

export { RuleViolation } from './api';
export type {
  ActionWithDeal,
  AppViewer,
  BusinessOrder,
  BusinessVerification,
  AuthApi,
  DataSource,
  DealDraftInput,
  FeedQuery,
  MerchantStats,
  NewBusinessInput,
  OtpTarget,
  PickedImage,
  ProfileUpdate,
  ReportGroup,
  SearchQuery,
  SearchResult,
  SupportMessage,
  SupportQueueItem,
  SupportTicket,
  SupportTopic,
  TakeActionInput,
  VerificationInput,
  VerificationRequest,
} from './api';
