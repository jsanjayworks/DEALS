/**
 * The bento row on Home: three live tiles under the search bar.
 *
 *   Spotlight     the top deals near you, a photo tile you can swipe through
 *                 (2 rows tall); it turns over on its own until you touch it
 *   Ending soon   the deals closest to ending, each with a ticking countdown;
 *                 swipe the same way
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
import Animated from 'react-native-reanimated';
import type { DealCardModel } from '../data/types';
import { DiscountBadge, useHoverPress } from '../components';
import { color, distanceLabel, font, inr, radius, space, type } from '../theme/tokens';
import { TilePager } from './TilePager';

const GAP = 10;
const ROW = 112;
// expo-image reads a bare string as a URL, so the blurhash must be wrapped.
const PLACEHOLDER = { blurhash: 'L6Pj0^i_.AyE_3t7t7R**0o#DgR4' };

const priceOf = (d: DealCardModel) => (d.deal_price === 0 ? 'Free' : inr(d.deal_price ?? 0));

export function BentoTiles({
  spotlight,
  ending,
  under,
  onOpen,
  onUnder,
}: {
  spotlight: DealCardModel[];
  ending: DealCardModel[];
  under: { count: number; names: string };
  onOpen: (d: DealCardModel) => void;
  onUnder: () => void;
}) {
  return (
    <View style={styles.grid}>
      <View style={[styles.tile, styles.spot]}>
        {spotlight.length > 0 ? (
          <TilePager
            items={spotlight}
            keyOf={(d) => d.id}
            label="Spotlight deals"
            renderPage={(d) => <SpotlightPage deal={d} onOpen={onOpen} />}
          />
        ) : null}
      </View>

      <View style={styles.column}>
        <View style={[styles.tile, styles.plain, ending.length === 0 && styles.empty]}>
          {ending.length > 0 ? <EndingPager deals={ending} onOpen={onOpen} /> : null}
        </View>
        <PressTile onPress={onUnder} label={'Under ₹200, ' + under.count + ' deals'}>
          <Text style={styles.kicker}>Under ₹200</Text>
          <Text style={[styles.big, styles.bigAccent]}>
            {under.count} {under.count === 1 ? 'deal' : 'deals'}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {under.names || 'Nothing that cheap nearby'}
          </Text>
        </PressTile>
      </View>
    </View>
  );
}

/** A whole tile that is one button, with the shared lift on hover and press. */
function PressTile({ children, onPress, label }: { children: ReactNode; onPress: () => void; label: string }) {
  const { handlers, liftStyle } = useHoverPress({ lift: 3, pressScale: 0.97 });
  return (
    <Pressable onPress={onPress} {...handlers} accessibilityRole="button" accessibilityLabel={label} style={styles.flex}>
      <Animated.View style={[styles.tile, styles.plain, styles.soft, liftStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

function SpotlightPage({ deal, onOpen }: { deal: DealCardModel; onOpen: (d: DealCardModel) => void }) {
  return (
    <Pressable
      onPress={() => onOpen(deal)}
      accessibilityRole="button"
      accessibilityLabel={deal.title + ', ' + deal.business.name}
      style={styles.flex}
    >
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
        <Text style={styles.spotMeta}>{priceOf(deal) + ' · ' + distanceLabel(deal.distance_km)}</Text>
      </View>
    </Pressable>
  );
}

/** One clock for every page, so swiping between them never shows a stale time. */
function EndingPager({ deals, onOpen }: { deals: DealCardModel[]; onOpen: (d: DealCardModel) => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <TilePager
      items={deals}
      keyOf={(d) => d.id}
      dotTone="dark"
      label="Deals ending soon"
      renderPage={(d) => (
        <Pressable
          onPress={() => onOpen(d)}
          accessibilityRole="button"
          accessibilityLabel={'Ending soon: ' + d.title}
          style={styles.endingPage}
        >
          <Text style={styles.kicker}>Ending soon</Text>
          <Text style={styles.big}>{countdown(d.ends_at, now)}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {d.title + ', ' + priceOf(d)}
          </Text>
        </Pressable>
      )}
    />
  );
}

/** "2d 4h", "16h 47m", and a ticking "47:12" in the last hour. */
function countdown(endsAt: string, now: number): string {
  const ms = Math.max(0, new Date(endsAt).getTime() - now);
  if (ms === 0) return 'Ended';
  const s = Math.floor(ms / 1000);
  const two = (n: number) => String(n).padStart(2, '0');
  if (s >= 86_400) return Math.floor(s / 86_400) + 'd ' + Math.floor((s % 86_400) / 3600) + 'h';
  if (s >= 3600) return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
  return two(Math.floor(s / 60)) + ':' + two(s % 60);
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
    overflow: 'hidden',
  },
  plain: {
    justifyContent: 'center',
  },
  spot: {
    borderWidth: 0,
    backgroundColor: color.surfaceSoftAlt,
  },
  soft: {
    backgroundColor: color.accentSoft,
    borderColor: 'transparent',
    padding: space.md + 2,
  },
  empty: {
    backgroundColor: color.surfaceSoftAlt,
    borderColor: 'transparent',
  },
  endingPage: {
    flex: 1,
    padding: space.md + 2,
    paddingBottom: space.lg + 4,
    justifyContent: 'center',
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
    bottom: 24,
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
