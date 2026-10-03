/**
 * Home.
 *
 * The top of the page carries everything needed in the first second: where they
 * are, how many deals are live there, a search box, and every category, all
 * without scrolling. The hero takes the theme's colour family (see
 * theme/tokens), and the deal photos below carry the rest.
 *
 * "Good evening, Aarav" greets once per app launch and folds away after a
 * couple of seconds, leaving the deal count highlighted beside the address.
 * The header and the tab bar get out of the way while scrolling down and come
 * back on the way up.
 *
 * Every rail is a real feed_nearby() call, so what renders is the same ranked,
 * radius-filtered, age-gated result the database returns. On a phone the rails
 * scroll sideways; on a wide screen they become grids, so the website needs no
 * separate build.
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, useIsFocused } from 'expo-router';
import Animated, {
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { LOCALITIES, TOP_CATEGORIES } from '../../data/seed-reference';
import { db } from '../../data';
import type { Category, DealCardModel, FeedSection } from '../../data/types';
import { useQuery } from '../../lib/useQuery';
import { SUGGESTED_QUERIES } from '../../search/parser';
import {
  useDisplayName,
  RADIUS_OPTIONS,
  radiusLabel,
  useLocality,
  useSession,
  useViewer,
} from '../../state/session';
import { color, font, radius, space, theme, type } from '../../theme/tokens';
import {
  Chip,
  DealCard,
  DealCardSkeleton,
  DEAL_CARD_LARGE_WIDTH,
  Icon,
  LocalityPicker,
  useHoverPress,
} from '../../components';
import { CategoryGrid } from '../../home/CategoryGrid';
import { HomeHeader, useHeaderHeight } from '../../home/HomeHeader';
import { BentoTiles } from '../../home/BentoTiles';
import { CountCard } from '../../home/CountCard';
import { useHideOnScroll } from '../../ui/chrome';
import { useTabBarSpace } from '../../ui/FloatingTabBar';
import { Container, cellWidth, useLayout } from '../../ui/layout';

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Hold the greeting this long, then fold it over FOLD_MS. */
const GREET_HOLD_MS = 2200;
const GREET_FOLD_MS = 700;

/** Once per launch: coming back to Home should not replay the welcome. */
let greetedThisLaunch = false;

/** Once per launch: a merchant who left the app in merchant mode reopens there. */
let resumedThisLaunch = false;

const NO_COUNTS: Record<string, number> = {};

const SECTIONS = ['near_you', 'trending', 'ending_soon', 'new'] as const;
type Rails = Record<(typeof SECTIONS)[number], DealCardModel[]>;

interface HomeData {
  rails: Rails;
  nearbyCount: number;
  byVertical: Record<string, number>;
  unread: number;
  /** The deal closest to ending, for the countdown tile. */
  ending: DealCardModel | null;
  /** Deals at ₹200 or less, and a few of their categories to name. */
  under: { count: number; names: string };
}

const UNDER = 200;

