/**
 * The deal card, from `DealCard` in docs/design/figma-make/ui.tsx.
 *
 * Four variants:
 *   large      270pt wide, for the horizontal rails on Home
 *   list       full width, image left, for search results
 *   compact    fills a grid cell
 *   spotlight  photo-first, text over a gradient, for the Home carousel
 *
 * Photo first, type underneath, no box around it: the photo is the colour on
 * the page and everything else stays ink and grey. Every variant lifts and
 * pushes its photo in on hover, so the web build feels like a website rather
 * than a phone screen in a browser; touch gets the press.
 *
 * It takes a DealCardModel straight from the data layer, so the same component
 * renders a seeded deal and a live one with no adapter in between.
 */

import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { alpha, color, distanceLabel, font, inr, radius, shadow, type } from '../theme/tokens';
import {
  DEAL_TYPE_LABEL,
  availabilityLabel,
  badgeFor,
  type CardBadge,
} from '../lib/format';
import type { DealCardModel } from '../data/types';
import { ctaLabel } from '../data/mapping';
import { Badge, DiscountBadge, VerifiedBadge } from './Badges';
import { Icon } from './Icon';
import { Meta, Price } from './Price';
import { useHoverPress } from './useHoverPress';

export type DealCardVariant = 'large' | 'list' | 'compact' | 'spotlight';

export interface DealCardProps {
  deal: DealCardModel;
  variant?: DealCardVariant;
  onPress?: () => void;
  /** Overrides the derived badge; pass null to suppress it entirely. */
  badge?: CardBadge | null;
  /** Sizing from the parent, e.g. a grid cell width. */
  style?: StyleProp<ViewStyle>;
}

// expo-image reads a bare string as a URL, so the blurhash must be wrapped.
const PLACEHOLDER = { blurhash: 'L6Pj0^i_.AyE_3t7t7R**0o#DgR4' };

export function DealCard({ deal, variant = 'large', onPress, badge, style }: DealCardProps) {
  const flag = badge === undefined ? badgeFor(deal) : badge;
  // A free deal says Free once; "100% OFF" beside it is noise.
  const discount = deal.deal_price === 0 ? 0 : Math.round(deal.discount_pct ?? 0);
  const { handlers, liftStyle, zoomStyle } = useHoverPress({
    lift: variant === 'list' ? 2 : 6,
  });

  const photo = (
    <Animated.View style={[styles.fill, zoomStyle]}>
      <Image
        source={{ uri: deal.image }}
        style={styles.fill}
        contentFit="cover"
        placeholder={PLACEHOLDER}
        transition={180}
      />
    </Animated.View>
  );

  const shell = (cardStyle: StyleProp<ViewStyle>, children: ReactNode) => (
    <Pressable
      onPress={onPress}
      {...handlers}
      accessibilityRole="button"
      accessibilityLabel={deal.title + ', ' + deal.business.name}
      style={[variant === 'large' && { width: DEAL_CARD_LARGE_WIDTH }, style]}
    >
      <Animated.View style={[styles.shadowWrap, variant === 'spotlight' && styles.shadowWrapSpot, liftStyle]}>
        <View style={cardStyle}>{children}</View>
      </Animated.View>
    </Pressable>
  );

  if (variant === 'spotlight') {
    return shell(
      [styles.spot],
      <>
        {photo}
        <LinearGradient
          colors={[alpha(color.text, 0.05), alpha(color.text, 0.25), alpha(color.text, 0.9)]}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.spotTop}>
          <DiscountBadge percent={discount} />
          {flag ? <Badge kind={flag} /> : null}
        </View>
        <View style={styles.spotBottom}>
          <Text style={styles.spotBiz} numberOfLines={1}>
            {deal.business.name + ' · ' + distanceLabel(deal.distance_km)}
          </Text>
          <Text style={styles.spotTitle} numberOfLines={2}>
            {deal.title}
          </Text>
          <View style={styles.spotRow}>
            <Text style={styles.spotPrice}>
              {deal.deal_price === 0 ? 'Free' : inr(deal.deal_price ?? 0)}
              {deal.price_unit ? <Text style={styles.spotUnit}>{deal.price_unit}</Text> : null}
            </Text>
            {deal.original_price != null && (deal.deal_price ?? 0) < deal.original_price ? (
              <Text style={styles.spotWas}>{inr(deal.original_price)}</Text>
            ) : null}
            <View style={styles.flex} />
            <View style={styles.spotCta}>
              <Text style={styles.spotCtaText}>{ctaLabel(deal.primary_cta)}</Text>
              <Icon name="chev" size={14} color={color.text} strokeWidth={2.2} />
            </View>
          </View>
        </View>
      </>,
    );
  }

  if (variant === 'list') {
    return shell(
      [styles.card, styles.listCard],
      <>
        <View style={styles.listImageWrap}>
          {photo}
          <View style={styles.badgeTopLeft}>
            <DiscountBadge percent={discount} />
          </View>
        </View>

        <View style={styles.listBody}>
          <View style={styles.overlineRow}>
            <Text style={styles.overline} numberOfLines={1}>
              {DEAL_TYPE_LABEL[deal.deal_type_code] ?? deal.deal_type_code}
            </Text>
            {flag ? <Badge kind={flag} /> : null}
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {deal.title}
          </Text>
          <Text style={styles.business} numberOfLines={1}>
            {deal.business.name}
          </Text>
          <Price now={deal.deal_price} was={deal.original_price} unit={deal.price_unit} />
          <View style={styles.listFooter}>
            <Meta distanceKm={deal.distance_km} rating={deal.rating_avg} />
            <Text style={styles.cta} numberOfLines={1}>
              {ctaLabel(deal.primary_cta)} {'→'}
            </Text>
          </View>
        </View>
      </>,
    );
  }

  const isLarge = variant === 'large';
  return shell(
    [styles.card, isLarge ? styles.largeCard : styles.compactCard],
    <>
      <View style={[styles.imageWrap, { height: isLarge ? 176 : 132 }]}>
        {photo}
        <View style={[styles.badgeTopLeft, styles.badgeRow]}>
          <DiscountBadge percent={discount} />
          {isLarge && flag ? <Badge kind={flag} /> : null}
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, styles.flexShrink]} numberOfLines={1}>
            {deal.title}
          </Text>
          {isLarge && deal.is_verified ? <VerifiedBadge compact /> : null}
        </View>
        <Text style={styles.business} numberOfLines={1}>
          {deal.business.name}
        </Text>
        <Meta distanceKm={deal.distance_km} rating={deal.rating_avg} />
        <View style={styles.priceGap}>
          <Price now={deal.deal_price} was={deal.original_price} unit={deal.price_unit} />
        </View>
        {isLarge ? (
          <Text style={styles.when} numberOfLines={1}>
            {availabilityLabel(deal.availability)}
          </Text>
        ) : null}
      </View>
    </>,
  );
}

