/**
 * Thin wrappers over the platform: haptics, phone, maps, chat, share.
 *
 * Each one swallows failure. A missing vibration motor or a browser without
 * navigator.share is not worth an error screen; the action simply does less.
 */

import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { Share } from 'react-native';
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

export function callPhone(phone: string): void {
  Linking.openURL('tel:' + digits(phone)).catch(() => {});
}

export function openWhatsApp(phone: string, text?: string): void {
  const n = digits(phone).replace(/^\+/, '');
  const q = text ? '?text=' + encodeURIComponent(text) : '';
  Linking.openURL('https://wa.me/' + n + q).catch(() => {});
}

/** Google Maps directions: opens the app where installed, the browser elsewhere. */
export function openDirections(to: LatLng): void {
  Linking.openURL(
    'https://www.google.com/maps/dir/?api=1&destination=' + to.lat + ',' + to.lng,
  ).catch(() => {});
}

export function dealLink(id: string): string {
  return Linking.createURL('/deal/' + id);
}

export async function shareDeal(deal: DealCardModel): Promise<void> {
  try {
    await Share.share({
      message: deal.title + ' at ' + deal.business.name + ' on YOLO Deals\n' + dealLink(deal.id),
    });
  } catch {
    // Dismissed, or no share target on this platform.
  }
}
