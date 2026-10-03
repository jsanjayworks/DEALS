/**
 * The data entry point. Screens import from here and never from an adapter,
 * so swapping the backing store is a change to this file alone.
 *
 * With EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY set
 * (in .env.local, or the build environment), the app talks to Supabase and
 * people sign in with a one-time code. Without them it runs on the local
 * adapter: the same Bengaluru deals the database is seeded with, the same
 * rules, three demo accounts and no network. That keeps the app demoable
 * anywhere.
 *
 * The viewer (who is signed in) is cached here and pushed to listeners, so
 * screens can read it synchronously and still re-render when it changes.
 */

import Constants from 'expo-constants';
import {
  DEMO_ADMIN,
  DEMO_CUSTOMER,
  DEMO_MERCHANT,
  createLocalDataSource,
  type LocalDataSource,
} from './local';
import { createSupabase, createSupabaseAuth, createSupabaseDataSource, loadViewer } from './supabase';
import type { AppViewer, AuthApi, DataSource } from './api';

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

const local: LocalDataSource = createLocalDataSource();
const client = hasSupabaseConfig() ? createSupabase(SUPABASE_URL!, SUPABASE_KEY!) : null;

export const backend: 'local' | 'supabase' = client ? 'supabase' : 'local';
export const db: DataSource = client ? createSupabaseDataSource(client) : local;
/** Sign-in by code. Null on the local backend, which uses the demo switch. */
export const auth: AuthApi | null = client ? createSupabaseAuth(client) : null;

// ---------------------------------------------------------------- viewer ----

let viewer: AppViewer | null = client ? null : local.getViewer();
/**
 * False until the first session check finishes. On Supabase the stored session
 * is restored asynchronously, so for a moment after launch "nobody" means
 * "not known yet", not "signed out". Gates must wait rather than redirect.
 */
let ready = !client;
const listeners = new Set<(v: AppViewer | null) => void>();

function publish(v: AppViewer | null) {
  viewer = v;
  ready = true;
  listeners.forEach((cb) => cb(v));
}

/** The signed-in person, or null when signed out (Supabase only). */
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
  publish(client ? await loadViewer(client).catch(() => null) : local.getViewer());
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
  local.setViewer(v);
  publish(v);
}

export { RuleViolation } from './api';
export type {
  ActionWithDeal,
  AppViewer,
  BusinessVerification,
  AuthApi,
  DataSource,
  DealDraftInput,
  FeedQuery,
  MerchantStats,
  NewBusinessInput,
  OtpTarget,
  SearchQuery,
  SearchResult,
  TakeActionInput,
  VerificationInput,
  VerificationRequest,
} from './api';
