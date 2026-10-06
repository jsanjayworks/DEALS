/**
 * Where the person is, from the device: the browser's location prompt on the
 * website, the system one in the apps. Asked for only when they choose "Use
 * my location"; picking an area by hand never needs it.
 *
 * Deals are in Bengaluru for now, so a position far from every area we cover
 * is not used: the feed would be empty. The caller says so and offers the
 * area list instead.
 */

import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { LOCALITIES } from '../data/seed-reference';
import { haversineKm } from '../data/mapping';
import type { LatLng, Locality } from '../data/types';

/** Further than this from every area we cover means "not in Bengaluru". */
const COVERED_KM = 40;
/** A browser that never answers the prompt should not leave a spinner forever. */
const TIMEOUT_MS = 15_000;

export type LocateResult = { ok: true; point: LatLng; near: Locality } | { ok: false; message: string };

/** The area whose centre is closest, and how far that is. */
export function nearestLocality(p: LatLng): { locality: Locality; km: number } {
  let best = LOCALITIES[0];
  let km = haversineKm(p, best.centroid);
  for (const l of LOCALITIES) {
    const d = haversineKm(p, l.centroid);
    if (d < km) {
      best = l;
      km = d;
    }
  }
  return { locality: best, km };
}

export async function locateMe(): Promise<LocateResult> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      return {
        ok: false,
        message:
          Platform.OS === 'web'
            ? 'Location is blocked for this site. Allow it from the icon in the address bar, or choose an area.'
            : 'Location is off for YOLO Deals. Allow it in Settings, or choose an area.',
      };
    }
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
    if (!pos) return { ok: false, message: 'Could not find your location just now. Choose an area instead.' };
    const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const { locality, km } = nearestLocality(point);
    if (km > COVERED_KM) {
      return {
        ok: false,
        message: 'You seem to be outside Bengaluru, where the deals are for now. Choose an area to look around.',
      };
    }
    return { ok: true, point, near: locality };
  } catch {
    return { ok: false, message: 'Could not find your location just now. Choose an area instead.' };
  }
}
