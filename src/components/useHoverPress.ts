/**
 * Hover and press as animated values, for cards that lift and images that zoom.
 *
 * Hover only fires where there is a pointer: web, and an iPad with a trackpad.
 * Touch devices get the press feedback alone, which is the right behaviour.
 */

import { useMemo } from 'react';
import {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const SPRING = { damping: 18, stiffness: 240, mass: 0.6 };

export function useHoverPress({ lift = 4, pressScale = 0.98 } = {}) {
  const hover = useSharedValue(0);
  const press = useSharedValue(0);

  const handlers = useMemo(
    () => ({
      onHoverIn: () => {
        hover.set(withTiming(1, { duration: 180 }));
      },
      onHoverOut: () => {
        hover.set(withTiming(0, { duration: 220 }));
      },
      onPressIn: () => {
        press.set(withSpring(1, SPRING));
      },
      onPressOut: () => {
        press.set(withSpring(0, SPRING));
      },
    }),
    [hover, press],
  );

  /** For the card itself: rises on hover, settles in on press. */
  const liftStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(hover.get(), [0, 1], [0, -lift]) },
      { scale: interpolate(press.get(), [0, 1], [1, pressScale]) },
    ],
    shadowOpacity: interpolate(hover.get(), [0, 1], [0, 0.14]),
    shadowRadius: interpolate(hover.get(), [0, 1], [2, 18]),
  }));

  /** For an image inside it: a slow push-in on hover. */
  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(hover.get(), [0, 1], [1, 1.06]) }],
  }));

  return { hover, press, handlers, liftStyle, zoomStyle };
}
