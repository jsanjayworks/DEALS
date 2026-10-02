/**
 * The data entry point. Screens import from here and never from an adapter,
 * so swapping the backing store is a change to this file alone.
 *
 * Today it always returns the local adapter: it serves the same 56 Bengaluru
 * deals the database is seeded with, enforces the same lifecycle and
 * eligibility rules, and needs no accounts or network. That is what lets the
 * app run and demo before Supabase credentials exist.
 *
 * When supabase.ts lands, the selection below becomes:
 *   export const db = hasSupabaseConfig() ? createSupabaseDataSource() : local;
 * and nothing in the UI changes.
 */

import Constants from 'expo-constants';
import {
  DEMO_ADMIN,
  DEMO_CUSTOMER,
  DEMO_MERCHANT,
  createLocalDataSource,
  type LocalDataSource,
  type LocalViewer,
} from './local';
import type { DataSource } from './api';

function readExtra(key: string): string | undefined {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const value = extra?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** True once a Supabase project is configured in app.json `extra`. */
export function hasSupabaseConfig(): boolean {
  return Boolean(readExtra('supabaseUrl') && readExtra('supabaseAnonKey'));
}

const local: LocalDataSource = createLocalDataSource();

export const db: DataSource = local;

/**
 * Account switching for the demo. Merchant mode is gated on belonging to a
 * business, exactly as business_members gates it in the database, so switching
 * here is the same decision the real app makes from the session.
 */
export const demoAccounts = {
  customer: DEMO_CUSTOMER,
  merchant: DEMO_MERCHANT,
  admin: DEMO_ADMIN,
} as const;

export function signInAs(viewer: LocalViewer): void {
  local.setViewer(viewer);
}

export function currentViewer(): LocalViewer {
  return local.getViewer();
}

export { RuleViolation } from './api';
export type {
  ActionWithDeal,
  DataSource,
  DealDraftInput,
  FeedQuery,
  MerchantStats,
  SearchQuery,
  SearchResult,
  TakeActionInput,
} from './api';
