/**
 * One of the merchant's own deals: status first, because that is what they
 * scan a list for, then capacity and time left for live ones, and the
 * reviewer's reason for rejected ones.
 */

import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DealCardModel } from '../data/types';
import { capacityFraction, endsInLabel } from '../lib/format';
import { color, inr, radius, space, type } from '../theme/tokens';
import { DealStatusPill, Icon } from '../components';

export function MerchantDealRow({ deal, onPress }: { deal: DealCardModel; onPress: () => void }) {
  const live = deal.status === 'ACTIVE' || deal.status === 'PAUSED';
  const hasCap = deal.capacity_total != null && deal.capacity_remaining != null;
  const fraction = capacityFraction(deal.capacity_remaining, deal.capacity_total);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={deal.title}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Image source={{ uri: deal.image }} style={styles.thumb} contentFit="cover" />
      <View style={styles.body}>
        <View style={styles.top}>
          <Text style={styles.title} numberOfLines={1}>
            {deal.title}
          </Text>
        </View>
        <View style={styles.meta}>
          <DealStatusPill status={deal.status} />
          <Text style={styles.price}>
            {deal.deal_price == null ? '' : deal.deal_price === 0 ? 'Free' : inr(deal.deal_price)}
            {deal.price_unit ?? ''}
          </Text>
        </View>

        {deal.status === 'REJECTED' && deal.rejection_reason ? (
          <Text style={styles.reason} numberOfLines={2}>
            {deal.rejection_reason}
          </Text>
        ) : null}

        {live ? (
          <View style={styles.liveRow}>
            {hasCap ? (
              <View style={styles.capWrap}>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.round(fraction * 100)}%` as const }]} />
                </View>
                <Text style={styles.small}>
                  {deal.capacity_remaining} of {deal.capacity_total} left
                </Text>
              </View>
            ) : (
              <Text style={styles.small}>No limit</Text>
            )}
            <Text style={[styles.small, deal.ending_soon && { color: color.alert }]}>
              {endsInLabel(deal.ends_at)}
            </Text>
          </View>
        ) : null}
      </View>
      <Icon name="chev" size={16} color={color.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  pressed: {
    opacity: 0.8,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  top: {
    flexDirection: 'row',
  },
  title: {
    ...type.bodySemibold,
    color: color.text,
    flex: 1,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  price: {
    ...type.captionMedium,
    color: color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  reason: {
    ...type.small,
    color: color.alert,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  capWrap: {
    flex: 1,
    gap: 4,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: color.brand,
  },
  small: {
    ...type.small,
    color: color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});
