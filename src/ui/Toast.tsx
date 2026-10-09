/**
 * A short confirmation that floats up from the bottom and leaves on its own:
 * "Profile saved", "Code redeemed". toast() can be called from anywhere; the
 * one ToastHost in the root layout shows them, newest replacing the last.
 *
 * Screen readers hear it through a polite live region; it never takes focus
 * and never blocks a tap.
 */

import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOutDown, SlideInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, radius, shadow, space, type } from '../theme/tokens';
import { Icon, type IconName } from '../components';

interface ToastMessage {
  id: number;
  text: string;
  icon: IconName;
}

type Listener = (t: ToastMessage) => void;
const listeners = new Set<Listener>();
let nextId = 1;

/** Show a short confirmation. */
export function toast(text: string, icon: IconName = 'check'): void {
  const message = { id: nextId++, text, icon };
  listeners.forEach((l) => l(message));
}

const SHOWN_MS = 2600;

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [current, setCurrent] = useState<ToastMessage | null>(null);

  useEffect(() => {
    const listen: Listener = (t) => setCurrent(t);
    listeners.add(listen);
    return () => {
      listeners.delete(listen);
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => setCurrent((c) => (c?.id === current.id ? null : c)), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [current]);

  return (
    <View pointerEvents="none" style={[styles.layer, { bottom: Math.max(insets.bottom, space.lg) + 72 }]}>
      {current ? (
        <Animated.View
          key={current.id}
          entering={reduced ? undefined : SlideInDown.springify().damping(18).stiffness(220)}
          exiting={reduced ? undefined : FadeOutDown.duration(220)}
          style={styles.toast}
          accessibilityLiveRegion="polite"
          aria-live="polite"
          role="status"
        >
          <View style={styles.icon}>
            <Icon name={current.icon} size={16} color={color.onBrand} strokeWidth={2.4} />
          </View>
          <Text style={styles.text} numberOfLines={2}>
            {current.text}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: Platform.OS === 'web' ? ('fixed' as 'absolute') : 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: space.lg,
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    maxWidth: 440,
    paddingVertical: space.md,
    paddingLeft: space.md,
    paddingRight: space.lg,
    borderRadius: radius.pill,
    backgroundColor: color.text,
    ...shadow.raised,
  },
  icon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.brand,
  },
  text: {
    ...type.bodySemibold,
    color: color.surface,
    flexShrink: 1,
  },
});
