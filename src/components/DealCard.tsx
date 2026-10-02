/**
 * The deal card, from `DealCard` in docs/design/figma-make/ui.tsx.
 *
 * Three variants, matching the design:
 *   large    270pt wide, for the horizontal rails on Home
 *   list     full width, image left, for search results
 *   compact  full width inside a two-column grid
 *
 * It takes a DealCardModel straight from the data layer, so the same component
 * renders a seeded deal and a live one with no adapter in between.
 */

import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, radius, shadow, type } from '../theme/tokens';
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

export type DealCardVariant = 'large' | 'list' | 'compact';

export interface DealCardProps {
  deal: DealCardModel;
  variant?: DealCardVariant;
  onPress?: () => void;
  /** Overrides the derived badge; pass null to suppress it entirely. */
  badge?: CardBadge | null;
}

const BLUR_PLACEHOLDER = 'L6Pj0^i_.AyE_3t7t7R**0o#DgR4';

export function DealCard({ deal, variant = 'large', onPress, badge }: DealCardProps) {
  const flag = badge === undefined ? badgeFor(deal) : badge;
  const discount = Math.round(deal.discount_pct ?? 0);

  if (variant === 'list') {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={deal.title + ', ' + deal.business.name}
        style={({ pressed }) => [styles.card, styles.listCard, pressed && styles.pressed]}
      >
        <View style={styles.listImageWrap}>
          <Image
            source={{ uri: deal.image }}
            style={styles.fill}
            contentFit="cover"
            placeholder={BLUR_PLACEHOLDER}
            transition={180}
          />
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
      </Pressable>
    );
  }

  const isLarge = variant === 'large';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={deal.title + ', ' + deal.business.name}
      style={({ pressed }) => [
        styles.card,
        isLarge ? styles.largeCard : styles.compactCard,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.imageWrap, { height: isLarge ? 144 : 112 }]}>
        <Image
          source={{ uri: deal.image }}
          style={styles.fill}
          contentFit="cover"
          placeholder={BLUR_PLACEHOLDER}
          transition={180}
        />
        <View style={[styles.badgeTopLeft, styles.badgeRow]}>
          <DiscountBadge percent={discount} />
          {isLarge && flag ? <Badge kind={flag} /> : null}
        </View>
      </View>

      <View style={styles.body}>
        {isLarge && deal.is_verified ? <VerifiedBadge /> : null}
        <Text style={styles.title} numberOfLines={1}>
          {deal.title}
        </Text>
        <Text style={styles.business} numberOfLines={1}>
          {deal.business.name}
        </Text>
        <Price now={deal.deal_price} was={deal.original_price} unit={deal.price_unit} />
        <Meta distanceKm={deal.distance_km} rating={deal.rating_avg} />
        {isLarge ? (
          <View style={styles.whenRow}>
            <Icon name="clock" size={13} color={color.textSecondary} />
            <Text style={styles.when} numberOfLines={1}>
              {availabilityLabel(deal.availability)}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
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
    <View style={[styles.card, variant === 'large' ? styles.largeCard : styles.compactCard]}>
      <View style={[styles.imageWrap, styles.skeleton, { height: variant === 'large' ? 144 : 112 }]} />
      <View style={[styles.body, { gap: 8 }]}>
        <View style={[styles.skeleton, { height: 14, width: '80%' }]} />
        <View style={[styles.skeleton, { height: 10, width: '55%' }]} />
        <View style={[styles.skeleton, { height: 18, width: '45%' }]} />
      </View>
    </View>
  );
}

export const DEAL_CARD_LARGE_WIDTH = 270;

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.border,
    overflow: 'hidden',
    ...shadow.card,
  },
  largeCard: {
    width: DEAL_CARD_LARGE_WIDTH,
  },
  compactCard: {
    flex: 1,
  },
  listCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.995 }],
  },
  imageWrap: {
    backgroundColor: color.background,
  },
  listImageWrap: {
    width: 112,
    height: 112,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: color.background,
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
    padding: 12,
    gap: 4,
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
  whenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  when: {
    ...type.small,
    color: color.textSecondary,
    flexShrink: 1,
  },
  skeleton: {
    backgroundColor: color.background,
    borderRadius: radius.md,
  },
});
