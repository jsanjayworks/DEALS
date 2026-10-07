/**
 * My Deals: what this person has claimed, booked or asked about, plus what
 * they saved for later.
 *
 * Codes are the point of this screen — it is what someone opens at the
 * counter — so a live action shows its code inline and the QR is one tap away.
 * Cancelling asks first, because it hands the unit back to everyone else.
 */

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import Animated from 'react-native-reanimated';
import { backend, db, RuleViolation, type ActionWithDeal } from '../../data';
import type { DealCardModel, Review } from '../../data/types';
import { ACTION_LABEL, ACTION_STATUS_LABEL, dateLabel, quantityLabel, slotLabel } from '../../lib/format';
import { mintsCode } from '../../domain/rules';
import { PAY_METHOD_LABEL, paymentOf } from '../../lib/payment';
import { RateSheet, StarRow } from '../../reviews/Reviews';
import { hapticTap } from '../../lib/device';
import { useQuery } from '../../lib/useQuery';
import { useOrigin, useViewer } from '../../state/session';
import { color, font, inr, radius, space, status as statusColor, type } from '../../theme/tokens';
import {
  Button,
  Chip,
  DealCard,
  EmptyState,
  Header,
  Icon,
  Sheet,
  StatusPill,
} from '../../components';
import { useHideOnScroll } from '../../ui/chrome';
import { useTabBarSpace } from '../../ui/FloatingTabBar';
import { reach } from '../../lib/a11y';

type Tab = 'active' | 'saved' | 'past';

const ACTION_NOUN: Record<ActionWithDeal['action_type'], string> = {
  claim: 'claim',
  booking: 'booking',
  reserve: 'reservation',
  enquiry: 'enquiry',
  registration: 'registration',
  purchase_intent: 'request',
};

const isTab = (t: string | undefined): t is Tab =>
  t === 'active' || t === 'saved' || t === 'past';

const isLive = (a: ActionWithDeal) => a.status === 'pending' || a.status === 'confirmed';

