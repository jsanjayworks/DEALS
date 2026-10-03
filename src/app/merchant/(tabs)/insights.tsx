/**
 * Insights: is anyone seeing the deals, and is anyone taking them?
 *
 * The period figures come from merchant_stats, which reads the daily rollup.
 * The per-deal table is all-time, from each deal's own counters and actions,
 * and says so, so the two are never compared as if they covered the same days.
 *
 * On the local adapter, views are each deal's running total rather than a
 * windowed sum, so period conversion reads low against demo data.
 */

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { db } from '../../../data';
import type { CustomerAction, DealCardModel } from '../../../data/types';
import { useQuery } from '../../../lib/useQuery';
import { useBusinessId } from '../../../merchant/useBusiness';
import { chart, color, font, radius, space, type } from '../../../theme/tokens';
import { Chip, EmptyState, Header } from '../../../components';

const PERIODS = [7, 30] as const;

interface DealRow {
  deal: DealCardModel;
  taken: number;
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return '–';
  const p = (part / whole) * 100;
  return (p < 1 && p > 0 ? p.toFixed(1) : Math.round(p)) + '%';
}

export default function InsightsScreen() {
  const businessId = useBusinessId();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(7);

  const fetchStats = useCallback(
    () => (businessId ? db.getMerchantStats(businessId, days) : Promise.resolve(null)),
    [businessId, days],
  );
  const fetchDeals = useCallback(async (): Promise<DealRow[]> => {
    if (!businessId) return [];
    const deals = await db.listBusinessDeals(businessId);
    // Only deals customers could have seen have numbers worth showing.
    const seen = deals.filter((d) => !['DRAFT', 'SUBMITTED', 'VERIFICATION', 'REJECTED'].includes(d.status));
    const actions = await Promise.all(
      seen.map((d) => db.listDealActions(d.id).catch(() => [] as CustomerAction[])),
    );
    return seen
      .map((deal, i) => ({ deal, taken: actions[i].filter((a) => a.status !== 'cancelled').length }))
      .sort((a, b) => b.deal.views - a.deal.views);
  }, [businessId]);

  const stats = useQuery(fetchStats).data;
  const { data: rows, loading } = useQuery(fetchDeals);

  const taken = stats ? stats.claims + stats.bookings + stats.enquiries : 0;
  const maxViews = Math.max(1, ...(rows ?? []).map((r) => r.deal.views));

  const segments = stats
    ? [
        { label: 'Claims', value: stats.claims, fill: chart.series1 },
        { label: 'Bookings', value: stats.bookings, fill: chart.series2 },
        { label: 'Enquiries', value: stats.enquiries, fill: chart.series3 },
      ]
    : [];

  return (
    <View style={styles.screen}>
      <Header title="Insights" dark />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.periods}>
          {PERIODS.map((p) => (
            <Chip key={p} selected={days === p} onPress={() => setDays(p)}>
              {'Last ' + p + ' days'}
            </Chip>
          ))}
        </View>

        <View style={styles.tiles}>
          <Tile label="Views" value={stats?.views} />
          <Tile label="Shown in search" value={stats?.searches} />
          <Tile label="Took a deal" value={stats ? taken : undefined} />
          <Tile label="Conversion" text={stats ? pct(taken, stats.views) : undefined} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What customers did</Text>
          {taken === 0 ? (
            <Text style={styles.muted}>No claims, bookings or enquiries in this period yet.</Text>
          ) : (
            <>
              <View
                style={styles.stack}
                accessible
                accessibilityLabel={segments.map((s) => s.value + ' ' + s.label.toLowerCase()).join(', ')}
              >
                {segments
                  .filter((s) => s.value > 0)
                  .map((s) => (
                    <View key={s.label} style={[styles.segment, { flex: s.value, backgroundColor: s.fill }]} />
                  ))}
              </View>
              {/* The legend carries the numbers, so no segment depends on colour alone. */}
              <View style={styles.legend}>
                {segments.map((s) => (
                  <View key={s.label} style={styles.legendItem}>
                    <View style={[styles.swatch, { backgroundColor: s.fill }]} />
                    <Text style={styles.legendText}>
                      {s.label} <Text style={styles.legendValue}>{s.value}</Text>
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        <Text style={styles.sectionTitle}>By deal</Text>
        <Text style={styles.sectionNote}>All time, most viewed first.</Text>
        {!loading && (rows ?? []).length === 0 ? (
          <EmptyState
            icon="chart"
            title="No numbers yet"
            body="Once a deal has been live, its views and claims show up here."
          />
        ) : (
          <View style={styles.card}>
            <View style={styles.tableHead}>
              <Text style={[styles.th, styles.flex]}>Deal</Text>
              <Text style={[styles.th, styles.num]}>Taken</Text>
              <Text style={[styles.th, styles.num]}>Conv.</Text>
            </View>
            {(rows ?? []).map(({ deal, taken: t }) => (
              <Pressable
                key={deal.id}
                onPress={() => router.push({ pathname: '/merchant/deal/[id]', params: { id: deal.id } })}
                accessibilityRole="button"
                accessibilityLabel={
                  deal.title + ', ' + deal.views + ' views, ' + t + ' taken, ' + pct(t, deal.views) + ' conversion'
                }
                style={({ pressed }) => [styles.tr, pressed && { opacity: 0.6 }]}
              >
                <View style={styles.flex}>
                  <Text style={styles.dealTitle} numberOfLines={1}>
                    {deal.title}
                  </Text>
                  <View style={styles.barRow}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.bar,
                          { width: `${Math.max(2, Math.round((deal.views / maxViews) * 100))}%` as const },
                        ]}
                      />
                    </View>
                    <Text style={styles.views}>
                      {deal.views.toLocaleString('en-IN') + (deal.views === 1 ? ' view' : ' views')}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.td, styles.num]}>{t}</Text>
                <Text style={[styles.td, styles.num]}>{pct(t, deal.views)}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Tile({ label, value, text }: { label: string; value?: number; text?: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>
        {text ?? (value == null ? '–' : value.toLocaleString('en-IN'))}
      </Text>
      <Text style={styles.tileLabel}>{label}</Text>
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
  content: {
    padding: space.lg,
    paddingBottom: space.xxxl,
  },
  periods: {
    flexDirection: 'row',
    gap: space.sm,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.lg,
  },
  tile: {
    width: '48%',
    flexGrow: 1,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  tileValue: {
    fontFamily: font.bold,
    fontSize: 24,
    lineHeight: 30,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  tileLabel: {
    ...type.small,
    color: color.textSecondary,
  },
  card: {
    marginTop: space.lg,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  cardTitle: {
    ...type.h3,
    color: color.text,
    marginBottom: space.md,
  },
  muted: {
    ...type.body,
    color: color.textSecondary,
  },
  stack: {
    flexDirection: 'row',
    height: 16,
    // A 2px surface gap between segments keeps adjacent fills apart.
    gap: 2,
  },
  segment: {
    height: '100%',
    borderRadius: 4,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.lg,
    marginTop: space.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendText: {
    ...type.caption,
    color: color.textSecondary,
  },
  legendValue: {
    fontFamily: font.semibold,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  sectionTitle: {
    ...type.h3,
    color: color.text,
    marginTop: space.xxl,
  },
  sectionNote: {
    ...type.small,
    color: color.textSecondary,
  },
  tableHead: {
    flexDirection: 'row',
    gap: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  th: {
    ...type.overline,
    color: color.textSecondary,
  },
  num: {
    width: 52,
    textAlign: 'right',
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  dealTitle: {
    ...type.captionMedium,
    color: color.text,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: 6,
  },
  barTrack: {
    flex: 1,
    height: 8,
  },
  bar: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: chart.single,
  },
  views: {
    ...type.small,
    color: color.textSecondary,
    fontVariant: ['tabular-nums'],
    minWidth: 72,
  },
  td: {
    ...type.captionMedium,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
});
