/**
 * Search results.
 *
 * Entered four ways: a typed query (?q=), a category tile (?vertical=), a
 * "See all" on Home (?sort=, ?radius=) or My vehicle (?vehicle=). All become
 * one SearchFilters value and one search_deals call, so they rank and filter
 * identically.
 *
 * When nothing matches, the search loosens itself a step at a time (see
 * search/relax) and says what it changed, instead of showing an empty page.
 *
 * The applied filters render as removable chips. Removing one clears exactly
 * that field and re-queries, which is how someone recovers from a parse they
 * did not mean without retyping.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../data';
import { CATEGORIES } from '../data/seed-reference';
import type { DealCardModel, SearchFilters, SortKey, Vertical } from '../data/types';
import { describeFilters, EMPTY_FILTERS, emptyFilters, parseQuery, removeFilter } from '../search/parser';
import { relaxations } from '../search/relax';
import { choiceLabel, choiceTags } from '../data/vehicles';
import { FilterSheet, SORT_OPTIONS } from '../search/FilterSheet';
import { useLocality, useSession } from '../state/session';
import { cellWidth, useLayout } from '../ui/layout';
import { color, font, radius, size, space, type } from '../theme/tokens';
import {
  Button,
  DealCard,
  DealCardSkeleton,
  EmptyState,
  Icon,
} from '../components';
import { reach } from '../lib/a11y';

const PAGE = 20;

const VERTICALS: Vertical[] = [
  'food', 'retail', 'events', 'mobility', 'property', 'services', 'business', 'community',
];
const SORTS: SortKey[] = SORT_OPTIONS.map((o) => o.key);

function initialFilters(
  p: { q?: string; vertical?: string; sort?: string; radius?: string; vehicle?: string },
  fallbackRadiusM: number,
): SearchFilters {
  const base: SearchFilters = p.q ? parseQuery(p.q).filters : emptyFilters();
  if (p.vehicle) base.vehicle_tags = choiceTags(p.vehicle);
  if (p.vertical && (VERTICALS as string[]).includes(p.vertical)) {
    base.vertical = p.vertical as Vertical;
  }
  if (p.sort && (SORTS as string[]).includes(p.sort)) base.sort = p.sort as SortKey;
  // A distance in the query wins; otherwise use the radius the person was browsing at.
  if (base.radius_km == null) {
    const m = Number(p.radius ?? fallbackRadiusM);
    base.radius_km = Number.isFinite(m) && m > 0 ? m / 1000 : 5;
  }
  return base;
}

function titleFor(q: string | undefined, f: SearchFilters, vehicle: string | undefined): string {
  if (q) return '“' + q + '”';
  const mine = choiceLabel(vehicle ?? null);
  if (mine && f.vehicle_tags.length > 0) return 'For ' + (mine.startsWith('your ') ? mine : 'your ' + mine);
  if (f.category_slug) return CATEGORIES.find((c) => c.slug === f.category_slug)?.name ?? 'Deals';
  if (f.vertical) return CATEGORIES.find((c) => c.slug === f.vertical)?.name ?? 'Deals';
  if (f.sort === 'ending_soon') return 'Ending soon';
  return 'Deals near you';
}

interface Loaded {
  /** The fetcher this page came from; a stale one means the query changed. */
  source: (offset: number) => Promise<unknown>;
  deals: DealCardModel[];
  total: number;
  error: string | null;
}

/** The loosened search that found something, and what was loosened. */
interface Relaxed {
  from: SearchFilters;
  to: SearchFilters;
  note: string;
}

function activeCount(f: SearchFilters): number {
  return describeFilters(f).filter((c) => c.key !== 'radius_km').length;
}

