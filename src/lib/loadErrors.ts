/**
 * Which screens failed to load, app-wide, so one banner can say so and one
 * Retry can reload them all. useQuery reports here; the banner reads here.
 *
 * Without this a failed load looked like an empty result ("No deals near
 * you"), which tells the person something false. Coming back online retries
 * on its own.
 */

import { Platform } from 'react-native';

const failing = new Set<number>();
const listeners = new Set<() => void>();
const retriers = new Set<() => void>();
let offline = false;
let version = 0;

const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

export function reportLoadError(id: number): void {
  if (!failing.has(id)) {
    failing.add(id);
    emit();
  }
}

export function clearLoadError(id: number): void {
  if (failing.delete(id)) emit();
}

/** Each live query registers how to run itself again. */
export function onRetry(fn: () => void): () => void {
  retriers.add(fn);
  return () => retriers.delete(fn);
}

export function retryAll(): void {
  retriers.forEach((r) => r());
}

export function subscribeLoadErrors(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function loadErrorSnapshot(): number {
  return version;
}

export function loadErrorState(): { failing: number; offline: boolean } {
  return { failing: failing.size, offline };
}

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  window.addEventListener('offline', () => {
    offline = true;
    emit();
  });
  window.addEventListener('online', () => {
    offline = false;
    emit();
    retryAll();
  });
}
