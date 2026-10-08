/**
 * What people do in the app, sent in small batches to track() (migration
 * 0018). The server decides what to keep: without the person's consent to
 * personalised suggestions nothing is tied to them, a repeat look within
 * half an hour counts once, and unknown names are dropped.
 *
 * Fire and forget: tracking never blocks a screen or shows an error.
 */

import { AppState, Platform } from 'react-native';
import { db } from '../data';

export type TrackName =
  | 'app_open'
  | 'deal_open'
  | 'shop_open'
  | 'search'
  | 'voice_query'
  | 'cta_tap'
  | 'share'
  | 'save'
  | 'unsave'
  | 'not_interested'
  | 'collection_open'
  | 'category_open'
  | 'notif_open'
  | 'checkout_start'
  | 'reorder_tap';

export interface TrackEvent {
  name: TrackName;
  /** Where it happened: 'home.for_you', 'search', 'voice', 'shop', 'deeplink'… */
  surface?: string;
  /** Its place in the list, from 0. */
  position?: number;
  deal_id?: string;
  business_id?: string;
  /** Search words or what was said; kept short by the server. */
  query?: string;
  props?: Record<string, unknown>;
}

/** A random id per app session: never tied to the account, only dedupes and caps. */
function randomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return hex(8) + '-' + hex(4) + '-4' + hex(3) + '-' + ((8 + Math.floor(Math.random() * 4)).toString(16) + hex(3)) + '-' + hex(12);
}

const SESSION = randomId();
const queue: (TrackEvent & { session_id: string })[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;
  const batch = queue.splice(0, 50);
  try {
    await db.track(batch);
  } catch {
    // Lost events are fine; a screen must never fail because of them.
  }
  if (queue.length) void flush();
}

/** Records one thing someone did. Batched: sent within 5 seconds, or when the app goes to the background. */
export function track(event: TrackEvent): void {
  queue.push({ ...event, session_id: SESSION });
  if (queue.length >= 20) {
    void flush();
  } else if (!timer) {
    timer = setTimeout(() => void flush(), 5000);
  }
}

// Send what is waiting before the page or app goes away.
if (Platform.OS === 'web') {
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush();
    });
  }
} else {
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') void flush();
  });
}
