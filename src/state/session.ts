/**
 * App-wide session state: who is signed in, where they are browsing, and how
 * far out. Persisted, so a relaunch comes back to the same locality and radius.
 *
 * Deals, claims and saved items are deliberately NOT held here. The data layer
 * owns them, and screens re-read on focus, so there is exactly one copy of each
 * fact and nothing to keep in sync.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useSyncExternalStore } from 'react';
import {
  backend,
  currentViewer,
  demoAccounts,
  demoUserById,
  onViewerChange,
  signInAs,
  signOutDemo,
  viewerReady,
  type AppViewer,
} from '../data';
import { DEFAULT_LOCALITY_ID, LOCALITIES } from '../data/seed-reference';
import { nearestLocality } from '../lib/location';
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

/** Storage that keeps nothing, for the build-time render of the website. */
const NO_STORAGE = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

/**
 * Which side of the app this person was last using. One sign-in serves both:
 * a merchant is someone who belongs to a business, and they can still browse
 * as a customer. Remembered so a merchant reopens into their dashboard.
 */
export type AppMode = 'customer' | 'merchant';

/** Where deals are measured from: the device's position, or an area picked by hand. */
export type LocationSource = 'gps' | 'area';

interface SessionState {
  /** The demo account last signed in (local backend). */
  account: AccountKind;
  /** Whether that demo account is signed in now; the demo starts signed out. */
  demoSignedIn: boolean;
  /** Which demo account exactly, including ones made by signing in with a new email. */
  demoUserId: string | null;
  mode: AppMode;
  setMode(mode: AppMode): void;
  localityId: string;
  /** The device's last position, when the person chose "Use my location". */
  geo: (LatLng & { at: number }) | null;
  locationSource: LocationSource;
  /** Whether Home has asked "use my location or choose an area" yet. */
  locationAsked: boolean;
  setGeo(point: LatLng): void;
  markLocationAsked(): void;
  radiusM: number;
  recentSearches: string[];
  /** The language the voice assistant last listened in. */
  voiceLang: 'en-IN' | 'hi-IN' | 'kn-IN';
  setVoiceLang(lang: 'en-IN' | 'hi-IN' | 'kn-IN'): void;
  /** The customer's own vehicle (see data/vehicles.ts), for "everything for it". */
  vehicleId: string | null;
  setVehicle(id: string | null): void;
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
      demoSignedIn: false,
      demoUserId: null,
      mode: 'customer',
      setMode: (mode) => set({ mode }),
      localityId: DEFAULT_LOCALITY_ID,
      geo: null,
      locationSource: 'area',
      locationAsked: false,
      // The nearest area comes along, so anything that names an area still reads right.
      setGeo: (point) =>
        set({
          geo: { ...point, at: Date.now() },
          locationSource: 'gps',
          locationAsked: true,
          localityId: nearestLocality(point).locality.id,
        }),
      markLocationAsked: () => set({ locationAsked: true }),
      radiusM: 3000,
      recentSearches: [],
      voiceLang: 'en-IN',
      setVoiceLang: (voiceLang) => set({ voiceLang }),
      vehicleId: null,
      setVehicle: (id) => set({ vehicleId: id }),
      setAccount: (kind) => {
        signInAs(demoAccounts[kind]);
        set({ account: kind, demoSignedIn: true, demoUserId: demoAccounts[kind].id });
      },
      setLocality: (id) => set({ localityId: id, locationSource: 'area', locationAsked: true }),
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
      // Pre-rendering the website in Node has no storage; the browser rehydrates.
      storage: createJSONStorage(() =>
        typeof window === 'undefined' && Platform.OS === 'web' ? NO_STORAGE : AsyncStorage,
      ),
      partialize: (s) => ({
        account: s.account,
        demoSignedIn: s.demoSignedIn,
        demoUserId: s.demoUserId,
        mode: s.mode,
        localityId: s.localityId,
        geo: s.geo,
        locationSource: s.locationSource,
        locationAsked: s.locationAsked,
        radiusM: s.radiusM,
        recentSearches: s.recentSearches,
        voiceLang: s.voiceLang,
        vehicleId: s.vehicleId,
      }),
      // The data layer keeps its own viewer; put it back in step after a
      // relaunch. This also marks the demo's session as known (viewerReady).
      onRehydrateStorage: () => (state) => {
        const user = state?.demoSignedIn
          ? ((state.demoUserId ? demoUserById(state.demoUserId) : null) ?? demoAccounts[state.account])
          : null;
        if (user) signInAs(user);
        else signOutDemo();
      },
    },
  ),
);

// The demo's sign-in form and Sign out go through the data layer, as the
// real ones do; keep the remembered account in step with whoever that is.
if (backend === 'local') {
  onViewerChange((v) => {
    const s = useSession.getState();
    if (!v) {
      if (s.demoSignedIn) useSession.setState({ demoSignedIn: false, mode: 'customer' });
      return;
    }
    const kind = (Object.keys(demoAccounts) as AccountKind[]).find((k) => demoAccounts[k].id === v.id);
    if (v.id !== s.demoUserId || !s.demoSignedIn) {
      useSession.setState({ account: kind ?? s.account, demoSignedIn: true, demoUserId: v.id });
    }
  });
}

export function useLocality(): Locality {
  const id = useSession((s) => s.localityId);
  return LOCALITIES.find((l) => l.id === id) ?? LOCALITIES[0];
}

/** Search and feed centre: the device's position when chosen, else the area's centre. */
export function useOrigin(): LatLng {
  const geo = useSession((s) => (s.locationSource === 'gps' ? s.geo : null));
  const locality = useLocality();
  return geo ?? locality.centroid;
}

/**
 * How to name where deals are measured from: "Your location, near
 * Koramangala" or the area itself, and the word for "within 3 km of …".
 */
export function usePlace(): { name: string; detail: string; of: string; gps: boolean } {
  const gps = useSession((s) => s.locationSource === 'gps' && s.geo !== null);
  const locality = useLocality();
  return gps
    ? { name: 'Your location', detail: 'Near ' + locality.name, of: 'you', gps }
    : { name: locality.name, detail: locality.city, of: locality.name, gps };
}

/** True once the saved session has been read back, so first-open prompts do not flash. */
export function useSessionHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useSession.persist.onFinishHydration(cb),
    () => useSession.persist.hasHydrated(),
    () => false,
  );
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
  const name = viewer?.full_name?.trim();
  return name ? name.split(/\s+/)[0] : 'there';
}