/** Loading placeholder with the same footprint, so the list does not jump. */
export function DealCardSkeleton({ variant = 'list' }: { variant?: DealCardVariant }) {
  if (variant === 'list') {
    return (
      <View style={[styles.card, styles.listCard]}>
        <View style={[styles.listImageWrap, styles.skeleton]} />
        <View style={[styles.listBody, { gap: 8 }]}>
          <View style={[styles.skeleton, { height: 10, width: '35%' }]} />
          <View style={[styles.skeleton, { height: 14, width: '75%' }]} />
          <View style={[styles.skeleton, { height: 10, width: '50%' }]} />
          <View style={[styles.skeleton, { height: 18, width: '40%', marginTop: 'auto' }]} />
        </View>
      </View>
    );
  }
  return (
    <View
      style={[
        styles.card,
        variant === 'large' ? [styles.largeCard, { width: DEAL_CARD_LARGE_WIDTH }] : styles.compactCard,
      ]}
    >
      <View style={[styles.imageWrap, styles.skeleton, { height: variant === 'large' ? 176 : 132 }]} />
      <View style={[styles.body, { gap: 8 }]}>
        <View style={[styles.skeleton, { height: 14, width: '80%' }]} />
        <View style={[styles.skeleton, { height: 10, width: '55%' }]} />
        <View style={[styles.skeleton, { height: 18, width: '45%' }]} />
      </View>
    </View>
  );
}

export const DEAL_CARD_LARGE_WIDTH = 270;

const CARD_RADIUS = 16;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  // The shadow sits on a wrapper: iOS clips shadows on a view with overflow hidden.
  shadowWrap: {
    borderRadius: CARD_RADIUS,
  },
  shadowWrapSpot: {
    borderRadius: 24,
    ...shadow.card,
  },
  card: {
    backgroundColor: color.surface,
  },
  largeCard: {
    width: '100%',
  },
  compactCard: {
    width: '100%',
  },
  listCard: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 6,
  },
  spot: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: color.text,
  },
  spotTop: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  spotBottom: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
    gap: 2,
  },
  spotBiz: {
    ...type.smallMedium,
    color: 'rgba(255,255,255,0.8)',
  },
  spotTitle: {
    fontFamily: font.bold,
    fontSize: 22,
    lineHeight: 27,
    letterSpacing: -0.3,
    color: color.white,
  },
  spotRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 6,
  },
  spotPrice: {
    fontFamily: font.bold,
    fontSize: 20,
    color: color.white,
    fontVariant: ['tabular-nums'],
  },
  spotUnit: {
    fontFamily: font.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  spotWas: {
    ...type.caption,
    color: 'rgba(255,255,255,0.6)',
    textDecorationLine: 'line-through',
  },
  spotCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: color.white,
    alignSelf: 'center',
  },
  spotCtaText: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: color.text,
  },
  imageWrap: {
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: color.surfaceSoftAlt,
  },
  listImageWrap: {
    width: 112,
    height: 112,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: color.surfaceSoftAlt,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  badgeTopLeft: {
    position: 'absolute',
    left: 8,
    top: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 4,
  },
  body: {
    paddingTop: 10,
    paddingHorizontal: 2,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  flexShrink: {
    flexShrink: 1,
  },
  priceGap: {
    marginTop: 4,
  },
  listBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    justifyContent: 'center',
  },
  overlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  overline: {
    ...type.overline,
    color: color.textSecondary,
  },
  title: {
    ...type.bodySemibold,
    color: color.text,
  },
  business: {
    ...type.small,
    color: color.textSecondary,
  },
  listFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cta: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: color.brand,
  },
  when: {
    ...type.small,
    color: color.textMuted,
  },
  skeleton: {
    backgroundColor: color.surfaceSoftAlt,
    borderRadius: radius.md,
  },
});