export default function MyDealsScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(isTab(params.tab) ? params.tab : 'active');
  // The tab stays mounted, so a later link with a different ?tab= has to move
  // it. Adjusting during render avoids an extra effect-driven pass.
  const [seenParam, setSeenParam] = useState(params.tab);
  if (params.tab !== seenParam) {
    setSeenParam(params.tab);
    if (isTab(params.tab)) setTab(params.tab);
  }
  const [qrFor, setQrFor] = useState<ActionWithDeal | null>(null);
  const [cancelFor, setCancelFor] = useState<ActionWithDeal | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [rateFor, setRateFor] = useState<ActionWithDeal | null>(null);
  const origin = useOrigin();
  const { onScroll } = useHideOnScroll();
  const tabSpace = useTabBarSpace();
  const viewer = useViewer();
  // Re-read when the signed-in person changes, demo accounts included.
  const account = viewer?.id ?? null;

  const fetchAll = useCallback(async () => {
    void account;
    void viewer;
    const [actions, saved, reviews] = await Promise.all([
      db.listMyActions(),
      db.listSavedDeals(origin),
      db.listMyReviews().catch(() => [] as Review[]),
    ]);
    return { actions, saved, reviews };
  }, [origin, account, viewer]);
  const { data, loading, reload } = useQuery(fetchAll);

  const actions = data?.actions ?? [];
  const active = actions.filter(isLive);
  const past = actions.filter((a) => !isLive(a));
  const saved = data?.saved ?? [];
  /** Each deal's review by this person, for "You rated it" on used codes. */
  const myReview = (dealId: string) => (data?.reviews ?? []).find((r) => r.deal_id === dealId) ?? null;

  const openDeal = (d: DealCardModel) =>
    router.push({ pathname: '/deal/[id]', params: { id: d.id } });

  const confirmCancel = async () => {
    if (!cancelFor) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await db.cancelAction(cancelFor.id);
      setCancelFor(null);
      reload();
    } catch (e) {
      setCancelError(e instanceof RuleViolation ? e.message : 'Could not cancel. Try again.');
    } finally {
      setCancelling(false);
    }
  };

  const empty = {
    active: {
      icon: 'ticket' as const,
      title: 'Nothing claimed yet',
      body: 'Deals you claim, book or enquire about show up here with their codes.',
    },
    saved: {
      icon: 'heart' as const,
      title: 'No saved deals',
      body: 'Tap the heart on a deal to keep it for later.',
    },
    past: {
      icon: 'clock' as const,
      title: 'No history yet',
      body: 'Redeemed and cancelled deals will be listed here.',
    },
  }[tab];

  if (backend === 'supabase' && !viewer) {
    return (
      <View style={styles.screen}>
        <Header title="My Deals" />
        <EmptyState
          icon="ticket"
          title="Sign in to see your deals"
          body="Your claims, bookings and saved deals live with your account."
          action={<Button onPress={() => router.push('/sign-in')}>Sign in</Button>}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header title="My Deals" />
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          <Chip selected={tab === 'active'} count={active.length} onPress={() => setTab('active')}>
            Active
          </Chip>
          <Chip selected={tab === 'saved'} count={saved.length} onPress={() => setTab('saved')}>
            Saved
          </Chip>
          <Chip selected={tab === 'past'} count={past.length} onPress={() => setTab('past')}>
            Past
          </Chip>
        </ScrollView>
      </View>

      {tab === 'saved' ? (
        <Animated.FlatList
          onScroll={onScroll}
          scrollEventThrottle={16}
          data={saved}
          keyExtractor={(d) => d.id}
          contentContainerStyle={[styles.list, { paddingBottom: tabSpace }]}
          ItemSeparatorComponent={Gap}
          renderItem={({ item }) => (
            <DealCard deal={item} variant="list" onPress={() => openDeal(item)} />
          )}
          ListEmptyComponent={loading ? null : <EmptyState {...empty} action={<BrowseButton />} />}
        />
      ) : (
        <Animated.FlatList
          onScroll={onScroll}
          scrollEventThrottle={16}
          data={tab === 'active' ? active : past}
          keyExtractor={(a) => a.id}
          contentContainerStyle={[styles.list, { paddingBottom: tabSpace }]}
          ItemSeparatorComponent={Gap}
          renderItem={({ item }) => (
            <ActionCard
              action={item}
              onOpen={() => openDeal(item.deal)}
              onShowQr={() => {
                hapticTap();
                setQrFor(item);
              }}
              onCancel={() => {
                setCancelError(null);
                setCancelFor(item);
              }}
              review={myReview(item.deal_id)}
              onRate={() => setRateFor(item)}
            />
          )}
          ListEmptyComponent={
            loading ? null : (
              <EmptyState {...empty} action={tab === 'active' ? <BrowseButton /> : undefined} />
            )
          }
        />
      )}

      <RateSheet
        visible={rateFor !== null}
        actionId={rateFor?.id ?? null}
        title={rateFor ? rateFor.deal.title + ' at ' + rateFor.deal.business.name : ''}
        onClose={() => setRateFor(null)}
        onDone={() => {
          setRateFor(null);
          reload();
        }}
      />

      <Sheet visible={qrFor !== null} onClose={() => setQrFor(null)} title="Show at the counter">
        {qrFor?.redemption_code ? (
          <View style={styles.qrBody}>
            <Text style={styles.qrDeal}>{qrFor.deal.title}</Text>
            <Text style={styles.qrBiz}>{qrFor.deal.business.name}</Text>
            <View style={styles.qrBox}>
              <QRCode
                value={qrFor.redemption_code}
                size={220}
                color={color.text}
                backgroundColor={color.surface}
              />
            </View>
            <Text style={styles.qrCode} selectable>
              {qrFor.redemption_code}
            </Text>
            {qrFor.slot_start ? <Text style={styles.qrMeta}>{slotLabel(qrFor.slot_start)}</Text> : null}
            {paymentOf(qrFor) ? (
              <Text style={styles.qrMeta}>
                Paid {inr(paymentOf(qrFor)!.amount)} · {paymentOf(qrFor)!.order_id}
              </Text>
            ) : null}
            {qrFor.quantity > 1 ? (
              <Text style={styles.qrMeta}>{quantityLabel(qrFor.action_type, qrFor.quantity)}</Text>
            ) : null}
          </View>
        ) : null}
      </Sheet>

      <Sheet
        visible={cancelFor !== null}
        onClose={() => setCancelFor(null)}
        title={'Cancel this ' + (cancelFor ? ACTION_NOUN[cancelFor.action_type] : 'claim') + '?'}
        footer={
          <View style={styles.cancelFooter}>
            <View style={styles.flex}>
              <Button variant="secondary" full onPress={() => setCancelFor(null)}>
                Keep it
              </Button>
            </View>
            <View style={styles.flex}>
              <Button full loading={cancelling} onPress={() => void confirmCancel()}>
                Yes, cancel
              </Button>
            </View>
          </View>
        }
      >
        <Text style={styles.cancelBody}>
          {cancelFor
            ? (mintsCode(cancelFor.action_type)
                ? 'Your code for ' + cancelFor.deal.title + ' will stop working, and the spot goes back to other people. '
                : 'Your request for ' + cancelFor.deal.title + ' will be withdrawn. ') +
              (paymentOf(cancelFor) ? 'The ' + inr(paymentOf(cancelFor)!.amount) + ' you paid is refunded (mock). ' : '') +
              (cancelFor.deal.cancellation_policy ?? '')
            : ''}
        </Text>
        {cancelError ? <Text style={styles.cancelError}>{cancelError}</Text> : null}
      </Sheet>
    </View>
  );
}