export default function HomeScreen() {
  const layout = useLayout();
  const headerHeight = useHeaderHeight();
  const tabSpace = useTabBarSpace();
  const focused = useIsFocused();
  const { onScroll } = useHideOnScroll();

  const locality = useLocality();
  const setLocality = useSession((s) => s.setLocality);
  const radiusM = useSession((s) => s.radiusM);
  const setRadius = useSession((s) => s.setRadius);
  const account = useSession((s) => s.account);
  const displayName = useDisplayName();
  const viewer = useViewer();
  const mode = useSession((s) => s.mode);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [greet] = useState(() => !greetedThisLaunch);

  const origin = locality.centroid;

  // account is a dependency on purpose: switching demo accounts changes what
  // the feed may show, because age-restricted deals are hidden, not blocked.
  const fetchHome = useCallback(async (): Promise<HomeData> => {
    void account;
    const [all, notifications, ...lists] = await Promise.all([
      db.feedNearby({ origin, radius_m: radiusM, section: 'near_you', limit: 200 }),
      db.listNotifications(),
      ...SECTIONS.map((section: FeedSection) =>
        db.feedNearby({ origin, radius_m: radiusM, section, limit: 12 }),
      ),
    ]);
    const [near_you, trending, ending_soon, fresh] = lists as DealCardModel[][];
    const everything = all as DealCardModel[];
    const byVertical: Record<string, number> = {};
    for (const d of everything) {
      byVertical[d.category.vertical] = (byVertical[d.category.vertical] ?? 0) + 1;
    }
    const cheap = everything.filter((d) => d.deal_price != null && d.deal_price <= UNDER);
    const cheapNames = [...new Set(cheap.map((d) => d.category.name))];
    const soonest = [...everything].sort((a, b) => a.ends_at.localeCompare(b.ends_at))[0] ?? null;
    return {
      rails: { near_you, trending, ending_soon, new: fresh },
      nearbyCount: everything.length,
      byVertical,
      unread: notifications.filter((n) => n.read_at === null).length,
      ending: ending_soon[0] ?? soonest,
      under: {
        count: cheap.length,
        names: cheapNames.slice(0, 3).join(', ') + (cheapNames.length > 3 ? '…' : ''),
      },
    };
  }, [origin, radiusM, account]);

  const { data, loading } = useQuery(fetchHome);

  // Wait for the saved session (mode) and the viewer (sign-in) before deciding,
  // and only when Home itself is on screen, not under a deep-linked deal.
  useEffect(() => {
    if (resumedThisLaunch || !focused || !viewer || !useSession.persist.hasHydrated()) return;
    resumedThisLaunch = true;
    if (mode === 'merchant' && viewer.business_ids.length > 0) router.push('/merchant');
  }, [focused, viewer, mode]);
  const rails = data?.rails;
  const spotlight = useMemo(() => rails?.near_you.slice(0, 5) ?? [], [rails]);

  // Stable callbacks: the rails, spotlight and grid are memoised, and a new
  // function every render would make every one of them re-render on a tap.
  const openDeal = useCallback((deal: DealCardModel, source = 'home') => {
    void db.recordEvents([{ deal_id: deal.id, event_type: 'view', source }]);
    router.push({ pathname: '/deal/[id]', params: { id: deal.id } });
  }, []);
  const openSpotlight = useCallback((d: DealCardModel) => openDeal(d, 'spotlight'), [openDeal]);

  const openCategory = useCallback(
    (c: Category) => router.push({ pathname: '/category/[vertical]', params: { vertical: c.vertical } }),
    [],
  );

  // The radius is read when tapped, not captured, so these never go stale.
  const seeAllNear = useCallback(
    () => router.push({ pathname: '/results', params: { radius: String(useSession.getState().radiusM) } }),
    [],
  );
  const openUnder = useCallback(
    () =>
      router.push({
        pathname: '/results',
        params: { q: 'under ' + UNDER, radius: String(useSession.getState().radiusM) },
      }),
    [],
  );
  const seeAllEnding = useCallback(
    () =>
      router.push({
        pathname: '/results',
        params: { sort: 'ending_soon', radius: String(useSession.getState().radiusM) },
      }),
    [],
  );

  const empty = !loading && data !== undefined && data.nearbyCount === 0;
  const categoryColumns = layout.isCompact ? 4 : 8;

  return (
    <View style={styles.screen}>
      {focused ? <StatusBar style="dark" /> : null}

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabSpace + space.lg }}
      >
        {/* ---------- Top: count, search, live tiles, categories ---------- */}
        <View style={[styles.top, { paddingTop: headerHeight + space.sm }]}>
          <Container>
            {greet ? <Greeting name={displayName} subtitle="Here is what is live near you." /> : null}

            <CountCard
              count={data ? data.nearbyCount : null}
              caption={'deals live within ' + radiusLabel(radiusM) + ' of ' + locality.name}
              options={RADIUS_OPTIONS}
              radiusM={radiusM}
              onRadius={setRadius}
            />

            <SearchPill onPress={() => router.push('/search')} />

            <View style={styles.bento}>
              {data ? (
                <BentoTiles
                  spotlight={spotlight}
                  ending={data.ending}
                  under={data.under}
                  onOpen={openSpotlight}
                  onUnder={openUnder}
                />
              ) : (
                <View style={styles.bentoSkeleton} />
              )}
            </View>

            <View style={styles.categories}>
              <CategoryGrid
                categories={TOP_CATEGORIES}
                counts={data?.byVertical ?? NO_COUNTS}
                width={layout.contentWidth}
                columns={categoryColumns}
                onPress={openCategory}
              />
            </View>
          </Container>
        </View>

        {empty ? (
          <Container>
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Nothing live within {radiusLabel(radiusM)}</Text>
              <Text style={styles.emptyBody}>Widen the radius or pick another locality.</Text>
              {radiusM < 10000 ? <Chip onPress={() => setRadius(10000)}>Show 10km</Chip> : null}
            </View>
          </Container>
        ) : (
          <>
            <Rail
              title="Deals near you"
              deals={rails?.near_you}
              loading={loading}
              onOpen={openDeal}
              onSeeAll={seeAllNear}
            />
            <Rail title="Trending" ranked deals={rails?.trending} loading={loading} onOpen={openDeal} />
            <Rail
              title="Ending soon"
              deals={rails?.ending_soon}
              loading={loading}
              onOpen={openDeal}
              onSeeAll={seeAllEnding}
            />
            <Rail title="New this week" compact deals={rails?.new} loading={loading} onOpen={openDeal} />
          </>
        )}
      </Animated.ScrollView>

      <HomeHeader
        locality={locality.name}
        city={locality.city}
        unread={data?.unread ?? 0}
        initial={displayName.charAt(0)}
        gutter={layout.gutter}
        onLocality={() => setPickerOpen(true)}
        onBell={() => router.push('/notifications')}
        onProfile={() => router.push('/profile')}
      />

      <LocalityPicker
        visible={pickerOpen}
        localities={LOCALITIES}
        selectedId={locality.id}
        onSelect={setLocality}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

