/**
 * The opening screen on the website: the name in gold on navy, then the app
 * shows through as the navy lifts away, the way Swiggy and Zomato open.
 *
 *   0–500      the name fades in and settles from 92% to full size
 *   500–1300   it holds
 *   1300–1700  the navy fades away and the name grows a touch as it goes
 *
 * It plays once per page load, never on in-app navigation (the root layout
 * stays mounted). Phones have the native splash instead. With "reduce
 * motion" on, nothing moves; it only fades.
 *
 * Drawn before the fonts are ready too, without the name, so the very first
 * paint is already navy rather than a blank page.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { font, theme } from '../theme/tokens';

const ENTER_MS = 500;
const HOLD_MS = 800;
const EXIT_MS = 400;
/** Material's "emphasized" curve: quick to leave, gentle to land. */
const EASE = Easing.bezier(0.2, 0, 0, 1);

const NAVY = theme.selected;

// Whether the opening has finished, for anything that should wait for it
// (Home's first-open location question). Phones have no opening to wait for.
let launchDone = Platform.OS !== 'web';
const launchListeners = new Set<() => void>();

export function markLaunchDone(): void {
  if (launchDone) return;
  launchDone = true;
  launchListeners.forEach((cb) => cb());
}

export function useLaunchDone(): boolean {
  return useSyncExternalStore(
    (cb) => {
      launchListeners.add(cb);
      return () => launchListeners.delete(cb);
    },
    () => launchDone,
    () => false,
  );
}
const GOLD = theme.onSelected ?? '#E2BE5A';

export function LaunchSplash({ ready, onDone }: { ready: boolean; onDone?: () => void }) {
  const reduce = useReducedMotion();
  const enter = useSharedValue(0);
  const exit = useSharedValue(0);

  useEffect(() => {
    if (!ready) return;
    const inMs = reduce ? 0 : ENTER_MS;
    enter.value = withTiming(1, { duration: inMs, easing: EASE });
    exit.value = withDelay(inMs + HOLD_MS, withTiming(1, { duration: EXIT_MS, easing: Easing.in(Easing.quad) }));
    const t = setTimeout(() => onDone?.(), inMs + HOLD_MS + EXIT_MS);
    return () => clearTimeout(t);
  }, [ready, reduce, enter, exit, onDone]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
  const nameStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: reduce ? 1 : 0.92 + 0.08 * enter.value + 0.06 * exit.value }],
  }));

  return (
    <Animated.View style={[styles.screen, backdropStyle]} aria-hidden>
      {ready ? (
        <Animated.View style={[styles.center, nameStyle]}>
          <Text style={styles.name}>YOLO Deals</Text>
          <View style={styles.rule} />
          <Text style={styles.tagline}>Offers near you in Bengaluru</Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/** Fixed on the web, so it covers the window whatever the page has scrolled to. */
const cover: ViewStyle =
  Platform.OS === 'web' ? ({ position: 'fixed' } as unknown as ViewStyle) : { position: 'absolute' };

const styles = StyleSheet.create({
  screen: {
    ...cover,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  name: {
    fontFamily: font.display,
    fontSize: 52,
    lineHeight: 60,
    letterSpacing: -1.2,
    color: GOLD,
    textAlign: 'center',
  },
  rule: {
    width: 44,
    height: 3,
    borderRadius: 2,
    backgroundColor: GOLD,
    opacity: 0.6,
    marginTop: 14,
    marginBottom: 12,
  },
  tagline: {
    fontFamily: font.medium,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0.2,
    color: GOLD,
    opacity: 0.8,
    textAlign: 'center',
  },
});
