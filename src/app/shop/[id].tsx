/**
 * A shop page: everything about one place, the way District and Zomato lay
 * it out. A cover photo, the rating, what it serves, cost for two, whether
 * it is open, and quick actions; then its live offers, menu, photos,
 * reviews and the owner's own words. The jump chips scroll to each part.
 */

import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../data';
import type { DealCardModel } from '../../data/types';
import { CATEGORIES, LOCALITIES } from '../../data/seed-reference';
import { amenityLabel } from '../../data/amenities';
import { callPhone, formatPhone, openDirections } from '../../lib/device';
import { timeLabel } from '../../lib/format';
import { openNow } from '../../lib/hours';
import { useQuery } from '../../lib/useQuery';
import { RatingSummary, ReviewCard, StarRow } from '../../reviews/Reviews';
import { useOrigin } from '../../state/session';
import { color, distanceLabel, inr, radius, space, type } from '../../theme/tokens';
import { Chip, DealCard, EmptyState, Icon, Sheet, VerifiedBadge, type IconName } from '../../components';

type Part = 'offers' | 'menu' | 'photos' | 'reviews' | 'about';
const PARTS: { key: Part; label: string }[] = [
  { key: 'offers', label: 'Offers' },
  { key: 'menu', label: 'Menu' },
  { key: 'photos', label: 'Photos' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'about', label: 'About' },
];

