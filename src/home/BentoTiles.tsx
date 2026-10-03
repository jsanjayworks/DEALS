/**
 * The bento row on Home: three live tiles under the search bar.
 *
 *   Spotlight     the top deals near you, a photo tile that turns over every
 *                 few seconds (2 rows tall)
 *   Ending soon   the deal closest to ending, with a ticking countdown
 *   Under ₹200    how many deals cost ₹200 or less; opens them
 *
 * Each tile is one tap to something useful, which is the point of the grid:
 * the page answers "what's good, what's urgent, what's cheap" before any
 * scrolling.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import type { DealCardModel } from '../data/types';
import { DiscountBadge, useHoverPress } from '../components';
import { color, distanceLabel, font, inr, radius, space, type } from '../theme/tokens';

const GAP = 10;
const ROW = 112;
const TURN_MS = 4500;
// expo-image reads a bare string as a URL, so the blurhash must be wrapped.
const PLACEHOLDER = { blurhash: 'L6Pj0^i_.AyE_3t7t7R**0o#DgR4' };

export function BentoTiles({
  spotlight,
  ending,
  under,
  onOpen,
  onUnder,
}: {
  spotlight: DealCardModel[];
  ending: DealCardModel | null;
  under: { count: number; names: string };
  onOpen: (d: DealCardModel) => void;
  onUnder: () => void;
}) {
  return (
    <View style={styles.grid}>
      <SpotlightTile deals={spotlight} onOpen={onOpen} />
      <View style={styles.column}>
        {ending ? <EndingTile deal={ending} onOpen={onOpen} /> : <View style={[styles.tile, styles.empty]} />}
        <Tile onPress={onUnder} label={'Under ₹200, ' + under.count + ' deals'} soft>
          <Text style={styles.kicker}>Under ₹200</Text>
          <Text style={[styles.big, styles.bigAccent]}>
            {under.count} {under.count === 1 ? 'deal' : 'deals'}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {under.names || 'Nothing that cheap nearby'}
          </Text>
        </Tile>
      </View>
    </View>
  );
}

/** A pressable tile with the shared lift on hover and press. */
function Tile({
  children,
  onPress,
  label,
  soft,
  style,
}: {
  children: ReactNode;
  onPress: () => void;
  label: string;
  soft?: boolean;
  style?: object;
}) {
  const { handlers, liftStyle } = useHoverPress({ lift: 3, pressScale: 0.97 });
  return (
    <Pressable onPress={onPress} {...handlers} accessibilityRole="button" accessibilityLabel={label} style={styles.flex}>
      <Animated.View style={[styles.tile, soft && styles.soft, liftStyle, style]}>{children}</Animated.View>
    </Pressable>
  );
}

function SpotlightTile({ deals, onOpen }: { deals: DealCardModel[]; onOpen: (d: DealCardModel) => void }) {
  const [index, setIndex] = useState(0);
  const count = deals.length;

  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), TURN_MS);
    return () => clearInterval(id);
  }, [count]);

  const deal = deals[index % Math.max(1, count)];
  if (!deal) return <View style={[styles.spot, styles.tile, styles.empty]} />;

  return (
    <Tile onPress={() => onOpen(deal)} label={deal.title + ', ' + deal.business.name} style={styles.spot}>
      {/* Keyed by deal: the old photo fades out as the next fades in. */}
      <Animated.View key={deal.id} entering={FadeIn.duration(600)} exiting={FadeOut.duration(600)} style={StyleSheet.absoluteFill}>
        <Image source={{ uri: deal.image }} style={StyleSheet.absoluteFill} contentFit="cover" placeholder={PLACEHOLDER} />
        <LinearGradient
          colors={['transparent', 'rgba(8,16,36,0.88)']}
          locations={[0.35, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.spotBadge}>
          <DiscountBadge percent={deal.deal_price === 0 ? 0 : Math.round(deal.discount_pct ?? 0)} />
        </View>
        <View style={styles.spotText}>
          <Text style={styles.spotTitle} numberOfLines={2}>
            {deal.title}
          </Text>
          <Text style={styles.spotMeta}>
            {(deal.deal_price === 0 ? 'Free' : inr(deal.deal_price ?? 0)) + ' · ' + distanceLabel(deal.distance_km)}
          </Text>
        </View>
      </Animated.View>
      {count > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {deals.map((d, i) => (
            <View key={d.id} style={[styles.dot, i === index % count && styles.dotOn]} />
          ))}
        </View>
      ) : null}
    </Tile>
  );
}

function EndingTile({ deal, onOpen }: { deal: DealCardModel; onOpen: (d: DealCardModel) => void }) {
  return (
    <Tile onPress={() => onOpen(deal)} label={'Ending soon: ' + deal.title}>
      <Text style={styles.kicker}>Ending soon</Text>
      <Countdown to={deal.ends_at} />
      <Text style={styles.sub} numberOfLines={1}>
        {deal.title + ', ' + (deal.deal_price === 0 ? 'free' : inr(deal.deal_price ?? 0))}
      </Text>
    </Tile>
  );
}

/** HH:MM:SS under a day, "2d 4h" beyond, ticking once a second. Its own state, so only it re-renders. */
function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = Math.max(0, new Date(to).getTime() - now);
  const s = Math.floor(ms / 1000);
  const two = (n: number) => String(n).padStart(2, '0');
  const text =
    s >= 86_400
      ? Math.floor(s / 86_400) + 'd ' + Math.floor((s % 86_400) / 3600) + 'h'
      : two(Math.floor(s / 3600)) + ':' + two(Math.floor((s % 3600) / 60)) + ':' + two(s % 60);
  return <Text style={styles.big}>{ms === 0 ? 'Ended' : text}</Text>;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    gap: GAP,
    height: ROW * 2 + GAP,
  },
  column: {
    flex: 1,
    gap: GAP,
  },
  tile: {
    flex: 1,
    borderRadius: radius.xxl - 2,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.md + 2,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  soft: {
    backgroundColor: color.accentSoft,
    borderColor: 'transparent',
  },
  empty: {
    backgroundColor: color.surfaceSoftAlt,
    borderColor: 'transparent',
  },
  spot: {
    padding: 0,
  },
  spotBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
  },
  spotText: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 22,
  },
  spotTitle: {
    fontFamily: font.bold,
    fontSize: 16,
    lineHeight: 20,
    color: '#FFFFFF',
  },
  spotMeta: {
    ...type.captionMedium,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 2,
  },
  dots: {
    position: 'absolute',
    left: 14,
    bottom: 10,
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  dotOn: {
    width: 14,
    backgroundColor: '#FFFFFF',
  },
  kicker: {
    ...type.overline,
    fontSize: 10.5,
    color: color.textMuted,
  },
  big: {
    fontFamily: font.display,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: color.text,
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  bigAccent: {
    color: color.accentText,
  },
  sub: {
    ...type.small,
    color: color.textSecondary,
  },
});