export default function ResultsScreen() {
  const params = useLocalSearchParams<{
    q?: string;
    vertical?: string;
    sort?: string;
    radius?: string;
    vehicle?: string;
  }>();
  const sessionRadius = useSession((s) => s.radiusM);
  const layout = useLayout();
  const cell = cellWidth(layout.contentWidth, layout.listColumns, space.md);
  const locality = useLocality();
  const origin = locality.centroid;

  // Read once: the screen owns its filters after it opens.
  const [filters, setFilters] = useState<SearchFilters>(() =>
    initialFilters(params, sessionRadius),
  );
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [relaxed, setRelaxed] = useState<Relaxed | null>(null);
  /** Filters the person chose to keep exact with Undo; never loosened again. */
  const [declined, setDeclined] = useState<SearchFilters | null>(null);
  // The note belongs to the loosened search; any other change hides it.
  const relaxNote = relaxed && relaxed.to === filters ? relaxed.note : null;

  const q = params.q ?? '';
  const fetchPage = useCallback(
    (offset: number) => db.searchDeals({ q, filters, origin, limit: PAGE, offset }),
    [q, filters, origin],
  );

  // Results belong to the query that produced them. When the query changes the
  // old page stops matching, so the list falls back to skeletons by itself.
  const current = loaded?.source === fetchPage ? loaded : null;
  const deals = current && !current.error ? current.deals : null;
  const total = current?.total ?? 0;
  const error = current?.error ?? null;

  useEffect(() => {
    let active = true;
    fetchPage(0)
      .then(async (r) => {
        if (!active) return;
        // Nothing matched what was asked, and this is not already a loosened
        // search: try the looser versions, and show the first that finds deals.
        if (r.total === 0 && relaxed?.to !== filters && declined !== filters) {
          for (const step of relaxations(filters)) {
            const found = await db.searchDeals({ q, filters: step.filters, origin, limit: 1 });
            if (!active) return;
            if (found.total > 0) {
              setRelaxed({ from: filters, to: step.filters, note: step.note });
              setFilters(step.filters);
              return;
            }
          }
        }
        setLoaded({ source: fetchPage, deals: r.deals, total: r.total, error: null });
      })
      .catch(() => {
        if (active) {
          setLoaded({
            source: fetchPage,
            deals: [],
            total: 0,
            error: 'Could not load deals. Check your connection.',
          });
        }
      });
    return () => {
      active = false;
    };
    // relaxed and declined are read, not reacted to: each changes with the filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPage]);

  const loadMore = () => {
    if (!current || loadingMore || current.deals.length >= current.total) return;
    setLoadingMore(true);
    fetchPage(current.deals.length)
      .then((r) => {
        setLoaded((prev) => {
          if (!prev || prev.source !== fetchPage) return prev;
          const seen = new Set(prev.deals.map((d) => d.id));
          return { ...prev, deals: [...prev.deals, ...r.deals.filter((d) => !seen.has(d.id))] };
        });
      })
      .catch(() => {
        // The next scroll to the end tries again.
      })
      .finally(() => setLoadingMore(false));
  };

  const chips = useMemo(() => describeFilters(filters), [filters]);
  const centreName = filters.locality ?? locality.name;
  const radiusKm = filters.radius_km ?? 5;

  const openDeal = (deal: DealCardModel) => {
    void db.recordEvents([{ deal_id: deal.id, event_type: 'view', source: 'search' }]);
    router.push({ pathname: '/deal/[id]', params: { id: deal.id } });
  };

  const clearRefinements = () =>
    setFilters({
      ...EMPTY_FILTERS,
      keywords: filters.keywords,
      radius_km: filters.radius_km,
      day_of_week: [],
      deal_types: [],
      attributes: {},
    });

  const n = activeCount(filters);

  const header = (
    <View>
      <View style={styles.chipBar}>
        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={n > 0 ? 'Filters, ' + n + ' applied' : 'Filters'}
          style={[styles.filterButton, n > 0 && styles.filterButtonOn]}
        >
          <Icon name="filter" size={16} color={n > 0 ? color.white : color.text} />
          <Text style={[styles.filterLabel, n > 0 && { color: color.white }]}>
            Filters{n > 0 ? ' · ' + n : ''}
          </Text>
        </Pressable>
        {chips.map((c, i) => (
          <Pressable
            key={c.key + i}
            onPress={() => setFilters((f) => removeFilter(f, c.key as keyof SearchFilters))}
            accessibilityRole="button"
            accessibilityLabel={'Remove ' + c.label}
            style={styles.appliedChip}
          >
            <Text style={styles.appliedLabel}>{c.label}</Text>
            <Icon name="x" size={12} color={color.brandStrong} strokeWidth={2} />
          </Pressable>
        ))}
      </View>
      {relaxNote && deals ? (
        <View style={styles.relaxed}>
          <Icon name="spark" size={16} color={color.brandStrong} />
          <Text style={styles.relaxedText}>{relaxNote}</Text>
          <Pressable
            onPress={() => {
              if (!relaxed) return;
              setDeclined(relaxed.from);
              setFilters(relaxed.from);
            }}
            accessibilityRole="button"
            hitSlop={8}
            style={reach(8)}
          >
            <Text style={styles.relaxedUndo}>Undo</Text>
          </Pressable>
        </View>
      ) : null}
      {deals ? (
        <Text style={styles.count}>
          {total} {total === 1 ? 'deal' : 'deals'} within {radiusKm < 1 ? radiusKm * 1000 + ' m' : radiusKm + ' km'} of {centreName}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <SearchHeader
        label={titleFor(params.q, filters, params.vehicle)}
        query={params.q}
        onBack={() => (router.canGoBack() ? router.back() : router.dismissTo('/'))}
      />

      {error ? (
        <EmptyState
          icon="wifi"
          tone="alert"
          title="Something went wrong"
          body={error}
          action={<Button onPress={() => setFilters({ ...filters })}>Try again</Button>}
        />
      ) : (
        <FlatList
          // Columns change with width; a new key lets FlatList rebuild its rows.
          key={layout.listColumns}
          numColumns={layout.listColumns}
          columnWrapperStyle={layout.listColumns > 1 ? { gap: space.md } : undefined}
          data={deals ?? []}
          keyExtractor={(d) => d.id}
          renderItem={({ item }) => (
            <View style={layout.listColumns > 1 ? { width: cell } : styles.cell}>
              <DealCard deal={item} variant="list" onPress={() => openDeal(item)} />
            </View>
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={
            deals === null ? (
              <View style={styles.skeletons}>
                {[0, 1, 2, 3].map((k) => (
                  <DealCardSkeleton key={k} variant="list" />
                ))}
              </View>
            ) : (
              <EmptyState
                icon="search"
                title="No deals match"
                body={
                  n > 0
                    ? 'Try removing a filter or widening the distance.'
                    : filters.keywords.length > 0
                      ? // The wider areas were already tried before this shows.
                        'Nothing matches “' + filters.keywords.join(' ') + '” anywhere in Bengaluru yet. Try another word, like biryani, haircut or car wash.'
                      : 'Nothing like that within ' + radiusKm + ' km. Try a wider area.'
                }
                action={
                  n > 0 ? (
                    <Button onPress={clearRefinements}>Clear filters</Button>
                  ) : filters.keywords.length > 0 ? (
                    <Button onPress={() => router.replace('/search')}>Search again</Button>
                  ) : radiusKm < 10 ? (
                    <Button onPress={() => setFilters({ ...filters, radius_km: 10 })}>
                      Search within 10 km
                    </Button>
                  ) : undefined
                }
              />
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.skeletons}>
                <DealCardSkeleton variant="list" />
              </View>
            ) : null
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          contentContainerStyle={[styles.list, { paddingHorizontal: layout.gutter }]}
          ItemSeparatorComponent={Gap}
          keyboardDismissMode="on-drag"
        />
      )}

      <FilterSheet
        visible={sheetOpen}
        filters={filters}
        onClose={() => setSheetOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setSheetOpen(false);
        }}
      />
    </View>
  );
}

function Gap() {
  return <View style={{ height: space.md }} />;
}

/**
 * The bar at the top reads as the search box the results came from: a tap
 * anywhere on it reopens search with the words already typed, ready to change.
 */
function SearchHeader({ label, query, onBack }: { label: string; query: string | undefined; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.searchHeader, { paddingTop: insets.top }]}>
      <View style={styles.searchHeaderRow}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [styles.searchBack, pressed && styles.searchPressed]}
        >
          <Icon name="back" size={22} color={color.text} />
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/search', params: query ? { q: query } : {} })}
          accessibilityRole="button"
          accessibilityLabel={'Change search: ' + (query ?? label)}
          style={({ pressed }) => [styles.searchBox, pressed && styles.searchPressed]}
        >
          <Icon name="search" size={18} color={color.textSecondary} />
          <Text style={styles.searchBoxText} numberOfLines={1}>
            {query ?? label}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchHeader: {
    backgroundColor: color.surface,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
    zIndex: 20,
  },
  searchHeaderRow: {
    height: size.header,
    paddingLeft: 8,
    paddingRight: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  searchBack: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  searchBox: {
    flex: 1,
    minWidth: 0,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceSoftAlt,
  },
  searchBoxText: {
    ...type.bodySemibold,
    color: color.text,
    flex: 1,
  },
  searchPressed: {
    opacity: 0.7,
  },
  screen: {
    flex: 1,
    backgroundColor: color.background,
  },
  cell: {
    flex: 1,
  },
  list: {
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.xxxl,
    flexGrow: 1,
  },
  chipBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingTop: space.lg,
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
  appliedChip: {
    height: size.chip,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceSoftAlt,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  appliedLabel: {
    ...type.captionMedium,
    color: color.brandStrong,
  },
  relaxed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
  },
  relaxedText: {
    ...type.caption,
    color: color.text,
    flex: 1,
  },
  relaxedUndo: {
    ...type.captionMedium,
    color: color.brandStrong,
  },
  count: {
    ...type.caption,
    color: color.textSecondary,
    marginTop: space.md,
    marginBottom: space.md,
  },
  skeletons: {
    gap: space.md,
    paddingTop: space.md,
  },
});
