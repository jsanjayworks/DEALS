/**
 * The Home header: where you are and how many deals are live there, with
 * notifications and your profile on the right.
 *
 * Frosted glass in the hero's colour. It slides up out of the way while
 * scrolling down and comes back on the first scroll up, in step with the tab
 * bar. The deal count is the one highlighted thing in it, in the accent, and
 * pulses once when the greeting below folds away so the eye lands on it.
 */

import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass, Icon, RollingNumber, useHoverPress } from '../components';
import { useChromeHidden } from '../ui/chrome';
import { MAX_CONTENT_WIDTH } from '../ui/layout';
import { color, font, theme, type } from '../theme/tokens';

export const HEADER_BAR_HEIGHT = 68;

export function useHeaderHeight(): number {
  return useSafeAreaInsets().top + HEADER_BAR_HEIGHT;
}

export function HomeHeader({
  locality,
  city,
  count,
  unread,
  initial,
  gutter,
  pulseAfterMs,
  onLocality,
  onBell,
  onProfile,
}: {
  locality: string;
  city: string;
  count: number | null;
  unread: number;
  initial: string;
  gutter: number;
  /** Pulse the count once, this long after mount (when the greeting folds). */
  pulseAfterMs: number | null;
  onLocality: () => void;
  onBell: () => void;
  onProfile: () => void;
}) {
  const insets = useSafeAreaInsets();
  const hidden = useChromeHidden();
  const height = insets.top + HEADER_BAR_HEIGHT;
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (pulseAfterMs == null) return;
    pulse.set(withDelay(
      pulseAfterMs,
      withSequence(withTiming(1.14, { duration: 220 }), withTiming(1, { duration: 320 })),
    ));
  }, [pulseAfterMs, pulse]);

  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(hidden.get(), [0, 1], [0, -height - 4]) }],
  }));
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.get() }] }));

  return (
    <Animated.View style={[styles.wrap, slide]}>
      <Glass tone="hero" edge={false} intensity={50} style={{ paddingTop: insets.top }}>
        <View style={[styles.row, { paddingHorizontal: gutter }]}>
          <Pressable
            onPress={onLocality}
            accessibilityRole="button"
            accessibilityLabel={
              'Deals around ' + locality + (count != null ? ', ' + count + ' deals nearby' : '') + '. Change locality'
            }
            style={styles.where}
          >
            <Text style={styles.overline}>Deals around · {city}</Text>
            <View style={styles.placeRow}>
              <Text style={styles.place} numberOfLines={1}>
                {locality}
              </Text>
              <Icon name="down" size={16} color={theme.hero.text} strokeWidth={2} />
              {count != null ? (
                <Animated.View style={[styles.count, pulseStyle]}>
                  <RollingNumber value={count} suffix=" deals" style={styles.countText} />
                </Animated.View>
              ) : null}
            </View>
          </Pressable>

          <RoundButton label={unread ? 'Notifications, ' + unread + ' unread' : 'Notifications'} onPress={onBell}>
            <Icon name="bell" size={22} color={theme.hero.text} />
            {unread ? <View style={styles.dot} /> : null}
          </RoundButton>
          <RoundButton label="Profile" onPress={onProfile} solid>
            <Text style={styles.initial}>{initial}</Text>
          </RoundButton>
        </View>
      </Glass>
    </Animated.View>
  );
}

function RoundButton({
  label,
  onPress,
  solid,
  children,
}: {
  label: string;
  onPress: () => void;
  solid?: boolean;
  children: ReactNode;
}) {
  const { handlers, liftStyle } = useHoverPress({ lift: 2, pressScale: 0.92 });
  return (
    <Pressable onPress={onPress} {...handlers} accessibilityRole="button" accessibilityLabel={label}>
      <Animated.View style={[styles.round, solid && styles.roundSolid, liftStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  row: {
    height: HEADER_BAR_HEIGHT,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  where: {
    flex: 1,
    minWidth: 0,
  },
  overline: {
    ...type.overline,
    color: theme.hero.muted,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  place: {
    fontFamily: font.bold,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.2,
    color: theme.hero.text,
    flexShrink: 1,
  },
  count: {
    marginLeft: 6,
    paddingHorizontal: 9,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.countPill.bg,
    justifyContent: 'center',
  },
  countText: {
    fontFamily: font.semibold,
    fontSize: 12,
    lineHeight: 16,
    color: theme.countPill.text,
    fontVariant: ['tabular-nums'],
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundSolid: {
    width: 36,
    height: 36,
    borderRadius: 18,
    margin: 4,
    backgroundColor: theme.hero.light ? color.brand : theme.hero.text,
  },
  initial: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: theme.hero.light ? color.white : theme.hero.colors[0],
  },
  dot: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.alert,
    borderWidth: 1.5,
    borderColor: theme.hero.colors[0],
  },
});
