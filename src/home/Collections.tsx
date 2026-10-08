/**
 * Collections: hand-picked ways into the deals, the way District curates
 * "Date night" or "Rooftops". Each is a search the app already understands,
 * across the city, with a count so nothing opens empty.
 */

import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { db } from '../data';
import { photoUrl } from '../data/photo-library';
import { PHOTO_TOPICS } from '../data/photo-library-data';
import type { LatLng } from '../data/types';
import { parseQuery } from '../search/parser';
import { track } from '../lib/track';
import { useQuery } from '../lib/useQuery';
import { color, radius, space, type } from '../theme/tokens';
import { Container } from '../ui/layout';

const CITY_M = 30_000;

const COLLECTIONS: { key: string; title: string; blurb: string; q: string; topic: string }[] = [
  { key: 'date', title: 'Date night', blurb: 'Dinners for two', q: 'dinner for two under 2500', topic: 'dinner' },
  { key: 'family', title: 'Family dinners', blurb: 'Feasts and big tables', q: 'family dinner', topic: 'feast' },
  { key: 'rooftop', title: 'Rooftops', blurb: 'Eat and drink up top', q: 'rooftop', topic: 'cocktails' },
  { key: 'music', title: 'Live music nights', blurb: 'Pitchers and a band', q: 'live music', topic: 'beer' },
  { key: 'veg', title: 'Pure veg', blurb: 'Vegetarian kitchens', q: 'pure veg', topic: 'thali' },
  { key: 'brunch', title: 'Weekend brunch', blurb: 'Late breakfasts', q: 'brunch', topic: 'pancakes' },
  { key: 'cafe', title: 'Work from a cafe', blurb: 'Wi-Fi and coffee', q: 'cafe with wifi', topic: 'coffee' },
  { key: 'pamper', title: 'Pamper yourself', blurb: 'Salons and spas', q: 'spa', topic: 'spa' },
  { key: 'laughs', title: 'Comedy nights', blurb: 'Stand-up and improv', q: 'comedy', topic: 'comedy' },
  { key: 'ride', title: 'Bike and car care', blurb: 'Service and wash', q: 'bike service', topic: 'bike-service' },
];

function cover(topic: string): string {
  const t = PHOTO_TOPICS.find((x) => x.key === topic) ?? PHOTO_TOPICS[0];
  return photoUrl(t.photos[0], 480, 600);
}

export function Collections({ origin }: { origin: LatLng }) {
  const fetchCounts = useCallback(async () => {
    const counts = await Promise.all(
      COLLECTIONS.map((c) =>
        db
          .searchDeals({ q: c.q, filters: { ...parseQuery(c.q).filters, radius_km: CITY_M / 1000 }, origin, limit: 1 })
          .then((r) => r.total)
          .catch(() => 0),
      ),
    );
    return Object.fromEntries(COLLECTIONS.map((c, i) => [c.key, counts[i]]));
  }, [origin]);
  const { data } = useQuery(fetchCounts);
  // Only collections with something in them; all of them while the counts load.
  const shown = COLLECTIONS.filter((c) => !data || (data[c.key] ?? 0) > 0);

  return (
    <View style={styles.wrap}>
      <Container>
        <Text style={styles.title} accessibilityRole="header">
          Collections
        </Text>
        <Text style={styles.lead}>Picked for the way you go out, across Bengaluru</Text>
      </Container>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {shown.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => {
              track({ name: 'collection_open', surface: 'home.collections', props: { collection: c.key } });
              // Counted as a collection, not as a search they typed.
              router.push({ pathname: '/results', params: { q: c.q, radius: String(CITY_M), from: 'collection' } });
            }}
            accessibilityRole="button"
            accessibilityLabel={c.title + (data ? ', ' + (data[c.key] ?? 0) + ' deals' : '')}
            style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.98 }] }]}
          >
            <Image source={{ uri: cover(c.topic) }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(8,18,36,0.85)']}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.text}>
              <Text style={styles.name}>{c.title}</Text>
              <Text style={styles.blurb}>
                {c.blurb}
                {data ? ' · ' + (data[c.key] ?? 0) + ((data[c.key] ?? 0) === 1 ? ' deal' : ' deals') : ''}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: space.xl,
  },
  title: {
    ...type.h2,
    color: color.text,
  },
  lead: {
    ...type.caption,
    color: color.textSecondary,
    marginTop: 2,
  },
  row: {
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  card: {
    width: 156,
    height: 196,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: color.surfaceSoftAlt,
    justifyContent: 'flex-end',
  },
  text: {
    padding: space.md,
  },
  name: {
    ...type.bodySemibold,
    color: color.white,
  },
  blurb: {
    ...type.small,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
});
