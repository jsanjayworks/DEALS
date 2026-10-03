/**
 * Merchant dashboard: how the week went, what is live, and what needs doing.
 *
 * "Needs attention" comes first among the lists because a rejected deal is
 * earning nothing until it is fixed, and a draft nobody submits never goes live.
 */

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { db } from '../../../data';
import type { DealCardModel } from '../../../data/types';
import { useQuery } from '../../../lib/useQuery';
import { MerchantDealRow } from '../../../merchant/DealRow';
import { BUCKETS, type BucketKey, useBusiness, useBusinessId } from '../../../merchant/useBusiness';
import { VerificationCard } from '../../../merchant/VerificationCard';
import { useSession } from '../../../state/session';
import { color, font, radius, space, type } from '../../../theme/tokens';
import { Button, EmptyState, Icon, VerifiedBadge } from '../../../components';

const PERIODS = [7, 30] as const;

export default function MerchantDashboard() {
  const insets = useSafeAreaInsets();
  const businessId = useBusinessId();
  const { business } = useBusiness();
  const setMode = useSession((s) => s.setMode);
  const [days, setDays] = useState<(typeof PERIODS)[number]>(7);

  const fetchAll = useCallback(async () => {
    if (!businessId) return null;
    const [stats, deals, notifications] = await Promise.all([
      db.getMerchantStats(businessId, days),
      db.listBusinessDeals(businessId),
      db.listNotifications(),
    ]);
    return {
      stats,
      deals,
      unread: notifications.filter((n) => n.read_at === null).length,
    };
  }, [businessId, days]);
  const { data } = useQuery(fetchAll);

  const deals = data?.deals ?? [];
  const live = deals.filter((d) => d.status === 'ACTIVE' || d.status === 'PAUSED');
  const attention = deals.filter((d) => d.status === 'REJECTED' || d.status === 'DRAFT');
  const stats = data?.stats;
  const taken = stats ? stats.claims + stats.bookings + stats.enquiries : 0;

  const count = (k: BucketKey) =>
    deals.filter((d) => (BUCKETS[k].statuses as readonly string[]).includes(d.status)).length;

  const openDeal = (d: DealCardModel) =>
    router.push({ pathname: '/merchant/deal/[id]', params: { id: d.id } });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: space.xxxl }}>
      <View style={[styles.head, { paddingTop: insets.top + space.lg }]}>
        <View style={styles.headRow}>
          <View style={styles.headText}>
            <Text style={styles.overline}>Merchant</Text>
            <Text style={styles.bizName} numberOfLines={1}>
              {business?.name ?? ' '}
            </Text>
            {business?.verification_status === 'verified' ? (
              <View style={styles.verified}>
                <VerifiedBadge />
              </View>
            ) : null}
          </View>
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
            accessibilityLabel="Switch to customer mode"
            style={styles.headButton}
          >
            <Icon name="user" size={20} color={color.white} />
          </Pressable>
        </View>

        <View style={styles.periods}>
          {PERIODS.map((p) => (
            <Pressable
              key={p}
              onPress={() => setDays(p)}
              accessibilityRole="button"
              accessibilityState={{ selected: days === p }}
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
              (stats.enquiries ? ', including ' + stats.enquiries + (stats.enquiries === 1 ? ' enquiry' : ' enquiries') : '')
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
            body="Create a deal and submit it. Once it is approved it appears to customers nearby."
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
    alignItems: 'flex-start',
    gap: space.sm,
  },
  headText: {
    flex: 1,
  },
  overline: {
    ...type.overline,
    color: color.surfaceSoft,
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
