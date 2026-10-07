/**
 * Merchant dashboard: how the week went, what is live, and what needs doing.
 *
 * "Needs attention" comes first among the lists because a rejected deal is
 * earning nothing until it is fixed, and a draft nobody submits never goes live.
 * Today's bookings come first after the actions, by time, as a host stand
 * reads them; recent orders follow: who took what, and what they paid.
 */

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { backend, db, type BusinessOrder } from '../../../data';
import type { DealCardModel } from '../../../data/types';
import { ACTION_STATUS_LABEL, quantityLabel, shortAgo, slotLabel } from '../../../lib/format';
import { slotKey } from '../../../data/booking';
import { BookingRow } from '../../../merchant/BookingRow';
import { openVoice } from '../../../voice/VoiceHost';
import { PAY_METHOD_LABEL, paymentOf } from '../../../lib/payment';
import { useQuery } from '../../../lib/useQuery';
import { MerchantDealRow } from '../../../merchant/DealRow';
import { BUCKETS, type BucketKey, inBucket, useBusiness, useBusinessId } from '../../../merchant/useBusiness';
import { VerificationCard } from '../../../merchant/VerificationCard';
import { useSession } from '../../../state/session';
import { color, font, inr, radius, space, status as statusColor, type } from '../../../theme/tokens';
import { Button, EmptyState, Icon, VerifiedBadge } from '../../../components';
import { pressedProps } from '../../../lib/a11y';

const PERIODS = [7, 30] as const;

