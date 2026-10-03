/**
 * The customer tab bar: a floating frosted-glass pill rather than a slab across the
 * bottom, with brand-coloured icons. The active tab expands into a brand pill with its
 * label; the others are icons.
 *
 * It slides away with the header while scrolling down and returns on the way
 * up (see ui/chrome). Hidden tabs are skipped, so a route can live in the tab
 * group without earning a button.
 */

import { Pressable, StyleSheet, View } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';
import Animated, {
  FadeIn,
  LinearTransition,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass, Icon, type IconName, useHoverPress } from '../components';
import { color, font, rgbOf, shadow } from '../theme/tokens';
import { useChromeHidden } from './chrome';

export const TAB_ICONS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'home', label: 'Home' },
  search: { icon: 'search', label: 'Search' },
  'my-deals': { icon: 'ticket', label: 'My Deals' },
};

// Precomputed: the hover wash is built inside a worklet, which cannot call rgbOf.
const BRAND_RGB = rgbOf(color.brand);

const BAR_HEIGHT = 64;
const BAR_GAP = 12;

/** Bottom padding a scrolling screen needs so its last item clears the bar. */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + BAR_HEIGHT + BAR_GAP * 2;
}

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const hidden = useChromeHidden();
  const bottom = Math.max(insets.bottom, BAR_GAP) + 4;

  const slide = useAnimatedStyle(() => ({
    opacity: interpolate(hidden.get(), [0, 1], [1, 0]),
    transform: [{ translateY: interpolate(hidden.get(), [0, 1], [0, BAR_HEIGHT + bottom + 8]) }],
  }));

  const routes = state.routes.filter((r) => TAB_ICONS[r.name]);

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { bottom }, slide]}>
      <View style={styles.shadow}>
        <Glass tone="light" style={styles.pill} intensity={60}>
          {routes.map((route) => {
            const focused = state.routes[state.index]?.key === route.key;
            const meta = TAB_ICONS[route.name];
            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };
            return (
              <TabButton
                key={route.key}
                icon={meta.icon}
                label={meta.label}
                focused={focused}
                onPress={onPress}
              />
            );
          })}
        </Glass>
      </View>
    </Animated.View>
  );
}

function TabButton({
  icon,
  label,
  focused,
  onPress,
}: {
  icon: IconName;
  label: string;
  focused: boolean;
  onPress: () => void;
}) {
  const { handlers, hover } = useHoverPress();
  const hoverBg = useAnimatedStyle(() => ({
    // Frosted white bar, ink icons; the active tab is a brand pill (navy and gold on premium).
    backgroundColor: focused ? color.brand : `rgba(${BRAND_RGB},${0.12 * hover.get()})`,
  }));

  return (
    <Pressable
      onPress={onPress}
      {...handlers}
      accessibilityRole="tab"
      accessibilityLabel={label}
      aria-selected={focused}
    >
      <Animated.View layout={LinearTransition.springify().damping(18)} style={[styles.item, hoverBg]}>
        <Icon name={icon} size={22} color={focused ? color.onBrand : color.text} strokeWidth={focused ? 2.2 : 1.9} />
        {focused ? (
          <Animated.Text entering={FadeIn.duration(180)} style={styles.label} numberOfLines={1}>
            {label}
          </Animated.Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shadow: {
    borderRadius: 999,
    ...shadow.raised,
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  pill: {
    height: BAR_HEIGHT,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 4,
  },
  item: {
    height: 48,
    minWidth: 56,
    borderRadius: 999,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: color.onBrand,
  },
});

