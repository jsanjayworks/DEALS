/**
 * The Home header: where you are, with notifications and your profile on the
 * right. The deal count is not repeated here; the count card under it owns it.
 *
 * Frosted light glass over the page, ink type. It slides up out of the way while
 * scrolling down and comes back on the first scroll up, in step with the tab
 * bar.
 */

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass, Icon, useHoverPress } from '../components';
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
  unread,
  initial,
  gutter,
  onLocality,
  onBell,
  onProfile,
}: {
  locality: string;
  city: string;
  unread: number;
  initial: string;
  gutter: number;
  onLocality: () => void;
  onBell: () => void;
  onProfile: () => void;
}) {
  const insets = useSafeAreaInsets();
  const hidden = useChromeHidden();
  const height = insets.top + HEADER_BAR_HEIGHT;

  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(hidden.get(), [0, 1], [0, -height - 4]) }],
  }));

  return (
    <Animated.View style={[styles.wrap, slide]}>
      <Glass tone="light" edge={false} intensity={50} style={{ paddingTop: insets.top }}>
        <View style={[styles.row, { paddingHorizontal: gutter }]}>
          <Pressable
            onPress={onLocality}
            accessibilityRole="button"
            accessibilityLabel={
              'Deals around ' + locality + '. Change locality'
            }
            style={styles.where}
          >
            <Text style={styles.overline}>Deals around · {city}</Text>
            <View style={styles.placeRow}>
              <Text style={styles.place} numberOfLines={1}>
                {locality}
              </Text>
              <Icon name="down" size={16} color={color.text} strokeWidth={2} />
            </View>
          </Pressable>

          <RoundButton label={unread ? 'Notifications, ' + unread + ' unread' : 'Notifications'} onPress={onBell}>
            <Icon name="bell" size={22} color={color.text} />
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
    color: color.textMuted,
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
    color: color.text,
    flexShrink: 1,
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
    backgroundColor: theme.countPill.bg,
  },
  initial: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: theme.countPill.text,
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
    borderColor: color.background,
  },
});
