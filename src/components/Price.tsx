/**
 * Price block and card meta row, from `Price` and `Meta` in
 * docs/design/figma-make/ui.tsx.
 *
 * Prices use tabular figures so a column of them does not jitter, which matters
 * on the results list where every card shows one.
 */

import { StyleSheet, Text, View } from 'react-native';
import { color, distanceLabel, font, inr, type } from '../theme/tokens';
import { Icon } from './Icon';

export interface PriceProps {
  /** The price being charged. */
  now: number | null;
  /** Struck through beside it. Omitted when there is no saving to show. */
  was?: number | null;
  /** "/mo" for rents and subscriptions. */
  unit?: string | null;
  /** The 28px treatment used on the deal page. */
  large?: boolean;
}

export function Price({ now, was, unit, large }: PriceProps) {
  const free = now === 0;
  return (
    <View style={styles.priceRow}>
      <Text style={[large ? styles.nowLarge : styles.now]}>
        {free ? 'Free' : inr(now ?? 0)}
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </Text>
      {was != null && was > (now ?? 0) ? (
        <Text style={styles.was}>{inr(was)}</Text>
      ) : null}
    </View>
  );
}

export interface MetaProps {
  distanceKm: number;
  rating: number;
  ratingCount?: number;
}

/** Distance and rating, the two facts every card carries. */
export function Meta({ distanceKm, rating, ratingCount }: MetaProps) {
  return (
    <View style={styles.metaRow}>
      <View style={styles.metaItem}>
        <Icon name="pin" size={13} color={color.textSecondary} />
        <Text style={styles.metaText}>{distanceLabel(distanceKm)}</Text>
      </View>
      {rating > 0 ? (
        <View style={styles.metaItem}>
          <Icon name="star" size={13} color={color.star} filled />
          <Text style={styles.metaText}>
            {rating.toFixed(1)}
            {ratingCount ? ' (' + ratingCount + ')' : ''}
          </Text>
        </View>
      ) : (
        <Text style={styles.metaText}>New</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  now: {
    fontFamily: font.bold,
    fontSize: 17,
    lineHeight: 24,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  nowLarge: {
    fontFamily: font.bold,
    fontSize: 28,
    lineHeight: 36,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontFamily: font.medium,
    fontSize: 12,
    color: color.textSecondary,
  },
  was: {
    ...type.caption,
    color: color.textMuted,
    textDecorationLine: 'line-through',
    fontVariant: ['tabular-nums'],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  metaText: {
    ...type.small,
    color: color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});
