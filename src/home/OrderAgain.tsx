/**
 * "Order again" on Home, the way Swiggy and Zomato do it: what this person
 * orders most, still on offer, with how often they had it and a button that
 * goes straight to checkout. Hidden for anyone without a history.
 */

import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { nextOnLabel, orderableNow } from '../assistant/find';
import { isLiveDeal, loadHistory, timesLabel } from '../assistant/history';
import { useQuery } from '../lib/useQuery';
import { track } from '../lib/track';
import { useViewer } from '../state/session';
import { color, inr, radius, space, type } from '../theme/tokens';
import { Button } from '../components';
import { Container, useLayout } from '../ui/layout';

const CARD = 280;

export function OrderAgain() {
  const viewer = useViewer();
  const layout = useLayout();
  const account = viewer?.id ?? null;
  const fetchUsuals = useCallback(async () => {
    const h = await loadHistory(account !== null);
    // Worked out here, not while drawing: whether it can be ordered this minute, else when it is on.
    const live = h.deals
      .filter((u) => isLiveDeal(u.deal))
      .map((u) => ({ ...u, now: orderableNow(u.deal), next: orderableNow(u.deal) ? null : nextOnLabel(u.deal) }));
    return [...live.filter((u) => u.now), ...live.filter((u) => !u.now)].slice(0, 6);
  }, [account]);
  const { data } = useQuery(fetchUsuals);
  if (!data || data.length === 0) return null;

  const open = (id: string, take: boolean, qty: number) => {
    if (take) track({ name: 'reorder_tap', deal_id: id, surface: 'home.order_again' });
    router.push({
      pathname: '/deal/[id]',
      params: {
        id,
        from: 'home.order_again',
        ...(take ? { take: '1' } : {}),
        ...(take && qty > 1 ? { qty: String(qty) } : {}),
      },
    });
  };

  return (
    <View style={styles.section}>
      <Container>
        <Text style={styles.title} accessibilityRole="header">
          Order again
        </Text>
        <Text style={styles.note}>Your usuals, still on offer</Text>
      </Container>
      {/* Centred with the other rows on a wide screen, scrolling edge to edge on a phone. */}
      <Container flush>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: layout.gutter, gap: space.md, paddingVertical: 4 }}
        >
        {data.map((u) => (
          <View key={u.deal.id} style={styles.card}>
            <Pressable
              onPress={() => open(u.deal.id, false, 1)}
              accessibilityRole="button"
              accessibilityLabel={u.deal.title + ' at ' + u.deal.business.name}
              style={({ pressed }) => [styles.opener, pressed && { opacity: 0.85 }]}
            >
              <Image source={{ uri: u.deal.image }} style={styles.image} contentFit="cover" transition={120} />
              <View style={styles.text}>
                <Text style={styles.dealTitle} numberOfLines={2}>
                  {u.deal.title}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {u.deal.business.name}
                </Text>
                <View style={styles.priceRow}>
                  <Text style={styles.price}>{u.deal.deal_price ? inr(u.deal.deal_price) : 'Free'}</Text>
                  <Text style={styles.meta}>· had it {timesLabel(u.count)}</Text>
                </View>
              </View>
            </Pressable>
            {u.now || !u.next ? (
              <Button small variant="cta" full onPress={() => open(u.deal.id, true, u.quantity)}>
                Order again
              </Button>
            ) : (
              <Button small variant="secondary" full onPress={() => open(u.deal.id, false, 1)}>
                {u.next}
              </Button>
            )}
          </View>
        ))}
        </ScrollView>
      </Container>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: space.xxl,
    gap: space.md,
  },
  title: {
    ...type.h2,
    color: color.text,
  },
  note: {
    ...type.caption,
    color: color.textSecondary,
    marginTop: 2,
  },
  card: {
    width: CARD,
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  opener: {
    flexDirection: 'row',
    gap: space.md,
  },
  image: {
    width: 76,
    height: 76,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  dealTitle: {
    ...type.bodySemibold,
    color: color.text,
  },
  meta: {
    ...type.small,
    color: color.textSecondary,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  price: {
    ...type.bodySemibold,
    color: color.accentText,
  },
});
