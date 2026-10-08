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

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { SUGGESTED_QUERIES, emptyFilters } from '../../search/parser';
import {
  useDisplayName,
  RADIUS_OPTIONS,
  radiusLabel,
  useLocality,
  useOrigin,
  usePlace,
  useSession,
  useSessionHydrated,
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
import { Container, useLayout } from '../../ui/layout';
import { setLaunchRect, type LaunchRect } from '../../ui/launch';
import { VehicleCard } from '../../home/VehicleCard';
import { LocationAsk } from '../../home/LocationAsk';
import { Collections } from '../../home/Collections';
import { AskChips } from '../../home/AskChips';
import { OrderAgain } from '../../home/OrderAgain';
import { useLaunchDone } from '../../ui/LaunchSplash';
import { locateMe } from '../../lib/location';
import { openVoice } from '../../voice/VoiceHost';
import { choiceLabel, choiceTags } from '../../data/vehicles';
import type { TasteItem } from '../../data/api';
import { reach } from '../../lib/a11y';

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
/** Card width in the compact rail (New this week). */
const COMPACT_CARD_WIDTH = 200;

const SECTIONS = ['near_you', 'trending', 'ending_soon', 'new'] as const;
type Rails = Record<(typeof SECTIONS)[number], DealCardModel[]>;

interface HomeData {
  rails: Rails;
  nearbyCount: number;
  byVertical: Record<string, number>;
  unread: number;
  /** The deals closest to ending, soonest first, for the countdown tile. */
  ending: DealCardModel[];
  /** Deals at ₹200 or less, and a few of their categories to name. */
  under: { count: number; names: string };
  /** Deals near them ranked by what they like; empty until they have a history. */
  forYou: DealCardModel[];
  because: string | undefined;
  /** Deals for their vehicle within reach, when they have picked one. */
  vehicleCount: number | null;
}

/** "Because you like chicken and dinner": the strongest tag and category. */
function becauseLine(taste: TasteItem[]): string | undefined {
  const tag = taste.find((t) => t.kind === 'tag');
  const cat = taste.find((t) => t.kind === 'category');
  const names = [tag?.label, cat?.label.toLowerCase()].filter(
    (x, i, all): x is string => !!x && all.indexOf(x) === i,
  );
  return names.length ? 'Because you like ' + names.join(' and ') : undefined;
}

const UNDER = 200;

export default function HomeScreen() {
  const layout = useLayout();
  const headerHeight = useHeaderHeight();
  const tabSpace = useTabBarSpace();
  const focused = useIsFocused();
  const { onScroll } = useHideOnScroll();

  const locality = useLocality();
  const place = usePlace();
  const setLocality = useSession((s) => s.setLocality);
  const setGeo = useSession((s) => s.setGeo);
  const locationAsked = useSession((s) => s.locationAsked);
  const markLocationAsked = useSession((s) => s.markLocationAsked);
  const hydrated = useSessionHydrated();
  const launched = useLaunchDone();
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const radiusM = useSession((s) => s.radiusM);
  const setRadius = useSession((s) => s.setRadius);
  const displayName = useDisplayName();
  const viewer = useViewer();
  // Re-read when the signed-in person changes, demo accounts included.
  const account = viewer?.id ?? null;
  const mode = useSession((s) => s.mode);
  const vehicleId = useSession((s) => s.vehicleId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [greet] = useState(() => !greetedThisLaunch);

  const origin = useOrigin();

  /** Ask the device where we are; on success deals re-centre there. */
  const findMe = async (): Promise<boolean> => {
    setLocating(true);
    setLocationError(null);
    const found = await locateMe();
    setLocating(false);
    if (found.ok) {
      setGeo(found.point);
      return true;
    }
    setLocationError(found.message);
    return false;
  };

  // account is a dependency on purpose: switching demo accounts changes what
  // the feed may show, because age-restricted deals are hidden, not blocked.
  const fetchHome = useCallback(async (): Promise<HomeData> => {
    void account;
    void viewer;
    const vehicleTags = choiceTags(vehicleId);
    const [all, notifications, forYou, taste, vehicleDeals, ...lists] = await Promise.all([
      db.feedNearby({ origin, radius_m: radiusM, section: 'near_you', limit: 200 }),
      db.listNotifications(),
      db.feedForYou({ origin, radius_m: Math.max(radiusM, 5000), limit: 12 }).catch(() => []),
      db.getMyTaste().catch(() => []),
      vehicleTags.length
        ? db
            .searchDeals({
              q: '',
              filters: { ...emptyFilters(), vehicle_tags: vehicleTags, radius_km: 10 },
              origin,
              limit: 1,
            })
            .then((r) => r.total)
            .catch(() => null)
        : Promise.resolve(null),
      ...SECTIONS.map((section: FeedSection) =>
        // Trending runs to a top 20; the other rails stop at 12.
        db.feedNearby({ origin, radius_m: radiusM, section, limit: section === 'trending' ? 20 : 12 }),
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
    const soonest = [...everything].sort((a, b) => a.ends_at.localeCompare(b.ends_at));
    return {
      rails: { near_you, trending, ending_soon, new: fresh },
      nearbyCount: everything.length,
      byVertical,
      unread: notifications.filter((n) => n.read_at === null).length,
      // The flagged ones first, topped up with whatever ends next, so the tile
      // always has a few to swipe through and each shows its real countdown.
      ending: [...ending_soon, ...soonest.filter((d) => !ending_soon.some((e) => e.id === d.id))].slice(0, 5),
      under: {
        count: cheap.length,
        names: cheapNames.slice(0, 3).join(', ') + (cheapNames.length > 3 ? '…' : ''),
      },
      forYou: forYou as DealCardModel[],
      because: becauseLine(taste as TasteItem[]),
      vehicleCount: vehicleDeals as number | null,
    };
  }, [origin, radiusM, account, viewer, vehicleId]);

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
  // The deal page records the open, with which rail and where in it (lib/track.ts).
  const openDeal = useCallback((deal: DealCardModel, from = 'home', position?: number) => {
    router.push({
      pathname: '/deal/[id]',
      params: { id: deal.id, from, ...(position != null ? { pos: String(position) } : {}) },
    });
  }, []);
  const openSpotlight = useCallback((d: DealCardModel) => openDeal(d, 'home.spotlight'), [openDeal]);

  const openCategory = useCallback((c: Category, from: LaunchRect | null) => {
    setLaunchRect(from);
    router.push({ pathname: '/category/[vertical]', params: { vertical: c.vertical } });
  }, []);

  // The radius is read when tapped, not captured, so these never go stale.
  const openVehicle = useCallback(() => {
    const id = useSession.getState().vehicleId;
    if (id) router.push({ pathname: '/results', params: { vehicle: id, radius: '10000' } });
    else router.push('/vehicle');
  }, []);

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
              caption={
                (data?.nearbyCount === 1 ? 'deal' : 'deals') +
                ' live within ' + radiusLabel(radiusM) + ' of ' + place.of
              }
              options={RADIUS_OPTIONS}
              radiusM={radiusM}
              onRadius={setRadius}
            />

            <SearchPill onPress={() => router.push('/search')} />
            <AskChips signedIn={viewer !== null} />

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

            <View style={styles.vehicle}>
              <VehicleCard label={choiceLabel(vehicleId)} count={data?.vehicleCount ?? null} onPress={openVehicle} />
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
              surface="home.near_you"
              title="Deals near you"
              deals={rails?.near_you}
              loading={loading}
              onOpen={openDeal}
              onSeeAll={seeAllNear}
            />
            <OrderAgain />
            <Collections origin={origin} />
            <Rail
              surface="home.for_you"
              title="Picked for you"
              note={data?.because}
              deals={data?.forYou}
              loading={false}
              onOpen={openDeal}
            />
            <Rail surface="home.trending" title="Trending" ranked deals={rails?.trending} loading={loading} onOpen={openDeal} />
            <Rail
              surface="home.ending_soon"
              title="Ending soon"
              deals={rails?.ending_soon}
              loading={loading}
              onOpen={openDeal}
              onSeeAll={seeAllEnding}
            />
            <Rail surface="home.new" title="New this week" compact deals={rails?.new} loading={loading} onOpen={openDeal} />
          </>
        )}
      </Animated.ScrollView>

      <HomeHeader
        locality={place.name}
        city={place.detail}
        unread={data?.unread ?? 0}
        name={viewer?.full_name?.trim() ?? ''}
        avatarUrl={viewer?.avatar_url ?? null}
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
        onClose={() => {
          setPickerOpen(false);
          setLocationError(null);
        }}
        usingLocation={place.gps}
        onUseLocation={findMe}
        locating={locating}
        locationError={locationError}
      />

      <LocationAsk
        // Once, on the first visit to Home, after the saved session is read and the opening has played.
        visible={hydrated && launched && focused && !locationAsked && !pickerOpen}
        locating={locating}
        error={locationError}
        onUseLocation={() => void findMe()}
        onChooseArea={() => {
          markLocationAsked();
          setLocationError(null);
          setPickerOpen(true);
        }}
        onClose={markLocationAsked}
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
    <View>
    <Pressable onPress={onPress} {...handlers} accessibilityRole="search" accessibilityLabel="Search deals">
      <Animated.View style={[styles.search, styles.searchWithMic, liftStyle]}>
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
    <Pressable
      onPress={openVoice}
      accessibilityRole="button"
      accessibilityLabel="Search by voice"
      style={({ pressed }) => [styles.searchMic, pressed && { opacity: 0.8 }]}
    >
      <Icon name="mic" size={20} color={color.onCta} strokeWidth={2} />
    </Pressable>
    </View>
  );
}

const Rail = memo(RailSection);

/**
 * A section of deals: one row that scrolls sideways at every width, so a
 * ranked list like Trending can run to its full 20. On a phone it is a swipe;
 * on a wide screen, where sideways scrolling with a mouse is a chore, arrow
 * buttons page through it and grey out at either end.
 */
function RailSection({
  surface,
  title,
  deals,
  loading,
  onOpen,
  onSeeAll,
  ranked,
  compact,
  note,
}: {
  title: string;
  deals: DealCardModel[] | undefined;
  loading: boolean;
  onOpen: (d: DealCardModel, from: string, position: number) => void;
  /** Where these deals were seen, for activity: 'home.for_you'. */
  surface: string;
  onSeeAll?: () => void;
  ranked?: boolean;
  compact?: boolean;
  /** A line under the title: why these deals. */
  note?: string;
}) {
  const layout = useLayout();
  const scroller = useRef<ScrollView>(null);
  const [x, setX] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [viewWidth, setViewWidth] = useState(0);
  if (!loading && (!deals || deals.length === 0)) return null;

  const gap = space.md;
  const width = compact ? COMPACT_CARD_WIDTH : DEAL_CARD_LARGE_WIDTH;
  const list = deals ?? [];
  const maxX = Math.max(0, contentWidth - viewWidth);
  const page = (dir: 1 | -1) =>
    scroller.current?.scrollTo({ x: Math.min(maxX, Math.max(0, x + dir * viewWidth * 0.85)), animated: true });

  return (
    <View style={styles.section}>
      <Container>
        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleCol}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {title}
              {ranked && list.length > 3 ? <Text style={styles.sectionCount}>{'  Top ' + list.length}</Text> : null}
            </Text>
            {note ? (
              <Text style={styles.sectionNote} numberOfLines={1}>
                {note}
              </Text>
            ) : null}
          </View>
          {onSeeAll ? (
            <Pressable onPress={onSeeAll} accessibilityRole="button" hitSlop={8} style={[styles.seeAll, reach(8)]}>
              <Text style={styles.seeAllText}>See all</Text>
              <Icon name="chev" size={14} color={color.text} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
      </Container>

      <Container flush>
        <View onLayout={(e) => setViewWidth(e.nativeEvent.layout.width)}>
          <ScrollView
            ref={scroller}
            horizontal
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => setX(e.nativeEvent.contentOffset.x)}
            onContentSizeChange={(w) => setContentWidth(w)}
            scrollEventThrottle={32}
            contentContainerStyle={{ paddingHorizontal: layout.gutter, gap, paddingBottom: 6, paddingTop: 4 }}
          >
            {loading
              ? [0, 1, 2].map((k) => (
                  <View key={k} style={{ width }}>
                    <DealCardSkeleton variant={compact ? 'compact' : 'large'} />
                  </View>
                ))
              : list.map((d, i) => (
                  <View key={d.id} style={{ width }}>
                    <DealCard deal={d} variant={compact ? 'compact' : 'large'} style={{ width }} onPress={() => onOpen(d, surface, i)} />
                    {ranked ? (
                      <View style={styles.rank} pointerEvents="none">
                        <Text style={styles.rankText}>{i + 1}</Text>
                      </View>
                    ) : null}
                  </View>
                ))}
          </ScrollView>

          {!layout.isCompact && maxX > 0 ? (
            <>
              <RailArrow dir={-1} disabled={x <= 4} onPress={() => page(-1)} />
              <RailArrow dir={1} disabled={x >= maxX - 4} onPress={() => page(1)} />
            </>
          ) : null}
        </View>
      </Container>
    </View>
  );
}

function RailArrow({ dir, disabled, onPress }: { dir: 1 | -1; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={dir === 1 ? 'Show more' : 'Show previous'}
      aria-disabled={disabled}
      style={({ hovered }) => [
        styles.arrow,
        dir === 1 ? styles.arrowRight : styles.arrowLeft,
        disabled && styles.arrowOff,
        hovered && !disabled && styles.arrowHover,
      ]}
    >
      <Icon name={dir === 1 ? 'chev' : 'back'} size={20} color={color.text} strokeWidth={2} />
    </Pressable>
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
  // Room at the end for the mic, which sits over the pill as its own button.
  searchWithMic: {
    paddingRight: 56,
  },
  searchMic: {
    position: 'absolute',
    right: 8,
    top: space.md + 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.cta,
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
  sectionTitleCol: {
    flex: 1,
    minWidth: 0,
  },
  sectionNote: {
    ...type.caption,
    color: color.textSecondary,
  },
  vehicle: {
    marginTop: space.md,
  },
  sectionTitle: {
    fontFamily: font.display,
    fontSize: 23,
    lineHeight: 30,
    letterSpacing: -0.4,
    color: color.text,
  },
  sectionCount: {
    fontFamily: font.medium,
    fontSize: 14,
    color: color.textMuted,
    letterSpacing: 0,
  },
  arrow: {
    position: 'absolute',
    top: 72,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  arrowLeft: {
    left: 8,
  },
  arrowRight: {
    right: 8,
  },
  arrowHover: {
    backgroundColor: color.surfaceSoftAlt,
  },
  arrowOff: {
    opacity: 0,
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
