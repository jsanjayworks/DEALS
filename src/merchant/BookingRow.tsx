/**
 * One booking, as a host stand reads it: the time first and large, then who,
 * how many, for what, and the code they will show.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BusinessOrder } from '../data';
import { ACTION_STATUS_LABEL, quantityLabel, slotTimeLabel } from '../lib/format';
import { color, radius, space, status as statusColor, type } from '../theme/tokens';

export function BookingRow({ booking, last, onPress }: { booking: BusinessOrder; last: boolean; onPress: () => void }) {
  const done = booking.status === 'redeemed';
  const off = booking.status === 'cancelled' || booking.status === 'expired';
  const who = booking.customer_name ?? 'Customer';
  const size = quantityLabel(booking.action_type, booking.quantity);
  const time = booking.slot_start ? slotTimeLabel(booking.slot_start) : '';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={time + ', ' + who + (size ? ', ' + size : '') + ', ' + booking.deal_title + ', ' + ACTION_STATUS_LABEL[booking.status]}
      style={({ pressed }) => [styles.row, !last && styles.rule, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.time, done && styles.timeDone, off && styles.timeOff]}>
        <Text style={[styles.timeText, (done || off) && styles.timeTextMuted]}>{time}</Text>
      </View>
      <View style={styles.body}>
        <Text style={[styles.who, off && styles.struck]} numberOfLines={1}>
          {who}
          {size ? <Text style={styles.size}>{' · ' + size}</Text> : null}
        </Text>
        <Text style={styles.deal} numberOfLines={1}>
          {booking.deal_title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[ACTION_STATUS_LABEL[booking.status], booking.redemption_code].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 68,
  },
  rule: {
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  time: {
    minWidth: 76,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
    alignItems: 'center',
    backgroundColor: statusColor.active.bg,
  },
  timeDone: {
    backgroundColor: color.surfaceSoftAlt,
  },
  timeOff: {
    backgroundColor: color.surfaceSoftAlt,
  },
  timeText: {
    ...type.bodySemibold,
    color: statusColor.active.fg,
    fontVariant: ['tabular-nums'],
  },
  timeTextMuted: {
    color: color.textMuted,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  who: {
    ...type.bodySemibold,
    color: color.text,
  },
  size: {
    ...type.caption,
    color: color.textSecondary,
  },
  struck: {
    textDecorationLine: 'line-through',
    color: color.textMuted,
  },
  deal: {
    ...type.caption,
    color: color.textSecondary,
  },
  meta: {
    ...type.small,
    color: color.textMuted,
    marginTop: 2,
  },
});
