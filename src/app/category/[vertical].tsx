/**
 * A category page: Services, Food, Property and the rest.
 *
 * The hero lists the category's subheadings, built at runtime by
 * search/facets from the taxonomy and from what is live nearby: Salon, Makeup
 * and Home Cleaning under Services; cuisines under Food; 1 BHK, 2 BHK and
 * Villas under Property; Car, Bike and Scooty under Mobility. One choice per
 * row, and rows combine, so "Flats" plus "2 BHK" narrows to both.
 *
 * Price, rating, distance, timing and the rest live in the Filters sheet,
 * separate from the subheadings, and show as removable chips once applied.
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { db } from '../../data';
import type { DealCardModel, SearchFilters, Vertical } from '../../data/types';
import { useQuery } from '../../lib/useQuery';
import { subheadGroups, topCategory, type Subhead, type SubheadGroup } from '../../search/facets';
import { FilterSheet, SORT_OPTIONS } from '../../search/FilterSheet';
import { EMPTY_FILTERS, describeFilters, removeFilter } from '../../search/parser';
import { useLocality, useSession } from '../../state/session';
import { color, font, radius, size, space, theme, type } from '../../theme/tokens';
import {
  Button,
  Chip,
  DealCard,
  DealCardSkeleton,
  EmptyState,
  Icon,
  categoryIcon,
  useHoverPress,
} from '../../components';
import { Container, cellWidth, useLayout } from '../../ui/layout';
import { pressedProps } from '../../lib/a11y';

const VERTICALS: Vertical[] = ['food', 'retail', 'events', 'mobility', 'property', 'services', 'business', 'community'];

/** Refinements the Filters sheet owns. The category and subheadings are set elsewhere. */
function baseFilters(radiusM: number): SearchFilters {
  return {
    ...EMPTY_FILTERS,
    keywords: [],
    day_of_week: [],
    deal_types: [],
    attributes: {},
    radius_km: radiusM / 1000,
  };
}

/** Chips for applied refinements; distance and sort have their own controls. */
const NOT_A_CHIP = new Set(['radius_km', 'sort', 'vertical', 'category_slug', 'attributes']);

