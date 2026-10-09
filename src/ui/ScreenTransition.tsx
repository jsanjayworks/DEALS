/**
 * Screens move on the web the way they do in the phone apps: a screen slides
 * in from the right when it opens, the one underneath eases back in from the
 * left on Back, and modal screens such as sign-in rise from the bottom.
 *
 * The web stack shows one screen at a time and hides the rest (it has no
 * transitions of its own), so each screen animates itself whenever it is
 * shown. Phones keep their native transitions, and people who ask their
 * device for less motion get none.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/** Set once the app's first screen is up, so the first paint never waits on an animation. */
let appStarted = false;

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

interface ScreenNavigation {
  isFocused: () => boolean;
  addListener: (event: 'focus' | 'blur', callback: () => void) => () => void;
}

/** For a navigator's screenLayout: wraps every screen on the web, leaves phones alone. */
export function screenTransition({
  children,
  navigation,
  options,
}: {
  children: ReactElement;
  navigation: unknown;
  options: { presentation?: string };
}): ReactElement {
  if (Platform.OS !== 'web') return children;
  const modal = !!options.presentation && /modal|sheet/i.test(options.presentation);
  return (
    <ScreenMotion navigation={navigation as ScreenNavigation} modal={modal}>
      {children}
    </ScreenMotion>
  );
}

function ScreenMotion({
  navigation,
  modal,
  children,
}: {
  navigation: ScreenNavigation;
  modal: boolean;
  children: ReactElement;
}) {
  const reduced = useReducedMotion();
  // Opened after the app was already up: it arrives with a movement.
  const [arrives] = useState(() => appStarted && !reduced);
  const [focused, setFocused] = useState(() => navigation.isFocused());
  const shown = useRef(0);
  // 1 is at rest; +1 arrives from the right (opened), -1 from the left (come back to).
  const progress = useSharedValue(arrives ? 0 : 1);
  const from = useSharedValue(1);

  useEffect(() => {
    appStarted = true;
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);

  useEffect(() => {
    if (!focused) return;
    const time = shown.current++;
    // The app's first screen, or less motion asked for: just be there.
    if ((time === 0 && !arrives) || reduced) {
      progress.set(1);
      return;
    }
    const back = time > 0;
    from.set(back ? -1 : 1);
    progress.set(back ? 0.35 : 0);
    progress.set(withTiming(1, { duration: modal ? 340 : back ? 260 : 300, easing: EASE }));
  }, [focused, arrives, reduced, modal, from, progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.get();
    if (modal) {
      return {
        opacity: interpolate(p, [0, 1], [0, 1]),
        transform: [{ translateY: interpolate(p, [0, 1], [48, 0]) }, { scale: interpolate(p, [0, 1], [0.985, 1]) }],
      };
    }
    return {
      opacity: interpolate(p, [0, 0.6, 1], [0, 0.9, 1]),
      transform: [{ translateX: interpolate(p, [0, 1], [from.get() * 36, 0]) }],
    };
  });

  return <Animated.View style={[styles.fill, style]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
