/**
 * Scroll-aware chrome: the Home header and the floating tab bar slide away
 * while someone scrolls down to read, and come back the moment they scroll up.
 *
 * One shared value drives both, 0 shown and 1 hidden, so they always move
 * together. It lives on the UI thread (Reanimated), so hiding never waits on a
 * React render mid-scroll.
 */

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  useAnimatedScrollHandler,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

const ChromeContext = createContext<SharedValue<number> | null>(null);

export function ChromeProvider({ children }: { children: ReactNode }) {
  const hidden = useSharedValue(0);
  return <ChromeContext.Provider value={hidden}>{children}</ChromeContext.Provider>;
}

export function useChromeHidden(): SharedValue<number> {
  const v = useContext(ChromeContext);
  if (!v) throw new Error('useChromeHidden must be used inside ChromeProvider');
  return v;
}

/** Ignore movement smaller than this, so a resting thumb does not flicker the bar. */
const THRESHOLD = 8;
/** Always show the chrome this close to the top. */
const TOP_ZONE = 48;
const DURATION = 240;

/**
 * Attach to an Animated.ScrollView or Animated.FlatList. Also brings the chrome
 * back whenever the screen regains focus, so switching tabs never strands it.
 */
export function useHideOnScroll() {
  const hidden = useChromeHidden();
  const lastY = useSharedValue(0);
  const target = useSharedValue(0);
  const scrollY = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      target.set(0);
      hidden.set(withTiming(0, { duration: DURATION }));
    }, [hidden, target]),
  );

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      const dy = y - lastY.get();
      let next = target.get();
      if (y < TOP_ZONE) next = 0;
      else if (dy > THRESHOLD) next = 1;
      else if (dy < -THRESHOLD) next = 0;
      if (Math.abs(dy) > THRESHOLD || y < TOP_ZONE) lastY.set(y);
      if (next !== target.get()) {
        target.set(next);
        hidden.set(withTiming(next, { duration: DURATION }));
      }
      scrollY.set(y);
    },
  });

  return { onScroll, scrollY, hidden };
}