export default function ShopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const origin = useOrigin();
  const scroll = useRef<ScrollView>(null);
  // Where each part starts, for the jump chips.
  const [tops, setTops] = useState<Partial<Record<Part, number>>>({});
  const [viewing, setViewing] = useState<number | null>(null);

  const fetchShop = useCallback(async () => {
    const [business, deals, reviews] = await Promise.all([
      db.getBusiness(String(id)),
      db.listShopDeals(String(id), origin),
      db.listReviews({ businessId: String(id) }),
    ]);
    // Opening hours decide "Open now"; computed here, not while drawing.
    return { business, deals, reviews, open: business ? openNow(business.open_time, business.close_time) : null };
  }, [id, origin]);
  const { data } = useQuery(fetchShop);

  const back = () => (router.canGoBack() ? router.back() : router.dismissTo('/'));

  if (data && !data.business) {
    return (
      <View style={styles.screen}>
        <EmptyState
          icon="store"
          title="Shop not found"
          body="This place may have closed its page."
          action={<Chip onPress={back}>Go back</Chip>}
        />
      </View>
    );
  }

  const b = data?.business ?? null;
  const deals: DealCardModel[] = data?.deals ?? [];
  const reviews = data?.reviews ?? [];
  const cat = b ? CATEGORIES.find((c) => c.id === b.primary_category_id) : null;
  const area = b ? LOCALITIES.find((l) => l.id === b.locality_id) : null;
  const photos = b ? [...new Set([...(b.photos ?? []), ...deals.map((d) => d.image)])].filter(Boolean) : [];
  const cover = photos[0] ?? null;
  const bookable = deals.find((d) => d.primary_cta === 'book' || d.primary_cta === 'reserve' || d.booking_required);
  const distance = deals[0]?.distance_km;
  const menu = b?.menu ?? [];
  const wide = width >= 900;

  const jump = (p: Part) => {
    const y = tops[p];
    if (y != null) scroll.current?.scrollTo({ y: y - 64, animated: true });
  };
  const mark = (p: Part) => (e: { nativeEvent: { layout: { y: number } } }) => {
    const y = e.nativeEvent.layout.y;
    setTops((t) => (t[p] === y ? t : { ...t, [p]: y }));
  };

  return (
    <View style={styles.screen}>
      {b ? (
        <Head>
          <title>{b.name + ' · YOLO Deals'}</title>
        </Head>
      ) : null}
      <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}>
        <View style={[styles.cover, { height: wide ? 320 : 240 }]}>
          {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
          <View style={styles.coverShade} />
          <Pressable
            onPress={back}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={[styles.round, { top: insets.top + space.sm, left: space.lg }]}
          >
            <Icon name="back" size={22} color={color.text} />
          </Pressable>
        </View>

        <View style={styles.column}>
          <View style={styles.card}>
            <View style={styles.titleRow}>
              <Text style={styles.name} accessibilityRole="header">
                {b?.name ?? ' '}
              </Text>
              {b?.verification_status === 'verified' ? <VerifiedBadge compact /> : null}
            </View>
            <Text style={styles.sub}>
              {[cat?.name, (b?.cuisines ?? []).join(', ')].filter(Boolean).join(' · ')}
            </Text>
            <Text style={styles.sub}>
              {[area?.name, distance != null ? distanceLabel(distance) : null, b?.address_line].filter(Boolean).join(' · ')}
            </Text>

            <View style={styles.facts}>
              {b && b.rating_avg > 0 ? (
                <Pressable onPress={() => jump('reviews')} accessibilityRole="button" style={styles.ratingChip}>
                  <Text style={styles.ratingNum}>{b.rating_avg.toFixed(1)}</Text>
                  <Icon name="star" size={12} color={color.white} filled />
                </Pressable>
              ) : null}
              {b && b.rating_count > 0 ? (
                <Text style={styles.factText}>{b.rating_count.toLocaleString('en-IN')} ratings</Text>
              ) : null}
              {b?.cost_for_two ? <Text style={styles.factText}>· {inr(b.cost_for_two)} for two</Text> : null}
            </View>
            {b?.open_time && b?.close_time ? (
              <Text style={[styles.hours, data?.open === false && styles.closed]}>
                {data?.open ? 'Open now' : 'Closed now'} · {timeLabel(b.open_time)} to {timeLabel(b.close_time)}
              </Text>
            ) : null}

            <View style={styles.actions}>
              {b?.phone ? <Action icon="phone" label="Call" onPress={() => callPhone(b.phone)} /> : null}
              {b ? <Action icon="map" label="Directions" onPress={() => openDirections(b.location)} /> : null}
              {bookable ? (
                <Action
                  icon="clock"
                  label={cat?.vertical === 'food' ? 'Book a table' : 'Book a slot'}
                  primary
                  onPress={() => router.push({ pathname: '/deal/[id]', params: { id: bookable.id, take: '1' } })}
                />
              ) : null}
            </View>

            {(b?.amenities ?? []).length > 0 ? (
              <View style={styles.amenities}>
                {(b?.amenities ?? []).map((a) => (
                  <View key={a} style={styles.amenity}>
                    <Icon name="check" size={12} color={color.brand} strokeWidth={2.4} />
                    <Text style={styles.amenityText}>{amenityLabel(a)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.jumps}>
            {PARTS.map((p) => (
              <Chip key={p.key} onPress={() => jump(p.key)}>
                {p.label}
              </Chip>
            ))}
          </ScrollView>

          <View onLayout={mark('offers')} style={styles.section}>
            <Text style={styles.sectionTitle}>
              Offers{deals.length ? ' · ' + deals.length : ''}
            </Text>
            {data && deals.length === 0 ? <Text style={styles.empty}>No live offers right now.</Text> : null}
            <View style={styles.list}>
              {deals.map((d) => (
                <DealCard
                  key={d.id}
                  deal={d}
                  variant="list"
                  onPress={() => router.push({ pathname: '/deal/[id]', params: { id: d.id } })}
                />
              ))}
            </View>
          </View>

          <View onLayout={mark('menu')} style={styles.section}>
            <Text style={styles.sectionTitle}>{cat?.vertical === 'food' ? 'Menu' : 'Rate card'}</Text>
            {menu.length === 0 ? <Text style={styles.empty}>The menu is not up yet.</Text> : null}
            <View style={styles.menu}>
              {menu.map((m, i) => (
                <View key={m.name + i} style={[styles.menuRow, i < menu.length - 1 && styles.rule]}>
                  {m.veg != null ? (
                    <View style={[styles.vegBox, { borderColor: m.veg ? '#1E8E3E' : '#B3261E' }]}>
                      <View style={[styles.vegDot, { backgroundColor: m.veg ? '#1E8E3E' : '#B3261E' }]} />
                    </View>
                  ) : null}
                  <View style={styles.menuText}>
                    <Text style={styles.menuName}>{m.name}</Text>
                    {m.description ? <Text style={styles.menuDesc} numberOfLines={2}>{m.description}</Text> : null}
                    {m.price != null ? <Text style={styles.menuPrice}>{inr(m.price)}</Text> : null}
                  </View>
                  {m.photo ? <Image source={{ uri: m.photo }} style={styles.menuPhoto} contentFit="cover" /> : null}
                </View>
              ))}
            </View>
          </View>

          <View onLayout={mark('photos')} style={styles.section}>
            <Text style={styles.sectionTitle}>Photos{photos.length ? ' · ' + photos.length : ''}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
              {photos.map((p, i) => (
                <Pressable
                  key={p}
                  onPress={() => setViewing(i)}
                  accessibilityRole="button"
                  accessibilityLabel={'Photo ' + (i + 1) + ' of ' + photos.length}
                >
                  <Image source={{ uri: p }} style={styles.thumb} contentFit="cover" />
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View onLayout={mark('reviews')} style={styles.section}>
            <Text style={styles.sectionTitle}>Ratings and reviews</Text>
            {b ? <RatingSummary avg={b.rating_avg} count={b.rating_count} reviews={reviews} /> : null}
            <View style={styles.list}>
              {reviews.slice(0, 20).map((r) => (
                <ReviewCard key={r.id} review={r} />
              ))}
            </View>
            {reviews.length === 0 && data ? (
              <Text style={styles.empty}>No reviews yet. Customers can rate a visit after using a deal here.</Text>
            ) : null}
          </View>

          <View onLayout={mark('about')} style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <View style={styles.aboutCard}>
              {b?.description ? <Text style={styles.about}>{b.description}</Text> : null}
              {b?.address_line ? <Info icon="pin" text={b.address_line + (area ? ', ' + area.name : '')} /> : null}
              {b?.phone ? <Info icon="phone" text={formatPhone(b.phone)} /> : null}
              {b?.open_time && b?.close_time ? (
                <Info icon="clock" text={timeLabel(b.open_time) + ' to ' + timeLabel(b.close_time)} />
              ) : null}
              {b && b.rating_avg > 0 ? (
                <View style={styles.infoRow}>
                  <StarRow rating={b.rating_avg} />
                  <Text style={styles.infoText}>{b.rating_avg.toFixed(1)} from {b.rating_count} ratings</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>

      <Sheet visible={viewing !== null} onClose={() => setViewing(null)} title={b?.name ?? 'Photos'}>
        {viewing !== null && photos[viewing] ? (
          <View>
            <Image source={{ uri: photos[viewing] }} style={styles.full} contentFit="cover" />
            <View style={styles.viewerNav}>
              <Chip onPress={() => setViewing((v) => (v == null ? v : (v - 1 + photos.length) % photos.length))}>
                Previous
              </Chip>
              <Text style={styles.factText}>
                {viewing + 1} of {photos.length}
              </Text>
              <Chip onPress={() => setViewing((v) => (v == null ? v : (v + 1) % photos.length))}>Next</Chip>
            </View>
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

function Action({ icon, label, onPress, primary }: { icon: IconName; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, primary && styles.actionPrimary, pressed && { opacity: 0.8 }]}
    >
      <Icon name={icon} size={18} color={primary ? color.onCta : color.brand} />
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

function Info({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Icon name={icon} size={16} color={color.textSecondary} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.background,
  },
  cover: {
    width: '100%',
    backgroundColor: color.surfaceSoftAlt,
  },
  coverShade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  round: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  column: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
  },
  card: {
    marginTop: -40,
    padding: space.xl,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    gap: space.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  name: {
    ...type.display,
    fontSize: 28,
    lineHeight: 34,
    color: color.text,
    flexShrink: 1,
  },
  sub: {
    ...type.caption,
    color: color.textSecondary,
  },
  facts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
  },
  ratingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#1E8E3E',
  },
  ratingNum: {
    ...type.captionMedium,
    color: color.white,
  },
  factText: {
    ...type.caption,
    color: color.textSecondary,
  },
  hours: {
    ...type.captionMedium,
    color: '#1E8E3E',
    marginTop: 2,
  },
  closed: {
    color: color.alert,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.md,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  actionPrimary: {
    backgroundColor: color.cta,
    borderColor: color.cta,
  },
  actionText: {
    ...type.captionMedium,
    color: color.brand,
  },
  actionTextPrimary: {
    color: color.onCta,
  },
  amenities: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.md,
  },
  amenity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceSoftAlt,
  },
  amenityText: {
    ...type.small,
    color: color.text,
  },
  jumps: {
    gap: space.sm,
    paddingVertical: space.lg,
  },
  section: {
    marginTop: space.lg,
    gap: space.md,
  },
  sectionTitle: {
    ...type.h3,
    color: color.text,
  },
  empty: {
    ...type.caption,
    color: color.textSecondary,
  },
  list: {
    gap: space.md,
  },
  menu: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
    alignItems: 'flex-start',
  },
  rule: {
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  vegBox: {
    width: 14,
    height: 14,
    borderWidth: 1.5,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
  vegDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  menuText: {
    flex: 1,
    gap: 2,
  },
  menuName: {
    ...type.bodySemibold,
    color: color.text,
  },
  menuDesc: {
    ...type.caption,
    color: color.textSecondary,
  },
  menuPrice: {
    ...type.captionMedium,
    color: color.text,
    marginTop: 2,
  },
  menuPhoto: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
  },
  gallery: {
    gap: space.sm,
  },
  thumb: {
    width: 160,
    height: 120,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
  },
  aboutCard: {
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    gap: space.md,
  },
  about: {
    ...type.body,
    color: color.text,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  infoText: {
    ...type.caption,
    color: color.textSecondary,
    flex: 1,
  },
  full: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
  },
  viewerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
  },
});
