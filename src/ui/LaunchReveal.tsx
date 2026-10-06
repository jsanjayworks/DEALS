/**
 * The opening of a category page: the tile that was tapped grows into the
 * page's header, and the rest of the page rises in behind it.
 *
 *   0 ms      a card in the header colours sits exactly over the tapped tile
 *   0–420     it grows to the full width and the header's height, taking
 *             on the header's corners and losing its icon as it goes
 *   120–520   everything under the header fades up from 24 px below
 *   420–580   the real header appears beneath the card, which fades away;
 *             both are drawn in the same colours, so the hand-off is soft
 *
 * Opened without a tile (a deep link, the search screen), the page only
 * rises in. With "reduce motion" on, it simply appears.
 *
 * Built by hand rather than with a stack transition because the web build
 * uses the native stack, which does not animate on the web.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, categoryIcon } from '../components';
import { theme } from '../theme/tokens';
import { takeLaunchRect, type LaunchRect } from './launch';

const GROW_MS = 420;
const RISE_DELAY_MS = 120;
const RISE_MS = 400;
const FADE_MS = 160;
/** Material's "emphasized" curve: quick to leave, gentle to land. */
const EASE = Easing.bezier(0.2, 0, 0, 1);
const TILE_RADIUS = 18;
/** The category header's bottom corners, so the card lands on its exact shape. */
const HERO_RADIUS = theme.hero.light ? 0 : 28;

export function useLaunchReveal() {
  // Read once, on the first render of the page.
  const [rect] = useState<LaunchRect | null>(() => takeLaunchRect());
  const reduced = useReducedMotion();
  const grow = useSharedValue(rect && !reduced ? 0 : 1);
  const rise = useSharedValue(reduced ? 1 : 0);
  const cover = useSharedValue(rect && !reduced ? 1 : 0);
  /** The header's height once it has laid out; the card grows to it. */
  const heroHeight = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    grow.value = withTiming(1, { duration: GROW_MS, easing: EASE });
    rise.value = withDelay(rect ? RISE_DELAY_MS : 0, withTiming(1, { duration: RISE_MS, easing: EASE }));
    cover.value = withDelay(GROW_MS, withTiming(0, { duration: FADE_MS }));
  }, [reduced, rect, grow, rise, cover]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: rise.value,
    transform: [{ translateY: interpolate(rise.value, [0, 1], [24, 0]) }],
  }));
  // The real header stays hidden under the growing card, or its title would
  // show through twice; it is there, complete, the moment the card lands.
  // Without a card it rises with the rest of the page.
  const withCard = rect !== null && !reduced;
  const heroStyle = useAnimatedStyle(() =>
    withCard
      ? { opacity: grow.value >= 0.999 ? 1 : 0 }
      : { opacity: rise.value, transform: [{ translateY: interpolate(rise.value, [0, 1], [-12, 0]) }] },
  );

  return {
    rect: reduced ? null : rect,
    grow,
    cover,
    heroHeight,
    contentStyle,
    heroStyle,
    onHeroLayout: (h: number) => {
      heroHeight.value = h;
    },
  };
}

/** The growing card, drawn over the page while it opens. */
export function LaunchCard({
  reveal,
  icon,
}: {
  reveal: ReturnType<typeof useLaunchReveal>;
  icon: string;
}) {
  const { width, height } = useWindowDimensions();
  const { rect, grow, cover, heroHeight } = reveal;
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!rect) return;
    const t = setTimeout(() => setDone(true), GROW_MS + FADE_MS + 40);
    return () => clearTimeout(t);
  }, [rect]);

  const from = rect ?? { x: 0, y: 0, width: 0, height: 0 };
  const cardStyle = useAnimatedStyle(() => {
    const toHeight = heroHeight.value > 0 ? heroHeight.value : Math.min(320, height * 0.4);
    return {
      left: interpolate(grow.value, [0, 1], [from.x, 0]),
      top: interpolate(grow.value, [0, 1], [from.y, 0]),
      width: interpolate(grow.value, [0, 1], [from.width, width]),
      height: interpolate(grow.value, [0, 1], [from.height, toHeight]),
      borderTopLeftRadius: interpolate(grow.value, [0, 1], [TILE_RADIUS, 0]),
      borderTopRightRadius: interpolate(grow.value, [0, 1], [TILE_RADIUS, 0]),
      borderBottomLeftRadius: interpolate(grow.value, [0, 1], [TILE_RADIUS, HERO_RADIUS]),
      borderBottomRightRadius: interpolate(grow.value, [0, 1], [TILE_RADIUS, HERO_RADIUS]),
      opacity: cover.value,
    };
  });
  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(grow.value, [0, 0.5], [1, 0], 'clamp'),
    transform: [{ scale: interpolate(grow.value, [0, 1], [1, 1.6]) }],
  }));

  if (!rect || done) return null;
  return (
    <Animated.View style={[styles.card, cardStyle]} pointerEvents="none">
      <LinearGradient colors={theme.hero.colors} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.center, iconStyle]}>
        <Icon name={categoryIcon(icon)} size={26} color={theme.onSelected ?? theme.hero.text} strokeWidth={1.7} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    overflow: 'hidden',
    zIndex: 10,
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
