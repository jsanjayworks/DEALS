/**
 * Thin wrappers over the platform: haptics, phone, maps, chat, share.
 *
 * Each one swallows failure. A missing vibration motor or a browser without
 * navigator.share is not worth an error screen; the action simply does less.
 *
 * On the website, maps and chat open in a new tab: sending the app's own tab
 * away to Google Maps would lose the page the person was on.
 */

import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';
import type { DealCardModel, LatLng } from '../data/types';

export function hapticSuccess(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function hapticTap(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Indian numbers, digits only, so tel: and wa.me both accept them. */
function digits(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

/** "+919832080855" reads as "+91 98320 80855". */
export function formatPhone(phone: string): string {
  const d = digits(phone);
  const m = d.match(/^\+?91(\d{5})(\d{5})$/);
  return m ? '+91 ' + m[1] + ' ' + m[2] : phone;
}

/** A web page in a new tab on the website; the app or browser elsewhere. */
function openExternal(url: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  Linking.openURL(url).catch(() => {});
}

export function callPhone(phone: string): void {
  Linking.openURL('tel:' + digits(phone)).catch(() => {});
}

export function openWhatsApp(phone: string, text?: string): void {
  const n = digits(phone).replace(/^\+/, '');
  const q = text ? '?text=' + encodeURIComponent(text) : '';
  openExternal('https://wa.me/' + n + q);
}

/** Google Maps directions: opens the app where installed, a new tab on the web. */
export function openDirections(to: LatLng): void {
  openExternal('https://www.google.com/maps/dir/?api=1&destination=' + to.lat + ',' + to.lng);
}

export function dealLink(id: string): string {
  return Linking.createURL('/deal/' + id);
}

/**
 * Shares a deal. Browsers without the share sheet (desktop Firefox, most
 * desktop Chrome) get the link copied instead; the result says which, so
 * the screen can say "Link copied".
 */
export async function shareDeal(deal: DealCardModel): Promise<'shared' | 'copied' | 'none'> {
  const text = deal.title + ' at ' + deal.business.name + ' on YOLO Deals';
  const url = dealLink(deal.id);
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    const nav = navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> };
    if (typeof nav.share === 'function') {
      try {
        await nav.share({ title: text, url });
        return 'shared';
      } catch {
        return 'none';
      }
    }
    try {
      await navigator.clipboard.writeText(text + '\n' + url);
      return 'copied';
    } catch {
      return 'none';
    }
  }
  try {
    await Share.share({ message: text + '\n' + url });
    return 'shared';
  } catch {
    // Dismissed, or no share target on this platform.
    return 'none';
  }
}
