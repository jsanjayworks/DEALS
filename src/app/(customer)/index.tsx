/**
 * Home.
 *
 * Every rail here is a real feed_nearby() call against the data layer, so what
 * renders is the same ranked, radius-filtered, age-gated result the database
 * returns — not a hand-picked array. Changing the radius chip re-queries.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LOCALITIES, TOP_CATEGORIES } from '../../data/seed-reference';
import { db } from '../../data';
import type { DealCardModel, FeedSection, LatLng } from '../../data/types';
import { color, font, radius as r, space, type } from '../../theme/tokens';
import {
  Chip,
  DealCard,
  DealCardSkeleton,
  DEAL_CARD_LARGE_WIDTH,
  Icon,
  Section,
} from '../../components';

const RADII = [
  { label: '500m', m: 500 },
  { label: '1km', m: 1000 },
  { label: '3km', m: 3000 },
  { label: '5km', m: 5000 },
  { label: '10km', m: 10000 },
];

/** The design uses emoji for the category row rather than line icons. */
const CATEGORY_EMOJI: Record<string, string> = {
  food: '🍽',
  retail: '🛍',
  events: '🎟',
  mobility: '🚕',
  property: '🏠',
  services: '✂️',
  business: '💼',
  community: '📍',
};

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

type Rails = Record<FeedSection, DealCardModel[]>;

const EMPTY_RAILS: Rails = {
  near_you: [],
  today: [],
  trending: [],
  new: [],
  ending_soon: [],
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [localityId, setLocalityId] = useState('loc-kor');
  const [radiusM, setRadiusM] = useState(3000);
  const [rails, setRails] = useState<Rails>(EMPTY_RAILS);
  const [loading, setLoading] = useState(true);
  const [nearbyCount, setNearbyCount] = useState(0);

  const locality = useMemo(
    () => LOCALITIES.find((l) => l.id === localityId) ?? LOCALITIES[0],
    [localityId],
  );
  const origin: LatLng = locality.centroid;

  const load = useCallback(async () => {
    setLoading(true);
    const sections: FeedSection[] = ['near_you', 'trending', 'ending_soon', 'new'];
    const [all, ...lists] = await Promise.all([
      db.feedNearby({ origin, radius_m: radiusM, section: 'near_you', limit: 200 }),
      ...sections.map((section) =>
        db.feedNearby({ origin, radius_m: radiusM, section, limit: 12 }),
      ),
    ]);

    const next: Rails = { ...EMPTY_RAILS };
    sections.forEach((section, i) => {
      next[section] = lists[i];
    });
    setRails(next);
    setNearbyCount(all.length);
    setLoading(false);
  }, [origin, radiusM]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDeal = (deal: DealCardModel) => {
    void db.recordEvents([{ deal_id: deal.id, event_type: 'view', source: 'home' }]);
    router.push({ pathname: '/deal/[id]', params: { id: deal.id } });
  };

  const rail = (deals: DealCardModel[]) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.railContent}
    >
      {loading
        ? [0, 1].map((k) => (
            <View key={k} style={{ width: DEAL_CARD_LARGE_WIDTH }}>
              <DealCardSkeleton variant="large" />
            </View>
          ))
        : deals.map((d) => (
            <DealCard key={d.id} deal={d} variant="large" onPress={() => openDeal(d)} />
          ))}
    </ScrollView>
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: space.xxxl }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.head, { paddingTop: insets.top + space.lg }]}>
        <View style={styles.headRow}>
          <Pressable accessibilityRole="button" style={styles.localityButton}>
            <Text style={styles.overline}>Deals around</Text>
            <View style={styles.localityRow}>
              <Text style={styles.localityName}>{locality.name}, {locality.city}</Text>
              <Icon name="down" size={16} color={color.text} />
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            style={styles.bell}
          >
            <Icon name="bell" size={20} color={color.text} />
            <View style={styles.bellDot} />
          </Pressable>
        </View>

        <Text style={styles.greeting}>
          {greeting()}, Aarav.{'\n'}
          <Text style={styles.greetingMuted}>
            {loading ? 'Finding deals' : nearbyCount + ' deals nearby'}.
          </Text>
        </Text>

        <Pressable
          accessibilityRole="search"
          onPress={() => router.push('/search')}
          style={({ pressed }) => [styles.searchBar, pressed && styles.pressed]}
        >
          <Icon name="spark" size={22} color={color.interactive} />
          <View style={styles.searchTextWrap}>
            <Text style={styles.searchPlaceholder}>What are you looking for?</Text>
            <Text style={styles.searchHint}>Try "Lunch under {'₹'}300 near me"</Text>
          </View>
          <Icon name="search" size={20} color={color.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryRow}
      >
        {TOP_CATEGORIES.map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: '/results', params: { vertical: c.vertical } })
            }
            style={styles.category}
          >
            <View style={styles.categoryTile}>
              <Text style={styles.categoryEmoji}>{CATEGORY_EMOJI[c.vertical]}</Text>
            </View>
            <Text style={styles.categoryLabel}>{c.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.radiusRow}
      >
        <Text style={styles.withinLabel}>Within</Text>
        {RADII.map((x) => (
          <Chip key={x.m} selected={radiusM === x.m} onPress={() => setRadiusM(x.m)}>
            {x.label}
          </Chip>
        ))}
      </ScrollView>

      <Section title="Deals near you" action="See all" onAction={() => router.push('/results')}>
        {rail(rails.near_you)}
      </Section>

      <Section title="Trending">{rail(rails.trending)}</Section>

      <Section title="Ending soon">{rail(rails.ending_soon)}</Section>

      <Section title="New this week">
        <View style={styles.grid}>
          {rails.new.slice(0, 4).map((d) => (
            <View key={d.id} style={styles.gridCell}>
              <DealCard deal={d} variant="compact" onPress={() => openDeal(d)} />
            </View>
          ))}
        </View>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.background,
  },
  head: {
    backgroundColor: color.surface,
    paddingHorizontal: space.xl,
    paddingBottom: space.xl,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  localityButton: {
    flex: 1,
  },
  overline: {
    ...type.overline,
    color: color.textSecondary,
  },
  localityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  localityName: {
    ...type.h3,
    color: color.text,
  },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.alertSoft,
  },
  greeting: {
    ...type.display,
    color: color.text,
    marginTop: space.xl,
  },
  greetingMuted: {
    color: color.textMuted,
  },
  searchBar: {
    marginTop: space.xl,
    height: 56,
    borderRadius: r.xl,
    backgroundColor: color.background,
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  searchTextWrap: {
    flex: 1,
  },
  searchPlaceholder: {
    ...type.body,
    color: color.text,
  },
  searchHint: {
    ...type.small,
    color: color.textSecondary,
  },
  pressed: {
    opacity: 0.8,
  },
  categoryRow: {
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    gap: space.sm,
  },
  category: {
    width: 72,
    alignItems: 'center',
    gap: 6,
  },
  categoryTile: {
    width: 56,
    height: 56,
    borderRadius: r.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryEmoji: {
    fontSize: 24,
  },
  categoryLabel: {
    ...type.small,
    fontFamily: font.medium,
    color: color.text,
  },
  radiusRow: {
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    alignItems: 'center',
    gap: space.sm,
  },
  withinLabel: {
    ...type.caption,
    color: color.textSecondary,
    marginRight: 2,
  },
  railContent: {
    paddingHorizontal: space.xl,
    gap: space.md,
    paddingBottom: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: space.xl,
    gap: space.md,
  },
  gridCell: {
    width: '48%',
    flexGrow: 1,
  },
});