export default function MerchantDashboard() {
  const insets = useSafeAreaInsets();
  const businessId = useBusinessId();
  const { business } = useBusiness();
  const setMode = useSession((s) => s.setMode);
  const [days, setDays] = useState<(typeof PERIODS)[number]>(7);

  const fetchAll = useCallback(async () => {
    if (!businessId) return null;
    const [stats, deals, notifications, orders] = await Promise.all([
      db.getMerchantStats(businessId, days),
      db.listBusinessDeals(businessId),
      db.listNotifications(),
      db.listBusinessOrders(businessId).catch(() => [] as BusinessOrder[]),
    ]);
    // Today's bookings by time, cancelled ones left out; and how many are still to come.
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const dayStart = midnight.getTime();
    const dayEnd = dayStart + 86_400_000;
    const live = (o: BusinessOrder) => o.status !== 'cancelled' && o.status !== 'expired';
    const todayBookings = orders
      .filter((o) => o.slot_start && live(o) && slotKey(o.slot_start) >= dayStart && slotKey(o.slot_start) < dayEnd)
      .sort((a, b) => slotKey(a.slot_start!) - slotKey(b.slot_start!));
    const laterBookings = orders.filter((o) => o.slot_start && live(o) && slotKey(o.slot_start) >= dayEnd).length;
    const takesBookings = deals.some((d) => d.booking_required) || orders.some((o) => o.slot_start);

    // Paid online in the chosen period, cancelled orders left out.
    const since = Date.now() - days * 86_400_000;
    const sales = orders
      .filter((o) => new Date(o.created_at).getTime() >= since && o.status !== 'cancelled')
      .reduce((sum, o) => sum + (paymentOf(o)?.amount ?? 0), 0);
    return {
      stats,
      deals,
      orders,
      sales,
      todayBookings,
      laterBookings,
      takesBookings,
      unread: notifications.filter((n) => n.read_at === null).length,
    };
  }, [businessId, days]);
  const { data } = useQuery(fetchAll);

  const deals = data?.deals ?? [];
  const live = deals.filter((d) => d.status === 'ACTIVE' || d.status === 'PAUSED');
  const attention = deals.filter((d) => d.status === 'REJECTED' || d.status === 'DRAFT');
  const stats = data?.stats;
  const taken = stats ? stats.claims + stats.bookings + stats.enquiries : 0;
  const orders = data?.orders ?? [];
  const sales = data?.sales ?? 0;

  const count = (k: BucketKey) =>
    deals.filter((d) => inBucket(d, k)).length;

  const openDeal = (d: DealCardModel) =>
    router.push({ pathname: '/merchant/deal/[id]', params: { id: d.id } });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: space.xxxl }}>
      <View style={[styles.head, { paddingTop: insets.top + space.lg }]}>
        <View style={styles.headRow}>
          <View style={styles.headText} />
          <Pressable
            onPress={() => router.push('/merchant/business')}
            accessibilityRole="button"
            accessibilityLabel="Business details"
            style={styles.headButton}
          >
            <Icon name="gear" size={20} color={color.white} />
          </Pressable>
          <Pressable
            onPress={openVoice}
            accessibilityRole="button"
            accessibilityLabel="Ask by voice"
            style={styles.headButton}
          >
            <Icon name="mic" size={20} color={color.white} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/notifications')}
            accessibilityRole="button"
            accessibilityLabel={data?.unread ? 'Notifications, ' + data.unread + ' unread' : 'Notifications'}
            style={styles.headButton}
          >
            <Icon name="bell" size={20} color={color.white} />
            {data?.unread ? <View style={styles.dot} /> : null}
          </Pressable>
          <Pressable
            // Back to the customer app already underneath, not a second copy of it.
            onPress={() => {
              setMode('customer');
              router.dismissTo('/');
            }}
            accessibilityRole="button"
            accessibilityLabel="Switch to customer view"
            style={styles.modePill}
          >
            <Icon name="user" size={16} color={color.white} />
            <Text style={styles.modePillText}>Customer view</Text>
          </Pressable>
        </View>
        {/* The name gets the full width under the buttons, so long names read whole. */}
        <Text style={styles.overline}>Merchant</Text>
        <Text style={styles.bizName} numberOfLines={2}>
          {business?.name ?? ' '}
        </Text>
        {business?.verification_status === 'verified' ? (
          <View style={styles.verified}>
            <VerifiedBadge />
          </View>
        ) : null}

        <View style={styles.periods}>
          {PERIODS.map((p) => (
            <Pressable
              key={p}
              onPress={() => setDays(p)}
              // 32 px tall to sit in the header; the touch area reaches 44.
              hitSlop={6}
              accessibilityRole="button"
              {...pressedProps(days === p)}
              style={[styles.period, days === p && styles.periodOn]}
            >
              <Text style={[styles.periodText, days === p && styles.periodTextOn]}>
                Last {p} days
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.statGrid}>
          <Stat label="Views" value={stats?.views} />
          <Stat label="In search" value={stats?.searches} />
          <Stat label="Claims" value={stats?.claims} />
          <Stat label="Bookings" value={stats?.bookings} />
        </View>
        <Text style={styles.statNote}>
          {stats
            ? taken + (taken === 1 ? ' customer' : ' customers') + ' took a deal' +
              (stats.enquiries ? ', including ' + stats.enquiries + (stats.enquiries === 1 ? ' enquiry' : ' enquiries') : '') +
              (sales > 0 ? ' · ' + inr(sales) + ' paid online' : '')
            : ' '}
        </Text>
      </View>

      <View style={styles.buckets}>
        {(Object.keys(BUCKETS) as BucketKey[]).map((k) => (
          <Pressable
            key={k}
            onPress={() => router.navigate({ pathname: '/merchant/deals', params: { bucket: k } })}
            accessibilityRole="button"
            accessibilityLabel={count(k) + ' ' + BUCKETS[k].label}
            style={({ pressed }) => [styles.bucket, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.bucketValue}>{data ? count(k) : '–'}</Text>
            <Text style={styles.bucketLabel}>{BUCKETS[k].label}</Text>
          </Pressable>
        ))}
      </View>

      {business && business.verification_status !== 'verified' ? (
        <VerificationCard business={business} />
      ) : null}

      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button variant="cta" full icon="plus" onPress={() => router.push('/merchant/new')}>
            Create a deal
          </Button>
        </View>
        <View style={styles.flex}>
          <Button variant="secondary" full icon="qr" onPress={() => router.navigate('/merchant/redeem')}>
            Redeem
          </Button>
        </View>
      </View>

      {data?.takesBookings ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>
              {'Today’s bookings' + (data.todayBookings.length ? ' · ' + data.todayBookings.length : '')}
            </Text>
            <Pressable
              onPress={() => router.push('/merchant/bookings')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="See all bookings"
            >
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          </View>
          {data.todayBookings.length > 0 ? (
            <View style={styles.orders}>
              {data.todayBookings.slice(0, 8).map((b, i, shown) => (
                <BookingRow
                  key={b.id}
                  booking={b}
                  last={i === shown.length - 1}
                  onPress={() => router.push({ pathname: '/merchant/deal/[id]', params: { id: b.deal_id } })}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.noBookings}>
              No bookings today.
              {data.laterBookings ? ' ' + data.laterBookings + ' coming up on the next days.' : ''}
            </Text>
          )}
          {data.todayBookings.length > 8 ? (
            <Text style={styles.noBookings}>And {data.todayBookings.length - 8} more today, under See all.</Text>
          ) : null}
        </View>
      ) : null}

      {orders.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent orders</Text>
          <View style={styles.orders}>
            {orders.slice(0, 8).map((o, i) => (
              <OrderRow
                key={o.id}
                order={o}
                last={i === Math.min(orders.length, 8) - 1}
                onPress={() => router.push({ pathname: '/merchant/deal/[id]', params: { id: o.deal_id } })}
              />
            ))}
          </View>
        </View>
      ) : null}

      {attention.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Needs attention</Text>
          <View style={styles.list}>
            {attention.map((d) => (
              <MerchantDealRow key={d.id} deal={d} onPress={() => openDeal(d)} />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Live now</Text>
          {live.length > 0 ? (
            <Pressable
              onPress={() => router.navigate({ pathname: '/merchant/deals', params: { bucket: 'live' } })}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          ) : null}
        </View>
        {data && live.length === 0 ? (
          <EmptyState
            icon="store"
            title="Nothing live yet"
            body={
              backend === 'local'
                ? 'Create a deal and publish it. In the demo it goes live straight away.'
                : 'Create a deal and submit it. Once it is approved it appears to customers nearby.'
            }
          />
        ) : (
          <View style={styles.list}>
            {live.slice(0, 5).map((d) => (
              <MerchantDealRow key={d.id} deal={d} onPress={() => openDeal(d)} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

/** One order: who, what, what they paid and how, and where it stands. */
function OrderRow({ order, last, onPress }: { order: BusinessOrder; last: boolean; onPress: () => void }) {
  const paid = paymentOf(order);
  const amount = paid
    ? inr(paid.amount) + ' · ' + PAY_METHOD_LABEL[paid.method]
    : (order.deal_price ?? 0) > 0
      ? 'Pay at store'
      : order.action_type === 'enquiry'
        ? 'Enquiry'
        : 'Free';
  const meta = [
    // A booking says when first: that is what the merchant plans around.
    order.slot_start ? slotLabel(order.slot_start) : null,
    ACTION_STATUS_LABEL[order.status],
    quantityLabel(order.action_type, order.quantity),
    paid ? paid.order_id : order.redemption_code,
    shortAgo(order.created_at),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={(order.customer_name ?? 'A customer') + ', ' + order.deal_title + ', ' + amount}
      style={({ pressed }) => [styles.order, !last && styles.orderRule, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.flex}>
        <Text style={styles.orderWho} numberOfLines={1}>
          {order.customer_name ?? 'Customer'}
        </Text>
        <Text style={styles.orderDeal} numberOfLines={1}>
          {order.deal_title}
        </Text>
        <Text style={styles.orderMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text style={[styles.orderAmount, paid && styles.orderPaid]}>{amount}</Text>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value == null ? '–' : value.toLocaleString('en-IN')}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.background,
  },
  noBookings: {
    ...type.caption,
    color: color.textSecondary,
  },
  orders: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  order: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 64,
  },
  orderRule: {
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  orderWho: {
    ...type.bodySemibold,
    color: color.text,
  },
  orderDeal: {
    ...type.caption,
    color: color.textSecondary,
  },
  orderMeta: {
    ...type.small,
    color: color.textMuted,
    marginTop: 2,
  },
  orderAmount: {
    ...type.captionMedium,
    color: color.textSecondary,
  },
  orderPaid: {
    color: statusColor.active.fg,
  },
  flex: {
    flex: 1,
  },
  head: {
    backgroundColor: color.brand,
    paddingHorizontal: space.xl,
    paddingBottom: space.xl,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm,
  },
  headText: {
    flex: 1,
  },
  overline: {
    ...type.overline,
    color: color.surfaceSoft,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  modePillText: {
    ...type.captionMedium,
    color: color.white,
  },
  bizName: {
    ...type.h1,
    color: color.white,
  },
  verified: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: color.white,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  headButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.alert,
  },
  periods: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xl,
  },
  period: {
    paddingHorizontal: space.md,
    height: 32,
    borderRadius: radius.pill,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  periodOn: {
    backgroundColor: color.white,
  },
  periodText: {
    ...type.captionMedium,
    color: color.white,
  },
  periodTextOn: {
    color: color.brandStrong,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: space.lg,
    gap: space.sm,
  },
  stat: {
    width: '48%',
    flexGrow: 1,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  statValue: {
    fontFamily: font.bold,
    fontSize: 24,
    lineHeight: 30,
    color: color.white,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    ...type.small,
    color: color.surfaceSoft,
  },
  statNote: {
    ...type.caption,
    color: color.surfaceSoft,
    marginTop: space.md,
  },
  buckets: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    marginTop: space.lg,
  },
  bucket: {
    flex: 1,
    paddingVertical: space.md,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
  },
  bucketValue: {
    ...type.h2,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  bucketLabel: {
    ...type.small,
    color: color.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: space.lg,
    marginTop: space.lg,
  },
  section: {
    marginTop: space.xxl,
    paddingHorizontal: space.lg,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  sectionTitle: {
    ...type.h2,
    color: color.text,
    marginBottom: space.md,
  },
  seeAll: {
    ...type.captionMedium,
    fontFamily: font.semibold,
    color: color.brand,
  },
  list: {
    gap: space.md,
  },
});