export default function CategoryScreen() {
  const { vertical: raw } = useLocalSearchParams<{ vertical: string }>();
  const vertical = (VERTICALS as string[]).includes(raw) ? (raw as Vertical) : null;

  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const locality = useLocality();
  const radiusM = useSession((s) => s.radiusM);
  const origin = locality.centroid;

  const [refine, setRefine] = useState<SearchFilters>(() => baseFilters(radiusM));
  /** The chosen subheading in each row, keyed by row. */
  const [picked, setPicked] = useState<Record<string, Subhead | null>>({});
  const [sheetOpen, setSheetOpen] = useState(false);

  // Everything live in this category nearby: the source of the subheadings and their counts.
  const fetchCategory = useCallback(async () => {
    if (!vertical) return null;
    const [categories, all] = await Promise.all([
      db.getCategories(),
      db.searchDeals({
        q: '',
        filters: { ...baseFilters(radiusM), radius_km: refine.radius_km, vertical },
        origin,
        limit: 300,
      }),
    ]);
    return { categories, all: all.deals };
  }, [vertical, origin, radiusM, refine.radius_km]);
  const { data } = useQuery(fetchCategory);

  const top = data && vertical ? topCategory(data.categories, vertical) : undefined;
  const groups = useMemo<SubheadGroup[]>(
    () => (data && vertical ? subheadGroups(data.categories, vertical, data.all) : []),
    [data, vertical],
  );

  const filters = useMemo<SearchFilters>(() => {
    const chosen = Object.values(picked).filter((s): s is Subhead => s !== null);
    return {
      ...refine,
      vertical,
      category_slug: chosen.find((s) => s.patch.category_slug)?.patch.category_slug ?? null,
      attributes: Object.assign({}, ...chosen.map((s) => s.patch.attributes ?? {})),
    };
  }, [refine, picked, vertical]);

  const fetchList = useCallback(
    () => db.searchDeals({ q: '', filters, origin, limit: 120 }),
    [filters, origin],
  );
  const list = useQuery(fetchList);
  const deals = list.data?.deals;

  const choose = (group: string, s: Subhead | null) =>
    setPicked((p) => ({ ...p, [group]: p[group]?.id === s?.id ? null : s }));

  const chips = describeFilters(refine).filter((c) => !NOT_A_CHIP.has(c.key));
  const activeRefinements = chips.length;
  const columns = layout.gridColumns;
  const gap = space.md;
  const cell = cellWidth(layout.contentWidth, columns, gap);
  const radiusKm = refine.radius_km ?? 5;
  const chosenLabels = Object.values(picked).filter((s): s is Subhead => s !== null).map((s) => s.label);

  const openDeal = (d: DealCardModel) => {
    void db.recordEvents([{ deal_id: d.id, event_type: 'view', source: 'category' }]);
    router.push({ pathname: '/deal/[id]', params: { id: d.id } });
  };

  const back = () => (router.canGoBack() ? router.back() : router.dismissTo('/'));

  if (!vertical) {
    return (
      <View style={styles.screen}>
        <EmptyState
          icon="x"
          tone="alert"
          title="Category not found"
          action={<Button onPress={() => router.dismissTo('/')}>Go home</Button>}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {focused ? <StatusBar style={theme.hero.light ? 'dark' : 'light'} /> : null}
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}>
        {/* ---------- Hero with subheadings ---------- */}
        <View style={[styles.hero, { paddingTop: insets.top + space.sm }]}>
          <LinearGradient colors={theme.hero.colors} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <Container>
            <View style={styles.heroTop}>
              <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Go back" style={styles.back}>
                <Icon name="back" size={22} color={theme.hero.text} />
              </Pressable>
              <Pressable
                onPress={() => router.push('/search')}
                accessibilityRole="button"
                accessibilityLabel="Search"
                style={styles.back}
              >
                <Icon name="search" size={20} color={theme.hero.text} />
              </Pressable>
            </View>

            <View style={styles.titleRow}>
              <Icon name={categoryIcon(top?.icon ?? '')} size={34} color={theme.onSelected ?? theme.hero.text} strokeWidth={1.6} />
              <View style={styles.flex}>
                <Text style={styles.title} accessibilityRole="header">
                  {top?.name ?? ' '}
                </Text>
                <Text style={styles.subtitle}>
                  {data
                    ? data.all.length + ' deals within ' + (radiusKm < 1 ? radiusKm * 1000 + ' m' : radiusKm + ' km') + ' of ' + locality.name
                    : 'Loading'}
                </Text>
              </View>
            </View>
          </Container>

          {groups.map((g) => (
            <View key={g.key} style={styles.group}>
              <Container>
                <Text style={styles.groupTitle}>{g.title}</Text>
              </Container>
              <SubheadRow
                group={g}
                selectedId={picked[g.key]?.id ?? null}
                wrap={!layout.isCompact}
                gutter={layout.gutter}
                onChoose={(s) => choose(g.key, s)}
              />
            </View>
          ))}
          <View style={{ height: space.xl }} />
        </View>

        {/* ---------- Refinements ---------- */}
        <Container flush style={styles.toolbar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.toolbarRow, { paddingHorizontal: layout.gutter }]}
          >
            <Pressable
              onPress={() => setSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={activeRefinements ? 'Filters, ' + activeRefinements + ' applied' : 'Filters'}
              style={[styles.filterButton, activeRefinements > 0 && styles.filterButtonOn]}
            >
              <Icon name="filter" size={16} color={activeRefinements ? color.white : color.text} />
              <Text style={[styles.filterLabel, activeRefinements > 0 && { color: color.white }]}>
                Filters{activeRefinements ? ' · ' + activeRefinements : ''}
              </Text>
            </Pressable>
            {SORT_OPTIONS.map((o) => (
              <Chip key={o.key} selected={refine.sort === o.key} onPress={() => setRefine((f) => ({ ...f, sort: o.key }))}>
                {o.label}
              </Chip>
            ))}
          </ScrollView>
        </Container>
        <Container>
          {chips.length > 0 ? (
            <View style={styles.applied}>
              {chips.map((c, i) => (
                <Pressable
                  key={c.key + i}
                  onPress={() => setRefine((f) => removeFilter(f, c.key as keyof SearchFilters))}
                  accessibilityRole="button"
                  accessibilityLabel={'Remove ' + c.label}
                  style={styles.appliedChip}
                >
                  <Text style={styles.appliedText}>{c.label}</Text>
                  <Icon name="x" size={12} color={color.text} strokeWidth={2} />
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={styles.count}>
            {deals ? deals.length + (deals.length === 1 ? ' deal' : ' deals') : ' '}
            {chosenLabels.length ? ' · ' + chosenLabels.join(' · ') : ''}
          </Text>
        </Container>

        {/* ---------- Results ---------- */}
        <Container>
          {deals && deals.length === 0 ? (
            <EmptyState
              icon="search"
              title={chosenLabels.length ? 'No ' + chosenLabels.join(', ') + ' deals nearby' : 'Nothing here yet'}
              body={
                activeRefinements || chosenLabels.length
                  ? 'Try another subheading or clear a filter.'
                  : 'Nothing in this category within ' + radiusKm + ' km. Try a wider area.'
              }
              action={
                activeRefinements || chosenLabels.length ? (
                  <Button
                    onPress={() => {
                      setPicked({});
                      setRefine((f) => ({ ...baseFilters(radiusM), radius_km: f.radius_km, sort: f.sort }));
                    }}
                  >
                    Clear all
                  </Button>
                ) : radiusKm < 10 ? (
                  <Button onPress={() => setRefine((f) => ({ ...f, radius_km: 10 }))}>Search within 10 km</Button>
                ) : undefined
              }
            />
          ) : (
            <View style={[styles.grid, { gap }]}>
              {!deals
                ? Array.from({ length: columns * 2 }, (_, k) => (
                    <View key={k} style={{ width: cell }}>
                      <DealCardSkeleton variant="compact" />
                    </View>
                  ))
                : deals.map((d) => (
                    <View key={d.id} style={{ width: cell }}>
                      <DealCard deal={d} variant="compact" style={{ width: cell }} onPress={() => openDeal(d)} />
                    </View>
                  ))}
            </View>
          )}
        </Container>
      </ScrollView>

      <FilterSheet
        visible={sheetOpen}
        filters={refine}
        hideCategory
        onClose={() => setSheetOpen(false)}
        onApply={(next) => {
          // The sheet may echo a vertical or subheading back; this page owns those.
          setRefine({ ...next, vertical: null, category_slug: null, attributes: {} });
          setSheetOpen(false);
        }}
      />
    </View>
  );
}

function SubheadRow({
  group,
  selectedId,
  wrap,
  gutter,
  onChoose,
}: {
  group: SubheadGroup;
  selectedId: string | null;
  wrap: boolean;
  gutter: number;
  onChoose: (s: Subhead | null) => void;
}) {
  const pills = (
    <>
      <Pill label="All" selected={selectedId === null} onPress={() => onChoose(null)} />
      {group.items.map((s) => (
        <Pill
          key={s.id}
          label={s.label}
          count={s.count}
          selected={selectedId === s.id}
          onPress={() => onChoose(s)}
        />
      ))}
    </>
  );
  if (wrap) {
    return (
      <Container>
        <View style={styles.pillWrap}>{pills}</View>
      </Container>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.pillRow, { paddingHorizontal: gutter }]}
    >
      {pills}
    </ScrollView>
  );
}

function Pill({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onPress: () => void;
}) {
  const { handlers, liftStyle } = useHoverPress({ lift: 2, pressScale: 0.95 });
  const quiet = count === 0 && !selected;
  return (
    <Pressable
      onPress={onPress}
      {...handlers}
      accessibilityRole="button"
      {...pressedProps(selected)}
      accessibilityLabel={label + (count != null ? ', ' + count + ' deals' : '')}
    >
      <Animated.View style={[styles.pill, selected && styles.pillOn, quiet && styles.pillQuiet, liftStyle]}>
        <Text style={[styles.pillText, selected && styles.pillTextOn]} numberOfLines={1}>
          {label}
        </Text>
        {count != null && count > 0 ? (
          <View style={[styles.pillCount, selected && styles.pillCountOn]}>
            <Text style={[styles.pillCountText, selected && styles.pillCountTextOn]}>{count}</Text>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
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
  hero: {
    overflow: 'hidden',
    borderBottomLeftRadius: theme.hero.light ? 0 : 28,
    borderBottomRightRadius: theme.hero.light ? 0 : 28,
    borderBottomWidth: theme.hero.light ? StyleSheet.hairlineWidth : 0,
    borderBottomColor: color.border,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    height: size.header,
    alignItems: 'center',
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.heroChip.track,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.sm,
  },
  title: {
    ...type.display,
    fontSize: 32,
    color: theme.hero.text,
  },
  subtitle: {
    ...type.caption,
    color: theme.hero.muted,
  },
  group: {
    marginTop: space.xl,
  },
  groupTitle: {
    ...type.overline,
    color: theme.hero.muted,
    marginBottom: space.sm,
  },
  pillRow: {
    gap: space.sm,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  pill: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: theme.heroChip.track,
    borderWidth: 1,
    borderColor: theme.heroChip.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pillOn: {
    backgroundColor: theme.heroChip.thumb,
    borderColor: theme.heroChip.thumb,
  },
  pillQuiet: {
    opacity: 0.55,
  },
  pillText: {
    fontFamily: font.medium,
    fontSize: 14,
    color: theme.heroChip.text,
  },
  pillTextOn: {
    color: theme.heroChip.onThumb,
  },
  pillCount: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: theme.heroChip.track,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillCountOn: {
    backgroundColor: 'rgba(127,127,127,0.18)',
  },
  pillCountText: {
    fontFamily: font.semibold,
    fontSize: 11,
    color: theme.heroChip.text,
    fontVariant: ['tabular-nums'],
  },
  pillCountTextOn: {
    color: theme.heroChip.onThumb,
  },
  toolbar: {
    marginTop: space.lg,
  },
  toolbarRow: {
    gap: space.sm,
    alignItems: 'center',
  },
  filterButton: {
    height: size.chip,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterButtonOn: {
    backgroundColor: color.brand,
    borderColor: color.brand,
  },
  filterLabel: {
    ...type.captionMedium,
    fontFamily: font.semibold,
    color: color.text,
  },
  applied: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.md,
  },
  appliedChip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceSoftAlt,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  appliedText: {
    ...type.captionMedium,
    color: color.text,
  },
  count: {
    ...type.caption,
    color: color.textSecondary,
    marginTop: space.md,
    marginBottom: space.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
