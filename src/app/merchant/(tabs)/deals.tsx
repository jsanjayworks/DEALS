/**
 * Every deal this business has, grouped the way a merchant thinks about them:
 * live, waiting on review, drafts to finish, and ended.
 */

import { useCallback, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { db } from '../../../data';
import { useQuery } from '../../../lib/useQuery';
import { MerchantDealRow } from '../../../merchant/DealRow';
import { BUCKETS, type BucketKey, inBucket, useBusinessId } from '../../../merchant/useBusiness';
import { color, space } from '../../../theme/tokens';
import { Button, Chip, EmptyState, Header } from '../../../components';

type Filter = 'all' | BucketKey;

const isFilter = (v: string | undefined): v is Filter => v === 'all' || (v ?? '') in BUCKETS;

const EMPTY: Record<Filter, { title: string; body: string }> = {
  all: { title: 'No deals yet', body: 'Create your first deal. It takes about two minutes.' },
  live: { title: 'Nothing live', body: 'Approved deals appear here once they start.' },
  review: { title: 'Nothing in review', body: 'Submitted deals wait here for the YOLO team.' },
  drafts: { title: 'No drafts', body: 'Deals you started but did not submit show up here.' },
  ended: { title: 'Nothing has ended', body: 'Expired and archived deals are kept here.' },
};

export default function MerchantDealsScreen() {
  const params = useLocalSearchParams<{ bucket?: string }>();
  const businessId = useBusinessId();
  const [filter, setFilter] = useState<Filter>(isFilter(params.bucket) ? params.bucket : 'all');
  // The tab stays mounted; a later link with a different bucket has to move it.
  const [seenParam, setSeenParam] = useState(params.bucket);
  if (params.bucket !== seenParam) {
    setSeenParam(params.bucket);
    if (isFilter(params.bucket)) setFilter(params.bucket);
  }

  const fetchDeals = useCallback(
    () => (businessId ? db.listBusinessDeals(businessId) : Promise.resolve([])),
    [businessId],
  );
  const { data, loading } = useQuery(fetchDeals);
  const deals = data ?? [];

  const bucketDeals = (k: BucketKey) => deals.filter((d) => inBucket(d, k));
  // Newest first within a bucket: the one just edited is the one being looked for.
  const shown = (filter === 'all' ? deals.filter((d) => !(d.status === 'ARCHIVED' && !d.published_at)) : bucketDeals(filter))
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <View style={styles.screen}>
      <Header title="Your deals" dark />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip selected={filter === 'all'} count={deals.length} onPress={() => setFilter('all')}>
            All
          </Chip>
          {(Object.keys(BUCKETS) as BucketKey[]).map((k) => (
            <Chip key={k} selected={filter === k} count={bucketDeals(k).length} onPress={() => setFilter(k)}>
              {BUCKETS[k].label}
            </Chip>
          ))}
        </ScrollView>
      </View>
      <FlatList
        data={shown}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Gap}
        renderItem={({ item }) => (
          <MerchantDealRow
            deal={item}
            onPress={() => router.push({ pathname: '/merchant/deal/[id]', params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="store"
              title={EMPTY[filter].title}
              body={EMPTY[filter].body}
              action={
                filter === 'all' || filter === 'drafts' ? (
                  <Button variant="cta" icon="plus" onPress={() => router.push('/merchant/new')}>
                    Create a deal
                  </Button>
                ) : undefined
              }
            />
          )
        }
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
  chips: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.sm,
  },
  list: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxxl,
    flexGrow: 1,
  },
});