/** The welcome line. Holds, then folds its height to zero so the page closes up under it. */
function Greeting({ name, subtitle }: { name: string; subtitle: string }) {
  const open = useSharedValue(1);
  const measured = useSharedValue(0);

  useEffect(() => {
    open.set(withDelay(GREET_HOLD_MS, withTiming(0, { duration: GREET_FOLD_MS })));
    const t = setTimeout(() => {
      greetedThisLaunch = true;
    }, GREET_HOLD_MS);
    return () => clearTimeout(t);
  }, [open]);

  const fold = useAnimatedStyle(() => ({
    opacity: open.get(),
    height: measured.get() > 0 ? measured.get() * open.get() : undefined,
    transform: [{ translateY: (1 - open.get()) * -12 }],
  }));

  return (
    <Animated.View style={[styles.greetWrap, fold]}>
      <View
        onLayout={(e) => {
          if (measured.get() === 0) measured.set(e.nativeEvent.layout.height);
        }}
      >
        <Text style={styles.greeting} accessibilityRole="header">
          {greeting()}, {name}.
        </Text>
        <Text style={styles.greetingSub}>{subtitle}</Text>
      </View>
    </Animated.View>
  );
}

/** The search field; the hint cycles through real example queries. */
function SearchPill({ onPress }: { onPress: () => void }) {
  const [hint, setHint] = useState(0);
  const { handlers, liftStyle } = useHoverPress({ lift: 2, pressScale: 0.99 });

  useEffect(() => {
    const id = setInterval(() => setHint((h) => (h + 1) % SUGGESTED_QUERIES.length), 3200);
    return () => clearInterval(id);
  }, []);

  return (
    <Pressable onPress={onPress} {...handlers} accessibilityRole="search" accessibilityLabel="Search deals">
      <Animated.View style={[styles.search, liftStyle]}>
        <Icon name="search" size={20} color={theme.heroSearch.icon} strokeWidth={2} />
        <View style={styles.searchText}>
          <Text style={styles.searchLabel}>Search deals, dishes, places</Text>
          <View style={styles.hintClip}>
            <Animated.Text
              key={hint}
              entering={FadeInDown.duration(260)}
              exiting={FadeOutUp.duration(200)}
              style={styles.searchHint}
              numberOfLines={1}
            >
              Try “{SUGGESTED_QUERIES[hint]}”
            </Animated.Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/**
 * A section of deals. Sideways-scrolling cards on a phone; a grid of up to two
 * rows on wider screens, where sideways scrolling with a mouse is a chore.
 */
const Rail = memo(RailSection);

function RailSection({
  title,
  deals,
  loading,
  onOpen,
  onSeeAll,
  ranked,
  compact,
}: {
  title: string;
  deals: DealCardModel[] | undefined;
  loading: boolean;
  onOpen: (d: DealCardModel) => void;
  onSeeAll?: () => void;
  ranked?: boolean;
  compact?: boolean;
}) {
  const layout = useLayout();
  if (!loading && (!deals || deals.length === 0)) return null;

  const gap = space.md;
  const asGrid = compact || !layout.isCompact;
  const columns = layout.gridColumns;
  const cell = cellWidth(layout.contentWidth, columns, gap);
  const shown = asGrid ? (deals ?? []).slice(0, columns * (compact ? 1 : 2)) : (deals ?? []);

  const card = (d: DealCardModel, i: number, width: number) => (
    <View key={d.id} style={{ width }}>
      <DealCard deal={d} variant={compact ? 'compact' : 'large'} style={{ width }} onPress={() => onOpen(d)} />
      {ranked ? (
        <View style={styles.rank} pointerEvents="none">
          <Text style={styles.rankText}>{i + 1}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.section}>
      <Container>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {title}
          </Text>
          {onSeeAll ? (
            <Pressable onPress={onSeeAll} accessibilityRole="button" hitSlop={8} style={styles.seeAll}>
              <Text style={styles.seeAllText}>See all</Text>
              <Icon name="chev" size={14} color={color.text} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
      </Container>

      {asGrid ? (
        <Container>
          <View style={[styles.grid, { gap }]}>
            {loading
              ? Array.from({ length: columns }, (_, k) => (
                  <View key={k} style={{ width: cell }}>
                    <DealCardSkeleton variant="compact" />
                  </View>
                ))
              : shown.map((d, i) => card(d, i, cell))}
          </View>
        </Container>
      ) : (
        <Container flush>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: layout.gutter, gap, paddingBottom: 6, paddingTop: 4 }}
          >
            {loading
              ? [0, 1].map((k) => (
                  <View key={k} style={{ width: DEAL_CARD_LARGE_WIDTH }}>
                    <DealCardSkeleton variant="large" />
                  </View>
                ))
              : shown.map((d, i) => card(d, i, DEAL_CARD_LARGE_WIDTH))}
          </ScrollView>
        </Container>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.background,
  },
  top: {
    paddingBottom: space.sm,
  },
  bento: {
    marginTop: space.md,
  },
  bentoSkeleton: {
    height: 234,
    borderRadius: radius.xxl,
    backgroundColor: color.surfaceSoftAlt,
  },
  greetWrap: {
    overflow: 'hidden',
  },
  greeting: {
    ...type.display,
    fontSize: 30,
    lineHeight: 36,
    color: color.text,
    paddingTop: space.xs,
  },
  greetingSub: {
    ...type.body,
    color: color.textSecondary,
    marginTop: 2,
    marginBottom: space.lg,
  },
  search: {
    marginTop: space.md,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.heroSearch.bg,
    borderWidth: 1,
    borderColor: theme.heroSearch.border,
    shadowColor: '#000',
    shadowOpacity: theme.hero.light ? 0.05 : 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg + 2,
  },
  searchText: {
    flex: 1,
    minWidth: 0,
  },
  searchLabel: {
    ...type.bodySemibold,
    color: theme.heroSearch.text,
  },
  hintClip: {
    height: 16,
    overflow: 'hidden',
  },
  searchHint: {
    ...type.small,
    color: theme.heroSearch.hint,
  },
  categories: {
    marginTop: space.md,
  },
  section: {
    marginTop: space.xxl,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  sectionTitle: {
    fontFamily: font.display,
    fontSize: 23,
    lineHeight: 30,
    letterSpacing: -0.4,
    color: color.text,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 32,
  },
  seeAllText: {
    ...type.captionMedium,
    color: color.text,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  rank: {
    position: 'absolute',
    top: 144,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.brand,
    borderWidth: 3,
    borderColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontFamily: font.bold,
    fontSize: 17,
    color: color.white,
  },
  emptyBox: {
    marginTop: space.xxl,
    padding: space.xl,
    borderRadius: radius.xl,
    backgroundColor: color.surfaceSoftAlt,
    alignItems: 'center',
    gap: space.sm,
  },
  emptyTitle: {
    ...type.h3,
    color: color.text,
    textAlign: 'center',
  },
  emptyBody: {
    ...type.body,
    color: color.textSecondary,
    textAlign: 'center',
    marginBottom: space.sm,
  },
});
