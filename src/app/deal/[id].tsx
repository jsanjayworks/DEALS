/**
 * Deal details.
 *
 * Everything a person needs to decide, in the order they decide it: what it
 * is and what it costs, whether they can still get it (capacity, time left,
 * eligibility), where it is, and the small print. The action bar stays pinned
 * and already knows whether the action is allowed, using the same rules the
 * database will apply.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { db } from '../../data';
import type { AttributeValue, CtaType, DealCardModel } from '../../data/types';
import { dealParty } from '../../data/party';
import { dealVehicleTags, vehicleFitLabel } from '../../data/vehicles';
import { ctaLabel, ctaToActionType } from '../../data/mapping';
import { checkAction } from '../../domain/rules';
import {
  availabilityLabel,
  badgeFor,
  DEAL_TYPE_LABEL,
} from '../../lib/format';
import {
  callPhone,
  formatPhone,
  hapticTap,
  openDirections,
  openWhatsApp,
  shareDeal,
} from '../../lib/device';
import { useQuery } from '../../lib/useQuery';
import { openVoice } from '../../voice/VoiceHost';
import { track } from '../../lib/track';
import { RatingSummary, ReviewCard } from '../../reviews/Reviews';
import { ClaimSheet, type ClaimPrefill } from '../../deal/ClaimSheet';
import { DealTiles } from '../../deal/DealTiles';
import { MAX_CONTENT_WIDTH, useLayout } from '../../ui/layout';
import { useOrigin, useViewer } from '../../state/session';
import { alpha, color, distanceLabel, font, inr, radius, shadow, space, type } from '../../theme/tokens';
import {
  Badge,
  Button,
  DealStatusPill,
  DiscountBadge,
  EmptyState,
  Header,
  Icon,
  type IconName,
  Sheet,
  VerifiedBadge,
} from '../../components';
import { pressedProps } from '../../lib/a11y';
import { toast } from '../../ui/Toast';

const HERO_HEIGHT = 300;
/** Space either side of the photo card on a phone. */
const HERO_INSET = 14;

/** CTAs that leave the app instead of writing a customer action. */
const OUTBOUND: CtaType[] = ['call', 'chat', 'directions', 'visit'];

const REPORT_REASONS = [
  'Price or offer is wrong',
  'Business refused the deal',
  'Deal has ended',
  'Misleading or fake',
  'Offensive content',
];

const AUDIENCE_LABEL: Record<string, string> = {
  verified: 'YOLO verified users only',
  members: 'Members only',
  new_customers: 'New customers only',
  existing_customers: 'Existing customers only',
};

function eligibilityLines(deal: DealCardModel): string[] {
  const e = deal.eligibility;
  const lines: string[] = [];
  const party = dealParty(deal.attributes);
  if (party) {
    lines.push(
      party[0] === party[1]
        ? 'Priced for ' + party[0] + (party[0] === 1 ? ' person' : ' people')
        : 'Priced for a group of ' + party[0] + ' to ' + party[1],
    );
  }
  const fits = vehicleFitLabel(dealVehicleTags(deal.attributes));
  if (fits) lines.push('For ' + fits);
  if (e.audience !== 'everyone') lines.push(AUDIENCE_LABEL[e.audience] ?? e.audience);
  if (e.min_age != null) lines.push(e.min_age + '+ only. Carry a photo ID.');
  if (e.min_spend != null) lines.push('Minimum spend ' + inr(e.min_spend));
  if (e.membership_required) lines.push('Membership required');
  if (e.advance_booking_hours != null) {
    lines.push('Book at least ' + e.advance_booking_hours + ' hours ahead');
  }
  if (deal.max_qty_per_customer != null) {
    lines.push('Up to ' + deal.max_qty_per_customer + ' per customer');
  }
  // The same amount as the minimum spend is said once.
  if (deal.min_purchase != null && deal.min_purchase !== e.min_spend) {
    lines.push('Minimum purchase ' + inr(deal.min_purchase));
  }
  if (e.custom_rule) lines.push(e.custom_rule);
  return lines;
}

