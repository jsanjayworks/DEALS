/**
 * App-wide session state: who is signed in, where they are browsing, and how
 * far out. Persisted, so a relaunch comes back to the same locality and radius.
 *
 * Deals, claims and saved items are deliberately NOT held here. The data layer
 * owns them, and screens re-read on focus, so there is exactly one copy of each
 * fact and nothing to keep in sync.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useSyncExternalStore } from 'react';
import {
  backend,
  currentViewer,
  demoAccounts,
  onViewerChange,
  signInAs,
  viewerReady,
  type AppViewer,
} from '../data';
import { DEFAULT_LOCALITY_ID, LOCALITIES } from '../data/seed-reference';
import type { LatLng, Locality } from '../data/types';

export type AccountKind = keyof typeof demoAccounts;

/** Display details for the demo accounts. Real profiles replace this with Auth. */
export const ACCOUNT_PROFILE: Record<AccountKind, { name: string; phone: string }> = {
  customer: { name: 'Aarav', phone: '+91 98450 12345' },
  merchant: { name: 'Meera', phone: '+91 98860 54321' },
  admin: { name: 'YOLO Ops', phone: '+91 80 4000 0000' },
};

export const RADIUS_OPTIONS = [
  { label: '500m', m: 500 },
  { label: '1km', m: 1000 },
  { label: '3km', m: 3000 },
  { label: '5km', m: 5000 },
  { label: '10km', m: 10000 },
] as const;

const MAX_RECENT = 8;

/**
 * Which side of the app this person was last using. One sign-in serves both:
 * a merchant is someone who belongs to a business, and they can still browse
 * as a customer. Remembered so a merchant reopens into their dashboard.
 */
export type AppMode = 'customer' | 'merchant';

interface SessionState {
  account: AccountKind;
  mode: AppMode;
  setMode(mode: AppMode): void;
  localityId: string;
  radiusM: number;
  recentSearches: string[];
  setAccount(kind: AccountKind): void;
  setLocality(id: string): void;
  setRadius(m: number): void;
  addRecentSearch(q: string): void;
  clearRecentSearches(): void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      account: 'customer',
      mode: 'customer',
      setMode: (mode) => set({ mode }),
      localityId: DEFAULT_LOCALITY_ID,
      radiusM: 3000,
      recentSearches: [],
      setAccount: (kind) => {
        signInAs(demoAccounts[kind]);
        set({ account: kind });
      },
      setLocality: (id) => set({ localityId: id }),
      setRadius: (m) => set({ radiusM: m }),
      addRecentSearch: (q) =>
        set((s) => {
          const trimmed = q.trim();
          if (!trimmed) return s;
          const rest = s.recentSearches.filter(
            (r) => r.toLowerCase() !== trimmed.toLowerCase(),
          );
          return { recentSearches: [trimmed, ...rest].slice(0, MAX_RECENT) };
        }),
      clearRecentSearches: () => set({ recentSearches: [] }),
    }),
    {
      name: 'yolo-session',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        account: s.account,
        mode: s.mode,
        localityId: s.localityId,
        radiusM: s.radiusM,
        recentSearches: s.recentSearches,
      }),
      // The data layer keeps its own viewer; put it back in step after a relaunch.
      onRehydrateStorage: () => (state) => {
        if (state) signInAs(demoAccounts[state.account]);
      },
    },
  ),
);

export function useLocality(): Locality {
  const id = useSession((s) => s.localityId);
  return LOCALITIES.find((l) => l.id === id) ?? LOCALITIES[0];
}

/** Search and feed centre. The locality centroid until device location lands. */
export function useOrigin(): LatLng {
  return useLocality().centroid;
}

export function radiusLabel(m: number): string {
  return RADIUS_OPTIONS.find((r) => r.m === m)?.label ?? (m < 1000 ? m + 'm' : m / 1000 + 'km');
}

/**
 * The signed-in person, re-rendering when they change: a demo account switch
 * locally, sign-in or sign-out on Supabase. Null when signed out.
 */
export function useViewer(): AppViewer | null {
  return useSyncExternalStore(onViewerChange, currentViewer, currentViewer);
}

/**
 * False for the moment after launch while Supabase restores the session. A
 * screen that redirects on "no viewer" must wait for this first.
 */
export function useViewerReady(): boolean {
  return useSyncExternalStore(onViewerChange, viewerReady, viewerReady);
}

/** First name for the greeting and avatar: the profile on Supabase, the demo name locally. */
export function useDisplayName(): string {
  const viewer = useViewer();
  const account = useSession((s) => s.account);
  if (backend === 'local') return ACCOUNT_PROFILE[account].name;
  const name = viewer?.full_name?.trim();
  return name ? name.split(/\s+/)[0] : 'there';
}
