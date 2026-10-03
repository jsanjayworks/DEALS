/**
 * The merchant tab bar: Dashboard, Deals, a raised Create button, Redeem and
 * Insights.
 *
 * Our own bar rather than React Navigation's default. The default moves the
 * label beside the icon on wide screens, which left the active pill sized for
 * the icon alone and the label hanging outside it. Here the layout is the
 * same at every width (pill around the icon, label under it) and the row is
 * centred with a maximum width, so a desktop window does not spread five
 * buttons across 1,280 px.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Icon, type IconName, useHoverPress } from '../components';
import { alpha, color, font, shadow, theme } from '../theme/tokens';

const TABS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'grid', label: 'Dashboard' },
  deals: { icon: 'list', label: 'Deals' },
  redeem: { icon: 'qr', label: 'Redeem' },
  insights: { icon: 'chart', label: 'Insights' },
};

const BAR_HEIGHT = 64;

export function MerchantTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      <View style={styles.row}>
        {state.routes.map((route, i) => {
          if (route.name === 'create') return <CreateButton key={route.key} />;
          const meta = TABS[route.name];
          if (!meta) return null;
          const focused = state.index === i;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          return <Tab key={route.key} {...meta} focused={focused} onPress={onPress} />;
        })}
      </View>
    </View>
  );
}

function Tab({ icon, label, focused, onPress }: { icon: IconName; label: string; focused: boolean; onPress: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      style={styles.tab}
    >
      <View style={[styles.pill, focused ? styles.pillOn : hovered && styles.pillHover]}>
        <Icon name={icon} size={22} color={focused ? color.brand : color.textMuted} strokeWidth={focused ? 2.1 : 1.8} />
      </View>
      <Text style={[styles.label, focused && styles.labelOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Opens the deal wizard over the tabs; not a tab of its own. */
function CreateButton() {
  const { handlers, liftStyle } = useHoverPress({ lift: 2, pressScale: 0.94 });
  return (
    <View style={styles.tab}>
      <Pressable
        onPress={() => router.push('/merchant/new')}
        {...handlers}
        accessibilityRole="button"
        accessibilityLabel="Create a deal"
      >
        <Animated.View style={[styles.create, liftStyle]}>
          {theme.accentGradient ? (
            <LinearGradient
              colors={theme.accentGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, styles.createFill]}
            />
          ) : null}
          {/* In a View: a bare Svg is not positioned on web, so the gradient would paint over it. */}
          <View>
            <Icon name="plus" size={26} color={color.onCta} strokeWidth={2.2} />
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  row: {
    height: BAR_HEIGHT,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: 48,
  },
  pill: {
    width: 56,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillOn: {
    backgroundColor: alpha(color.brand, 0.1),
  },
  pillHover: {
    backgroundColor: alpha(color.brand, 0.05),
  },
  label: {
    fontFamily: font.medium,
    fontSize: 11,
    color: color.textMuted,
  },
  labelOn: {
    fontFamily: font.semibold,
    color: color.brand,
  },
  create: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginTop: -22,
    backgroundColor: color.cta,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: color.surface,
    ...shadow.fab,
  },
  createFill: {
    borderRadius: 28,
  },
});