/** Shown elsewhere on the page: group size and vehicles under "Who can use it". */
const NOT_A_TAG = new Set(['party_min', 'party_max', 'vehicles', 'slot_capacity']);

function attributeLabel(key: string, value: AttributeValue): string | null {
  if (value === false || NOT_A_TAG.has(key) || Array.isArray(value)) return null;
  const k = key.replace(/_/g, ' ');
  if (value === true) return k.charAt(0).toUpperCase() + k.slice(1);
  if (key === 'bhk') return value + ' BHK';
  return k.charAt(0).toUpperCase() + k.slice(1) + ': ' + value;
}

export default function DealDetailScreen() {
  // take=1 (with day, time, qty) comes from the voice assistant: open the sheet set up.
  // from and pos say where it was opened (a Home rail, search, voice…), for activity.
  const { id, take, day, time, qty, from, pos } = useLocalSearchParams<{
    id: string;
    take?: string;
    day?: string;
    time?: string;
    qty?: string;
    from?: string;
    pos?: string;
  }>();
  const takeKey = take === '1' ? [id, day, time, qty].join('|') : null;
  const [handledTake, setHandledTake] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<ClaimPrefill | null>(null);
  const insets = useSafeAreaInsets();
  const layout = useLayout();
  const wide = layout.isExpanded;
  const origin = useOrigin();
  const viewer = useViewer();
  // Re-read when the signed-in person changes, demo accounts included.
  const account = viewer?.id ?? null;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [savedOverride, setSavedOverride] = useState<boolean | null>(null);

  // Once the photo scrolls away, a solid bar with the title fades in behind
  // the round buttons, so they never float over the text below.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, wide ? [0, 40] : [HERO_HEIGHT - 130, HERO_HEIGHT - 60], [0, 1], 'clamp'),
  }));

  const fetchDeal = useCallback(async () => {
    void account;
    const [deal, saved, actions] = await Promise.all([
      db.getDeal(String(id), origin),
      db.listSavedDeals(),
      db.listMyActions(),
    ]);
    const reviews = deal ? await db.listReviews({ businessId: deal.business.id }, 30).catch(() => []) : [];
    return { deal, saved: saved.some((d) => d.id === id), actions, reviews };
  }, [id, origin, account]);

  const { data, loading, reload } = useQuery(fetchDeal);
  const deal = data?.deal ?? null;

  // One open per deal page, wherever it came from (a link, a rail, voice).
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!deal || opened.current === deal.id) return;
    opened.current = deal.id;
    track({
      name: 'deal_open',
      deal_id: deal.id,
      surface: from ?? (take === '1' ? 'voice' : 'deeplink'),
      position: pos ? Number(pos) : undefined,
    });
  }, [deal, from, pos, take]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={[styles.hero, styles.heroSkeleton]} />
      </View>
    );
  }

  if (!deal) {
    return (
      <View style={styles.screen}>
        <Header title="Deal" onBack={() => router.back()} />
        <EmptyState
          icon="x"
          tone="alert"
          title="Deal not found"
          body="It may have ended or been paused by the business."
          action={<Button onPress={() => router.dismissTo('/')}>Browse deals</Button>}
        />
      </View>
    );
  }

  const saved = savedOverride ?? data?.saved ?? false;
  const actions = data?.actions ?? [];
  const flag = badgeFor(deal);
  const discount = Math.round(deal.discount_pct ?? 0);
  const saving =
    deal.original_price != null && deal.deal_price != null
      ? deal.original_price - deal.deal_price
      : 0;

  const primary = deal.primary_cta;
  const isOutbound = OUTBOUND.includes(primary);
  const actionType = ctaToActionType(primary);
  const needsSlot =
    actionType === 'booking' ||
    actionType === 'reserve' ||
    actionType === 'registration' ||
    (deal.booking_required && actionType !== 'enquiry');

  const live = actions.find(
    (a) =>
      a.deal_id === deal.id &&
      a.action_type !== 'enquiry' &&
      (a.status === 'pending' || a.status === 'confirmed'),
  );

  // Slot-based actions skip the "open right now" check here; the sheet applies
  // the real check once a time is chosen.
  const verdict = isOutbound
    ? { ok: true, reason: null, fixable: false }
    : checkAction({
        deal,
        viewer,
        actionType,
        slotStart: needsSlot ? '2999-01-01T00:00:00.000Z' : null,
        existing: actions,
      });

  const tapped = (cta: string) => track({ name: 'cta_tap', deal_id: deal.id, props: { cta } });

  const runOutbound = (cta: CtaType) => {
    hapticTap();
    tapped(cta);
    if (cta === 'call') callPhone(deal.business.phone);
    else if (cta === 'chat') openWhatsApp(deal.business.phone, 'Hi, about "' + deal.title + '" on YOLO Deals');
    else openDirections(deal.location);
  };

  // Signed out on Supabase: the button leads to sign-in instead of sitting disabled.
  const needsSignIn = !live && !verdict.ok && verdict.reason === 'Sign in to continue';

  // Opened by the voice assistant to book: once per request, open the sheet with its choices.
  if (takeKey && handledTake !== takeKey) {
    setHandledTake(takeKey);
    if (!needsSignIn && !live && !isOutbound) {
      // "For 4" on a deal already sized for 4 is one table; otherwise it is how many.
      const sized = dealParty(deal.attributes);
      const people = qty ? Number(qty) : undefined;
      const quantity = sized && people && people >= sized[0] && people <= sized[1] ? 1 : people;
      setPrefill({ day, time, quantity });
      setSheetOpen(true);
    }
  }

  const onPrimary = () => {
    if (needsSignIn) {
      router.push('/sign-in');
      return;
    }
    if (live) {
      router.push('/my-deals');
      return;
    }
    if (isOutbound) runOutbound(primary);
    else {
      track({ name: 'checkout_start', deal_id: deal.id, props: { action: actionType } });
      setSheetOpen(true);
    }
  };

  const toggleSave = async () => {
    hapticTap();
    track({ name: saved ? 'unsave' : 'save', deal_id: deal.id });
    setSavedOverride(!saved);
    try {
      const nowSaved = await db.toggleSavedDeal(deal.id);
      setSavedOverride(nowSaved);
      toast(nowSaved ? 'Saved to your list' : 'Removed from saved', nowSaved ? 'heart' : 'check');
    } catch {
      setSavedOverride(saved);
    }
  };

  const report = async (reason: string) => {
    await db.reportTarget('deal', deal.id, reason);
    setReported(true);
  };

  const lowStock =
    deal.capacity_remaining != null &&
    deal.capacity_total != null &&
    deal.capacity_remaining <= Math.max(5, deal.capacity_total * 0.2);

  // Call and directions already sit on the phone and address rows above, so
  // the only extra button is a chat, when the business offers one.
  const quickActions = (['chat'] as CtaType[]).filter(
    (c) => c !== primary && deal.secondary_ctas.includes(c),
  );

  const eligibility = eligibilityLines(deal);
  const attributes = Object.entries(deal.attributes)
    .map(([k, v]) => attributeLabel(k, v))
    .filter((x): x is string => x !== null);

  const actionBar = (
    <View
      style={[
        styles.bar,
        wide ? styles.barInline : { paddingBottom: Math.max(insets.bottom, space.md) },
      ]}
    >
      {!verdict.ok && !live && !needsSignIn ? (
        <Text style={styles.barReason} accessibilityLiveRegion="polite">
          {verdict.reason}
          {verdict.reason === 'This deal is not available right now'
            ? ' · ' + availabilityLabel(deal.availability)
            : ''}
        </Text>
      ) : null}
      <View style={styles.barRow}>
        <View style={styles.barPrice}>
          <Text style={styles.barNow}>
            {deal.deal_price === 0 ? 'Free' : inr(deal.deal_price ?? 0)}
            {deal.price_unit ? <Text style={styles.unit}>{deal.price_unit}</Text> : null}
          </Text>
          {live ? (
            <Text style={styles.barSub}>Already yours</Text>
          ) : deal.capacity_remaining != null ? (
            <Text style={[styles.barSub, lowStock && { color: color.alert }]}>
              {deal.capacity_remaining} left
            </Text>
          ) : null}
        </View>
        <View style={styles.barButton}>
          <Button
            variant={live ? 'secondary' : 'cta'}
            full
            disabled={!live && !verdict.ok && !needsSignIn}
            onPress={onPrimary}
          >
            {live ? 'View your code' : needsSignIn ? 'Sign in to continue' : ctaLabel(primary)}
          </Button>
        </View>
      </View>
    </View>
  );

  // On a wide screen the photo and the details sit side by side, and the action
  // bar moves into the details column instead of spanning the window.
  const sideInset = wide ? layout.gutter + Math.max(0, (layout.width - MAX_CONTENT_WIDTH) / 2) : 0;

  return (
    <View style={styles.screen}>
      <Head>
        <title>{deal.title + ' · ' + deal.business.name + ' · YOLO Deals'}</title>
        <meta name="description" content={deal.short_description} />
      </Head>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={
          wide
            ? [styles.wideContent, { paddingTop: insets.top + 76, paddingHorizontal: sideInset }]
            : { paddingBottom: 120 + insets.bottom }
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, wide ? styles.heroWide : [styles.heroCard, { marginTop: insets.top + 6 }]]}>
          <Image
            source={{ uri: deal.image }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
            accessibilityLabel={deal.title}
          />
          <View style={styles.heroScrim} />
        </View>

        <View style={[styles.sheet, wide && styles.sheetWide]}>
          <View style={styles.badges}>
            {deal.deal_price !== 0 ? <DiscountBadge percent={discount} /> : null}
            {flag ? <Badge kind={flag} /> : null}
            {deal.status !== 'ACTIVE' ? <DealStatusPill status={deal.status} /> : null}
          </View>

          <Text style={styles.overline}>
            {(DEAL_TYPE_LABEL[deal.deal_type_code] ?? deal.deal_type_code) + ' · ' + deal.category.name}
          </Text>
          <Text style={styles.title} accessibilityRole="header">
            {deal.title}
          </Text>
          <Text style={styles.short}>{deal.short_description}</Text>

          <Pressable
            onPress={() => router.push({ pathname: '/shop/[id]', params: { id: deal.business.id } })}
            accessibilityRole="link"
            accessibilityLabel={'Open ' + deal.business.name + ', menu, photos and reviews'}
            style={({ pressed }) => [styles.bizRow, pressed && { opacity: 0.8 }]}
          >
            <View style={styles.bizAvatar}>
              <Text style={styles.bizInitial}>{deal.business.name.charAt(0)}</Text>
            </View>
            <View style={styles.bizText}>
              <View style={styles.bizNameRow}>
                <Text style={styles.bizName} numberOfLines={1}>
                  {deal.business.name}
                </Text>
                {deal.is_verified ? <VerifiedBadge compact /> : null}
              </View>
              <View style={styles.bizMeta}>
                {deal.business.rating_avg > 0 ? (
                  <>
                    <Icon name="star" size={13} color={color.star} filled />
                    <Text style={styles.metaText}>
                      {deal.business.rating_avg.toFixed(1)} ({deal.business.rating_count})
                    </Text>
                    <Text style={styles.metaDot}>·</Text>
                  </>
                ) : null}
                <Text style={styles.metaText}>
                  {distanceLabel(deal.distance_km)} · {deal.locality_name}
                </Text>
              </View>
            </View>
            <Text style={styles.bizLink}>Menu, photos ›</Text>
          </Pressable>

          <DealTiles
            deal={deal}
            saving={saving}
            lowStock={lowStock}
            onDirections={() => {
              tapped('directions');
              openDirections(deal.location);
            }}
          />

          {wide ? actionBar : null}

          <View style={styles.infoList}>
            <InfoRow
              icon="pin"
              title={deal.business.address_line}
              detail={deal.locality_name}
              onPress={() => {
                tapped('directions');
                openDirections(deal.location);
              }}
              actionLabel="Map"
            />
            {deal.business.phone ? (
              <InfoRow
                icon="phone"
                title={formatPhone(deal.business.phone)}
                detail="Call the business"
                onPress={() => {
                  tapped('call');
                  callPhone(deal.business.phone);
                }}
                actionLabel="Call"
              />
            ) : null}
          </View>

          {quickActions.length > 0 ? (
            <View style={styles.quick}>
              {quickActions.map((c) => (
                <View key={c} style={styles.quickItem}>
                  <Button
                    variant="secondary"
                    small
                    full
                    icon={c === 'call' ? 'phone' : c === 'chat' ? 'chat' : 'map'}
                    onPress={() => runOutbound(c)}
                  >
                    {ctaLabel(c)}
                  </Button>
                </View>
              ))}
            </View>
          ) : null}

          <Block title="About this deal">
            <Text style={styles.para}>{deal.description}</Text>
            {attributes.length > 0 || deal.tags.length > 0 ? (
              <View style={styles.tags}>
                {attributes.map((a) => (
                  <View key={a} style={styles.tag}>
                    <Text style={styles.tagText}>{a}</Text>
                  </View>
                ))}
                {deal.tags.map((t) => (
                  <View key={'t-' + t} style={[styles.tag, styles.tagSoft]}>
                    <Text style={styles.tagTextSoft}>#{t}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Block>

          <Block title="Who can use it">
            {eligibility.length === 0 ? (
              <Bullet>Open to everyone</Bullet>
            ) : (
              eligibility.map((l) => <Bullet key={l}>{l}</Bullet>)
            )}
          </Block>

          {deal.terms || deal.cancellation_policy ? (
            <Block title="Terms">
              {deal.terms ? <Text style={styles.para}>{deal.terms}</Text> : null}
              {deal.cancellation_policy ? (
                <Text style={[styles.para, { marginTop: space.sm }]}>
                  <Text style={{ fontFamily: font.semibold }}>Cancellation: </Text>
                  {deal.cancellation_policy}
                </Text>
              ) : null}
            </Block>
          ) : null}

          <Block title="Ratings and reviews">
            <RatingSummary
              avg={deal.business.rating_avg}
              count={deal.business.rating_count}
              reviews={data?.reviews ?? []}
            />
            <View style={styles.reviewList}>
              {(data?.reviews ?? []).slice(0, 3).map((r) => (
                <ReviewCard key={r.id} review={r} />
              ))}
            </View>
            {(data?.reviews ?? []).length > 3 ? (
              <Pressable
                onPress={() => router.push({ pathname: '/shop/[id]', params: { id: deal.business.id } })}
                accessibilityRole="link"
                style={styles.reviewMore}
              >
                <Text style={styles.bizLink}>See all {(data?.reviews ?? []).length} reviews ›</Text>
              </Pressable>
            ) : null}
          </Block>

          <Pressable
            onPress={() => setReportOpen(true)}
            accessibilityRole="button"
            style={styles.reportLink}
            hitSlop={8}
          >
            <Icon name="shield" size={16} color={color.textSecondary} />
            <Text style={styles.reportText}>Report this deal</Text>
          </Pressable>
        </View>
      </Animated.ScrollView>

      {/* Floating controls: over the photo on a phone, a toolbar row on a wide screen */}
      <View
        style={[
          styles.topBar,
          wide
            ? { paddingTop: insets.top + space.sm, paddingHorizontal: sideInset }
            : { paddingTop: insets.top + 18, paddingHorizontal: HERO_INSET + 12 },
        ]}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.topBackdrop, backdropStyle]} pointerEvents="none">
          <Text
            // Clear of the back button on the left and share + save on the right.
            style={[
              styles.topTitle,
              {
                marginLeft: (wide ? sideInset : HERO_INSET + 12) + 56,
                marginRight: (wide ? sideInset : HERO_INSET + 12) + 112,
              },
            ]}
            numberOfLines={1}
          >
            {deal.title}
          </Text>
        </Animated.View>
        <RoundButton icon="back" label="Go back" onPress={() => router.back()} />
        <View style={styles.topRight}>
          <RoundButton icon="mic" label="Ask by voice" onPress={openVoice} />
          <RoundButton
            icon="share"
            label="Share"
            onPress={() => {
              track({ name: 'share', deal_id: deal.id });
              void shareDeal(deal).then((r) => {
                if (r === 'copied') toast('Link copied. Paste it anywhere to share.', 'share');
              });
            }}
          />
          <RoundButton
            icon="heart"
            label={saved ? 'Remove from saved' : 'Save deal'}
            onPress={() => void toggleSave()}
            active={saved}
          />
        </View>
      </View>

      {/* Sticky action bar on a phone; inline in the details column when wide */}
      {wide ? null : actionBar}

      {!isOutbound ? (
        <ClaimSheet
          visible={sheetOpen}
          prefill={prefill}
          deal={deal}
          actionType={actionType}
          existing={actions}
          onClose={() => {
            setSheetOpen(false);
            setPrefill(null);
          }}
          onTaken={() => reload()}
          onViewMyDeals={() => {
            setSheetOpen(false);
            router.push('/my-deals');
          }}
        />
      ) : null}

      <Sheet
        visible={reportOpen}
        onClose={() => {
          setReportOpen(false);
          setReported(false);
        }}
        title={reported ? 'Thanks for telling us' : 'What’s wrong?'}
      >
        {reported ? (
          <Text style={styles.para}>
            The YOLO team reviews every report. If the deal breaks the rules it will be taken down.
          </Text>
        ) : (
          REPORT_REASONS.map((r) => (
            <Pressable
              key={r}
              onPress={() => void report(r)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.reportRow, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.reportRowText}>{r}</Text>
              <Icon name="chev" size={16} color={color.textMuted} />
            </Pressable>
          ))
        )}
      </Sheet>
    </View>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  active,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(active !== undefined ? pressedProps(active) : {})}
      style={({ pressed }) => [styles.round, pressed && { opacity: 0.8 }]}
    >
      <Icon
        name={icon}
        size={20}
        color={active ? color.alert : color.text}
        filled={active}
      />
    </Pressable>
  );
}

function InfoRow({
  icon,
  title,
  detail,
  onPress,
  actionLabel,
  alert,
}: {
  icon: IconName;
  title: string;
  detail?: string;
  onPress?: () => void;
  actionLabel?: string;
  alert?: boolean;
}) {
  const body = (
    <>
      <View style={styles.infoIcon}>
        <Icon name={icon} size={18} color={color.brand} />
      </View>
      <View style={styles.infoText}>
        <Text style={styles.infoTitle}>{title}</Text>
        {detail ? (
          <Text style={[styles.infoDetail, alert && { color: color.alert }]}>{detail}</Text>
        ) : null}
      </View>
      {actionLabel ? <Text style={styles.infoAction}>{actionLabel}</Text> : null}
    </>
  );
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={actionLabel ? actionLabel + ': ' + title : title}
      style={({ pressed }) => [styles.infoRow, pressed && { opacity: 0.6 }]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={styles.infoRow}>{body}</View>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <View style={styles.bullet}>
      <Icon name="check" size={16} color={color.brand} strokeWidth={2} />
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.surface,
  },
  hero: {
    height: HERO_HEIGHT,
    backgroundColor: color.surfaceSoftAlt,
  },
  heroSkeleton: {
    backgroundColor: color.surfaceSoftAlt,
  },
  heroCard: {
    marginHorizontal: HERO_INSET,
    borderRadius: 30,
    overflow: 'hidden',
  },
  heroScrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: alpha(color.text, 0.08),
  },
  wideContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 40,
    paddingBottom: 64,
  },
  heroWide: {
    flex: 1.15,
    height: 560,
    borderRadius: 28,
    overflow: 'hidden',
  },
  sheetWide: {
    flex: 1,
    marginTop: 0,
    paddingTop: space.sm,
    paddingHorizontal: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    backgroundColor: 'transparent',
  },
  barInline: {
    position: 'relative',
    marginTop: space.xl,
    paddingBottom: space.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.border,
  },
  sheet: {
    paddingHorizontal: space.lg + 2,
    paddingTop: space.lg,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginBottom: space.md,
  },
  overline: {
    ...type.overline,
    color: color.textSecondary,
  },
  title: {
    ...type.h1,
    color: color.text,
    marginTop: 4,
  },
  short: {
    ...type.body,
    color: color.textSecondary,
    marginTop: space.xs,
  },
  bizRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.lg,
  },
  bizAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.surfaceSoftAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bizInitial: {
    fontFamily: font.bold,
    fontSize: 16,
    color: color.brandStrong,
  },
  bizText: {
    flex: 1,
    minWidth: 0,
  },
  bizNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bizName: {
    ...type.bodySemibold,
    color: color.text,
    flexShrink: 1,
  },
  bizMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  metaText: {
    ...type.small,
    color: color.textSecondary,
  },
  metaDot: {
    ...type.small,
    color: color.textMuted,
    marginHorizontal: 2,
  },
  priceBlock: {
    marginTop: space.xl,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
  },
  price: {
    fontFamily: font.bold,
    fontSize: 28,
    lineHeight: 36,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontFamily: font.medium,
    fontSize: 13,
    color: color.textSecondary,
  },
  was: {
    ...type.body,
    color: color.textMuted,
    textDecorationLine: 'line-through',
    fontVariant: ['tabular-nums'],
  },
  save: {
    ...type.captionMedium,
    color: color.accentText,
    marginTop: 2,
  },
  taxes: {
    ...type.small,
    color: color.textSecondary,
    marginTop: 2,
  },
  capacity: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
    gap: space.sm,
  },
  capacityHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  capacityLabel: {
    ...type.captionMedium,
    fontFamily: font.semibold,
    color: color.text,
  },
  capacityOf: {
    ...type.small,
    color: color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: color.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: color.brand,
  },
  infoList: {
    marginTop: space.lg,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    minHeight: 56,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.surfaceSoftAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    flex: 1,
  },
  infoTitle: {
    ...type.bodyMedium,
    color: color.text,
  },
  infoDetail: {
    ...type.small,
    color: color.textSecondary,
    marginTop: 1,
  },
  infoAction: {
    ...type.captionMedium,
    fontFamily: font.semibold,
    color: color.brand,
  },
  quick: {
    flexDirection: 'row',
    gap: space.sm,
    marginBottom: space.xl,
  },
  quickItem: {
    flex: 1,
  },
  block: {
    marginTop: space.md,
    padding: space.lg,
    borderRadius: radius.xxl - 2,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  blockTitle: {
    ...type.h3,
    color: color.text,
    marginBottom: space.sm,
  },
  para: {
    ...type.body,
    color: color.textSecondary,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.md,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceSoftAlt,
  },
  tagText: {
    ...type.smallMedium,
    color: color.brandStrong,
  },
  tagSoft: {
    backgroundColor: color.surfaceSoftAlt,
  },
  tagTextSoft: {
    ...type.smallMedium,
    color: color.textSecondary,
  },
  bullet: {
    flexDirection: 'row',
    gap: space.sm,
    paddingVertical: 4,
  },
  bulletText: {
    ...type.body,
    color: color.text,
    flex: 1,
  },
  bizLink: {
    ...type.captionMedium,
    color: color.brand,
  },
  reviewList: {
    gap: space.md,
    marginTop: space.md,
  },
  reviewMore: {
    marginTop: space.sm,
    alignSelf: 'flex-start',
  },
  reportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: space.xxl,
    alignSelf: 'flex-start',
    minHeight: 44,
  },
  reportText: {
    ...type.captionMedium,
    color: color.textSecondary,
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  reportRowText: {
    ...type.body,
    color: color.text,
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: 10,
  },
  topBackdrop: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    paddingBottom: 21,
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  topTitle: {
    ...type.bodySemibold,
    color: color.text,
  },
  topRight: {
    flexDirection: 'row',
    gap: space.sm,
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.raised,
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.border,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    ...shadow.sheet,
  },
  barReason: {
    ...type.captionMedium,
    color: color.alert,
    marginBottom: space.sm,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  barPrice: {
    minWidth: 80,
  },
  barNow: {
    fontFamily: font.bold,
    fontSize: 20,
    lineHeight: 26,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  barSub: {
    ...type.small,
    color: color.textSecondary,
  },
  barButton: {
    flex: 1,
  },
});
