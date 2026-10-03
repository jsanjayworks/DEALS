/**
 * Search results.
 *
 * Entered three ways: a typed query (?q=), a category tile (?vertical=) or a
 * "See all" on Home (?sort=, ?radius=). All three become one SearchFilters
 * value and one search_deals call, so they rank and filter identically.
 *
 * The applied filters render as removable chips. Removing one clears exactly
 * that field and re-queries, which is how someone recovers from a parse they
 * did not mean without retyping.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { db } from '../data';
import { CATEGORIES } from '../data/seed-reference';
import type { DealCardModel, SearchFilters, SortKey, Vertical } from '../data/types';
import { describeFilters, EMPTY_FILTERS, parseQuery, removeFilter } from '../search/parser';
import { FilterSheet, SORT_OPTIONS } from '../search/FilterSheet';
import { useLocality, useSession } from '../state/session';
import { cellWidth, useLayout } from '../ui/layout';
import { color, font, radius, size, space, type } from '../theme/tokens';
import {
  Button,
  DealCard,
  DealCardSkeleton,
  EmptyState,
  Header,
  Icon,
} from '../components';

const PAGE = 20;

const VERTICALS: Vertical[] = [
  'food', 'retail', 'events', 'mobility', 'property', 'services', 'business', 'community',
];
const SORTS: SortKey[] = SORT_OPTIONS.map((o) => o.key);

function initialFilters(
  p: { q?: string; vertical?: string; sort?: string; radius?: string },
  fallbackRadiusM: number,
): SearchFilters {
  const base: SearchFilters = p.q
    ? parseQuery(p.q).filters
    : { ...EMPTY_FILTERS, keywords: [], day_of_week: [], deal_types: [], attributes: {} };
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

function titleFor(q: string | undefined, f: SearchFilters): string {
  if (q) return '“' + q + '”';
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

function activeCount(f: SearchFilters): number {
  return describeFilters(f).filter((c) => c.key !== 'radius_km').length;
}

export default function ResultsScreen() {
  const params = useLocalSearchParams<{
    q?: string;
    vertical?: string;
    sort?: string;
    radius?: string;
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
      .then((r) => {
        if (active) setLoaded({ source: fetchPage, deals: r.deals, total: r.total, error: null });
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
      {deals ? (
        <Text style={styles.count}>
          {total} {total === 1 ? 'deal' : 'deals'} within {radiusKm < 1 ? radiusKm * 1000 + ' m' : radiusKm + ' km'} of {centreName}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <Header title={titleFor(params.q, filters)} onBack={() => router.back()} />

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
                    : 'Nothing like that within ' + radiusKm + ' km. Try a wider area.'
                }
                action={
                  n > 0 ? (
                    <Button onPress={clearRefinements}>Clear filters</Button>
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

const styles = StyleSheet.create({
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