function BrowseButton() {
  return <Button onPress={() => router.navigate('/')}>Browse deals</Button>;
}

function Gap() {
  return <View style={{ height: space.md }} />;
}

function ActionCard({
  action,
  onOpen,
  onShowQr,
  onCancel,
  review,
  onRate,
}: {
  action: ActionWithDeal;
  onOpen: () => void;
  onShowQr: () => void;
  onCancel: () => void;
  review: Review | null;
  onRate: () => void;
}) {
  const live = isLive(action);
  const d = action.deal;
  const paid = paymentOf(action);
  const detail = [
    ACTION_LABEL[action.action_type],
    quantityLabel(action.action_type, action.quantity),
    dateLabel(action.created_at),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={[styles.card, !live && styles.cardPast]}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={d.title + ', ' + d.business.name}
        style={styles.cardHead}
      >
        <Image source={{ uri: d.image }} style={styles.thumb} contentFit="cover" />
        <View style={styles.cardText}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {d.title}
          </Text>
          <Text style={styles.cardBiz} numberOfLines={1}>
            {d.business.name}
          </Text>
          <Text style={styles.cardDetail} numberOfLines={1}>
            {detail}
          </Text>
        </View>
        <StatusPill label={ACTION_STATUS_LABEL[action.status]} />
      </Pressable>

      {action.slot_start ? (
        <View style={styles.slot}>
          <Icon name="clock" size={14} color={color.brand} />
          <Text style={styles.slotText}>{slotLabel(action.slot_start)}</Text>
        </View>
      ) : null}

      {paid ? (
        <View style={styles.paid}>
          <Icon name="check" size={14} color={statusColor.active.fg} strokeWidth={2.2} />
          <Text style={styles.paidText} numberOfLines={1}>
            Paid {inr(paid.amount)} by {PAY_METHOD_LABEL[paid.method]} · {paid.order_id}
          </Text>
        </View>
      ) : null}

      {live && action.redemption_code ? (
        <Pressable
          onPress={onShowQr}
          accessibilityRole="button"
          accessibilityLabel={'Code ' + action.redemption_code + '. Show QR code'}
          style={({ pressed }) => [styles.code, pressed && { opacity: 0.8 }]}
        >
          <View>
            <Text style={styles.codeLabel}>Your code</Text>
            <Text style={styles.codeValue}>{action.redemption_code}</Text>
          </View>
          <View style={styles.qrButton}>
            <Icon name="qr" size={20} color={color.white} />
            <Text style={styles.qrButtonText}>Show QR</Text>
          </View>
        </Pressable>
      ) : null}

      {live && action.action_type === 'enquiry' ? (
        <Text style={styles.waiting}>Waiting for {d.business.name} to reply.</Text>
      ) : null}

      {action.status === 'redeemed' ? (
        review ? (
          <View style={styles.rated}>
            <Text style={styles.ratedText}>You rated it</Text>
            <StarRow rating={review.rating} size={14} />
          </View>
        ) : (
          <Pressable
            onPress={onRate}
            accessibilityRole="button"
            style={({ pressed }) => [styles.rateButton, pressed && { opacity: 0.8 }]}
          >
            <Icon name="star" size={16} color={color.onCta} filled />
            <Text style={styles.rateText}>Rate your visit</Text>
          </Pressable>
        )
      ) : null}

      {live ? (
        <View style={styles.cardActions}>
          <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={8} style={reach(8)}>
            <Text style={styles.cancelLink}>Cancel</Text>
          </Pressable>
          <Text style={styles.validity}>Valid until {dateLabel(d.ends_at)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.background,
  },
  tabs: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.sm,
  },
  list: {
    paddingHorizontal: space.lg,
    flexGrow: 1,
    // Codes read best in one column; on a wide screen keep it centred, not stretched.
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.md,
    gap: space.md,
  },
  cardPast: {
    opacity: 0.75,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
  },
  cardText: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    ...type.bodySemibold,
    color: color.text,
  },
  cardBiz: {
    ...type.small,
    color: color.textSecondary,
  },
  cardDetail: {
    ...type.small,
    color: color.textMuted,
    marginTop: 2,
  },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  slotText: {
    ...type.captionMedium,
    color: color.brand,
  },
  code: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.surfaceSoft,
    backgroundColor: color.surfaceSoftAlt,
  },
  codeLabel: {
    ...type.overline,
    color: color.textSecondary,
  },
  codeValue: {
    fontFamily: font.bold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: 1.5,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  qrButton: {
    alignItems: 'center',
    gap: 2,
    padding: space.sm,
    borderRadius: radius.lg,
    backgroundColor: color.brand,
    minWidth: 72,
  },
  qrButtonText: {
    ...type.tiny,
    color: color.white,
  },
  waiting: {
    ...type.caption,
    color: color.textSecondary,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rated: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md,
  },
  ratedText: {
    ...type.captionMedium,
    color: color.textSecondary,
  },
  rateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.sm,
    height: 40,
    paddingHorizontal: space.lg,
    marginTop: space.md,
    borderRadius: radius.pill,
    backgroundColor: color.cta,
  },
  rateText: {
    ...type.captionMedium,
    color: color.onCta,
  },
  paid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.sm,
  },
  paidText: {
    ...type.captionMedium,
    color: statusColor.active.fg,
    flex: 1,
  },
  cancelLink: {
    ...type.captionMedium,
    fontFamily: font.semibold,
    color: color.alert,
  },
  validity: {
    ...type.small,
    color: color.textMuted,
  },
  qrBody: {
    alignItems: 'center',
    paddingBottom: space.lg,
  },
  qrDeal: {
    ...type.bodySemibold,
    color: color.text,
    textAlign: 'center',
  },
  qrBiz: {
    ...type.small,
    color: color.textSecondary,
  },
  qrBox: {
    marginTop: space.xl,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  qrCode: {
    fontFamily: font.bold,
    fontSize: 26,
    lineHeight: 34,
    letterSpacing: 2,
    color: color.text,
    marginTop: space.lg,
  },
  qrMeta: {
    ...type.caption,
    color: color.textSecondary,
  },
  cancelFooter: {
    flexDirection: 'row',
    gap: space.md,
  },
  flex: {
    flex: 1,
  },
  cancelBody: {
    ...type.body,
    color: color.textSecondary,
  },
  cancelError: {
    ...type.captionMedium,
    color: color.alert,
    marginTop: space.md,
  },
});
