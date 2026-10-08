/**
 * New notifications as they happen: a card slides in at the top with a short
 * chime, the way a partner app rings for a new order. Tapping it opens what
 * it is about. When the tab is in the background and the person allowed it,
 * the browser shows its own notification too. Screens that list orders
 * refresh themselves (onLiveNotification).
 */

import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../data';
import type { Notification } from '../data/types';
import { hapticSuccess } from '../lib/device';
import { emitLiveNotification, MERCHANT_KINDS, openNotification } from '../lib/notificationRoute';
import { useViewer } from '../state/session';
import { color, radius, shadow, space, type } from '../theme/tokens';
import { Icon } from '../components';

/** Two soft notes, made on the spot: no sound file to load. */
function chime(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
    .AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  try {
    const ctx = new Ctx();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.32);
    });
    setTimeout(() => void ctx.close(), 900);
  } catch {
    // A browser that blocks sound until the page is touched: the card still shows.
  }
}

function browserNotify(n: Notification): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || !document.hidden) return;
  const N = (globalThis as { Notification?: { permission: string; new (title: string, o?: { body?: string }): unknown } })
    .Notification;
  if (N && N.permission === 'granted') {
    try {
      new N(n.title, { body: n.body });
    } catch {
      // Some browsers only allow notifications from a service worker.
    }
  }
}

export function LiveAlerts() {
  const viewer = useViewer();
  const account = viewer?.id ?? null;
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<Notification | null>(null);

  useEffect(() => {
    if (!account) return;
    return db.subscribeNotifications((n) => {
      setShown(n);
      if (MERCHANT_KINDS.has(n.kind)) chime();
      hapticSuccess();
      browserNotify(n);
      emitLiveNotification(n);
    });
  }, [account]);

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 7000);
    return () => clearTimeout(t);
  }, [shown]);

  if (!shown) return null;
  const n = shown;
  return (
    <View style={[styles.wrap, { top: insets.top + space.md }]} pointerEvents="box-none">
      <Pressable
        onPress={() => {
          setShown(null);
          void db.markNotificationRead(n.id).catch(() => {});
          openNotification(n);
        }}
        accessibilityRole="alert"
        accessibilityLabel={n.title + '. ' + (n.body ?? '')}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      >
        <View style={styles.icon}>
          <Icon name={MERCHANT_KINDS.has(n.kind) ? 'bell' : 'ticket'} size={18} color={color.white} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {n.title}
          </Text>
          {n.body ? (
            <Text style={styles.body} numberOfLines={2}>
              {n.body}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={() => setShown(null)} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10}>
          <Icon name="x" size={16} color={color.textSecondary} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: space.lg,
    zIndex: 2000,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    width: '100%',
    maxWidth: 520,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    ...shadow.card,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.brand,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...type.bodySemibold,
    color: color.text,
  },
  body: {
    ...type.caption,
    color: color.textSecondary,
  },
});
