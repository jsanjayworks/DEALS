/**
 * My vehicle, on Home. With a vehicle picked, it is a door to every deal for
 * it ("Everything for your Classic 350 · 4 deals"); without one, an
 * invitation to pick it. Either way one row, so it never crowds the page.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Icon, useHoverPress } from '../components';
import { color, font, radius, space, theme, type } from '../theme/tokens';

export function VehicleCard({
  label,
  count,
  onPress,
}: {
  /** "Royal Enfield Classic 350", "your bike", or null when none is picked. */
  label: string | null;
  count: number | null;
  onPress: () => void;
}) {
  const { handlers, liftStyle } = useHoverPress({ lift: 2, pressScale: 0.98 });
  const title = label
    ? 'Everything for ' + (label.startsWith('your ') ? label : 'your ' + label)
    : 'Own a bike, scooter or car?';
  const body = label
    ? count == null
      ? 'Servicing, washes, tyres and gear nearby'
      : count === 0
        ? 'Nothing nearby right now. Tap to look further out'
        : count + (count === 1 ? ' deal' : ' deals') + ' nearby: servicing, washes, tyres and gear'
    : 'Pick yours to see every service and accessory deal for it';

  return (
    <Pressable onPress={onPress} {...handlers} accessibilityRole="button" accessibilityLabel={title + '. ' + body}>
      <Animated.View style={[styles.card, liftStyle]}>
        <View style={styles.icon}>
          <Icon name={label ? 'wrench' : 'bike'} size={20} color={theme.onSelected ?? color.white} strokeWidth={1.8} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.body} numberOfLines={1}>
            {body}
          </Text>
        </View>
        <Icon name="chev" size={18} color={color.textSecondary} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: theme.tile.bg,
    borderWidth: 1,
    borderColor: theme.tile.border,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: font.semibold,
    fontSize: 15,
    lineHeight: 20,
    color: color.text,
  },
  body: {
    ...type.caption,
    color: color.textSecondary,
  },
});
