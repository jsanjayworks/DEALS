/**
 * One deal, from the merchant's side: where it is in the lifecycle, what they
 * can do with it next, how it is performing, and who has taken it.
 *
 * The buttons come from domain/lifecycle, the mirror of deal_transitions, so a
 * merchant is only ever offered a move the database will accept.
 */

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { db, RuleViolation } from '../../../data';
import type { CustomerAction, DealStatus } from '../../../data/types';
import { STATUS_LABEL, isEditable, nextStatuses } from '../../../domain/lifecycle';
import {
  ACTION_LABEL,
  ACTION_STATUS_LABEL,
  availabilityLabel,
  capacityFraction,
  dateLabel,
  endsInLabel,
  shortAgo,
  slotLabel,
} from '../../../lib/format';
import { hapticSuccess } from '../../../lib/device';
import { useQuery } from '../../../lib/useQuery';
import { color, font, inr, radius, space, status as statusColor, type } from '../../../theme/tokens';
import {
  Button,
  DealStatusPill,
  EmptyState,
  Header,
  Icon,
  Sheet,
  StatusPill,
} from '../../../components';

/** The happy path, in order. PAUSED and REJECTED are shown as detours from it. */
const PATH: DealStatus[] = ['DRAFT', 'SUBMITTED', 'VERIFICATION', 'APPROVED', 'PUBLISHED', 'ACTIVE', 'EXPIRED'];

const STEP_NOTE: Partial<Record<DealStatus, string>> = {
  DRAFT: 'You are still editing',
  SUBMITTED: 'Waiting for the YOLO team',
  VERIFICATION: 'Being checked',
  APPROVED: 'Approved, going live shortly',
  PUBLISHED: 'Visible, starts on its start date',
  ACTIVE: 'Live for customers nearby',
  EXPIRED: 'Ended',
};

function reachedIndex(s: DealStatus): number {
  if (s === 'PAUSED') return PATH.indexOf('ACTIVE');
  if (s === 'REJECTED') return PATH.indexOf('VERIFICATION');
  if (s === 'COMPLETED' || s === 'ARCHIVED') return PATH.length - 1;
  return PATH.indexOf(s);
}

export default function MerchantDealScreen() {
  const { id, submitted } = useLocalSearchParams<{ id: string; submitted?: string }>();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const fetchAll = useCallback(async () => {
    const [deal, history, actions] = await Promise.all([
      db.getDeal(String(id)),
      db.getDealHistory(String(id)),
      db.listDealActions(String(id)).catch(() => [] as CustomerAction[]),
    ]);
    return { deal, history, actions };
  }, [id]);
  const { data, loading, reload } = useQuery(fetchAll);
  const deal = data?.deal ?? null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setActionError(e instanceof RuleViolation ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <Header title="Deal" dark onBack={() => router.back()} />
      </View>
    );
  }

  if (!deal) {
    return (
      <View style={styles.screen}>
        <Header title="Deal" dark onBack={() => router.back()} />
        <EmptyState icon="x" tone="alert" title="Deal not found" body="It may have been archived." />
      </View>
    );
  }

  const moves = nextStatuses(deal.status, 'merchant');
  const actions = data?.actions ?? [];
  const taken = actions.filter((a) => a.status !== 'cancelled');
  const redeemed = actions.filter((a) => a.status === 'redeemed');
  const reached = reachedIndex(deal.status);
  const history = (data?.history ?? []).slice().reverse();
  const publicView = deal.status === 'ACTIVE' || deal.status === 'PUBLISHED';

  const duplicate = () =>
    run(async () => {
      const copy = await db.duplicateDeal(deal.id);
      router.push({ pathname: '/merchant/new', params: { id: copy } });
    });

  return (
    <View style={styles.screen}>
      <Header
        title="Deal"
        dark
        onBack={() => router.back()}
        right={
          publicView ? (
            <Pressable
              onPress={() => router.push({ pathname: '/deal/[id]', params: { id: deal.id } })}
              accessibilityRole="button"
              hitSlop={8}
              style={styles.headerLink}
            >
              <Text style={styles.headerLinkText}>View as customer</Text>
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        {submitted === '1' && deal.status === 'SUBMITTED' ? (
          <View style={styles.banner}>
            <Icon name="check" size={18} color={statusColor.active.fg} strokeWidth={2.2} />
            <Text style={styles.bannerText}>
              Submitted. You will get a notification when the YOLO team has reviewed it.
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Image source={{ uri: deal.image }} style={styles.image} contentFit="cover" />
          <View style={styles.cardBody}>
            <DealStatusPill status={deal.status} />
            <Text style={styles.title}>{deal.title}</Text>
            <Text style={styles.sub}>
              {deal.deal_price === 0 ? 'Free' : inr(deal.deal_price ?? 0)}
              {deal.price_unit ?? ''}
              {deal.original_price ? ' · was ' + inr(deal.original_price) : ''}
            </Text>
            <Text style={styles.sub}>{availabilityLabel(deal.availability)}</Text>
            <Text style={styles.sub}>
              {dateLabel(deal.starts_at)} to {dateLabel(deal.ends_at)}
              {deal.status === 'ACTIVE' ? ' · ' + endsInLabel(deal.ends_at) : ''}
            </Text>
          </View>
        </View>

        {deal.status === 'REJECTED' ? (
          <View style={styles.rejected}>
            <Text style={styles.rejectedTitle}>Needs changes</Text>
            <Text style={styles.rejectedBody}>{deal.rejection_reason ?? 'The reviewer did not leave a reason.'}</Text>
          </View>
        ) : null}

        <View style={styles.buttons}>
          {isEditable(deal.status) ? (
            <Button
              variant="cta"
              full
              icon="edit"
              onPress={() => router.push({ pathname: '/merchant/new', params: { id: deal.id } })}
            >
              {deal.status === 'REJECTED' ? 'Fix and resubmit' : 'Continue editing'}
            </Button>
          ) : null}
          {deal.status === 'DRAFT' && moves.includes('SUBMITTED') ? (
            <Button
              full
              loading={busy}
              onPress={() =>
                run(async () => {
                  await db.submitDeal(deal.id);
                  hapticSuccess();
                })
              }
            >
              Submit for verification
            </Button>
          ) : null}
          {moves.includes('PAUSED') ? (
            <Button
              variant="secondary"
              full
              loading={busy}
              onPress={() => run(() => db.transitionDeal(deal.id, 'PAUSED', 'paused by merchant'))}
            >
              Pause deal
            </Button>
          ) : null}
          {deal.status === 'PAUSED' && moves.includes('ACTIVE') ? (
            <Button full loading={busy} onPress={() => run(() => db.transitionDeal(deal.id, 'ACTIVE'))}>
              Resume deal
            </Button>
          ) : null}
          <Button variant="secondary" full icon="plus" loading={busy} onPress={() => void duplicate()}>
            Duplicate
          </Button>
          {moves.includes('ARCHIVED') ? (
            <Button variant="text" full onPress={() => setConfirmArchive(true)}>
              Delete draft
            </Button>
          ) : null}
          {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
        </View>

        <View style={styles.stats}>
          <Stat label="Views" value={deal.views} />
          <Stat label="In search" value={deal.searches} />
          <Stat label="Taken" value={taken.length} />
          <Stat label="Redeemed" value={redeemed.length} />
        </View>

        {deal.capacity_total != null && deal.capacity_remaining != null ? (
          <View style={styles.capacity}>
            <Text style={styles.capText}>
              {deal.capacity_remaining} of {deal.capacity_total} left
            </Text>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${Math.round(capacityFraction(deal.capacity_remaining, deal.capacity_total) * 100)}%` as const,
                  },
                ]}
              />
            </View>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Progress</Text>
        <View style={styles.timeline}>
          {PATH.map((s, i) => {
            const done = i < reached || (i === reached && deal.status !== 'REJECTED');
            const isCurrent = i === reached;
            return (
              <View key={s} style={styles.step}>
                <View style={styles.rail}>
                  <View style={[styles.node, done && styles.nodeDone, isCurrent && styles.nodeCurrent]}>
                    {done ? <Icon name="check" size={12} color={color.white} strokeWidth={2.6} /> : null}
                  </View>
                  {i < PATH.length - 1 ? <View style={[styles.line, i < reached && styles.lineDone]} /> : null}
                </View>
                <View style={styles.stepText}>
                  <Text style={[styles.stepLabel, !done && !isCurrent && styles.stepMuted]}>
                    {STATUS_LABEL[s]}
                  </Text>
                  {isCurrent ? (
                    <Text style={styles.stepNote}>
                      {deal.status === 'PAUSED'
                        ? 'Paused: hidden from customers until you resume'
                        : deal.status === 'REJECTED'
                          ? 'Sent back with changes requested'
                          : STEP_NOTE[s]}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        {history.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Activity</Text>
            <View style={styles.list}>
              {history.map((h) => (
                <View key={h.id} style={styles.historyRow}>
                  <Text style={styles.historyText}>
                    {(h.from_status ? STATUS_LABEL[h.from_status] + ' → ' : '') + STATUS_LABEL[h.to_status]}
                    <Text style={styles.historyMeta}>{' · ' + h.actor + ' · ' + shortAgo(h.created_at)}</Text>
                  </Text>
                  {h.reason ? <Text style={styles.historyReason}>{h.reason}</Text> : null}
                </View>
              ))}
            </View>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Customers</Text>
        {actions.length === 0 ? (
          <Text style={styles.muted}>Nobody has taken this deal yet.</Text>
        ) : (
          <View style={styles.list}>
            {actions.map((a) => (
              <View key={a.id} style={styles.actionRow}>
                <View style={styles.flex}>
                  <Text style={styles.actionTitle}>
                    {ACTION_LABEL[a.action_type]}
                    {a.quantity > 1 ? ' · ' + a.quantity : ''}
                  </Text>
                  <Text style={styles.actionMeta}>
                    {(a.redemption_code ?? 'No code') +
                      ' · ' +
                      shortAgo(a.created_at) +
                      (a.slot_start ? ' · ' + slotLabel(a.slot_start) : '')}
                  </Text>
                  {typeof a.payload.message === 'string' ? (
                    <Text style={styles.actionMessage}>“{a.payload.message}”</Text>
                  ) : null}
                </View>
                {a.status === 'confirmed' && a.redemption_code ? (
                  <Button
                    small
                    variant="secondary"
                    loading={busy}
                    onPress={() => run(() => db.redeemAction(a.redemption_code!))}
                  >
                    Redeem
                  </Button>
                ) : (
                  <StatusPill label={ACTION_STATUS_LABEL[a.status]} />
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Sheet
        visible={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title="Delete this draft?"
        footer={
          <View style={styles.sheetFooter}>
            <View style={styles.flex}>
              <Button variant="secondary" full onPress={() => setConfirmArchive(false)}>
                Keep it
              </Button>
            </View>
            <View style={styles.flex}>
              <Button
                full
                loading={busy}
                onPress={() =>
                  run(async () => {
                    await db.transitionDeal(deal.id, 'ARCHIVED');
                    setConfirmArchive(false);
                    router.back();
                  })
                }
              >
                Delete
              </Button>
            </View>
          </View>
        }
      >
        <Text style={styles.muted}>It moves to Archived and will not be published.</Text>
      </Sheet>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value.toLocaleString('en-IN')}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: space.lg,
    paddingBottom: space.xxxl,
  },
  headerLink: {
    paddingHorizontal: space.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  headerLinkText: {
    ...type.captionMedium,
    fontFamily: font.semibold,
    color: color.white,
  },
  banner: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: statusColor.active.bg,
    marginBottom: space.md,
  },
  bannerText: {
    ...type.captionMedium,
    color: statusColor.active.fg,
    flex: 1,
  },
  card: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  image: {
    width: 88,
    height: 88,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  title: {
    ...type.bodySemibold,
    color: color.text,
  },
  sub: {
    ...type.small,
    color: color.textSecondary,
  },
  rejected: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: statusColor.danger.bg,
    gap: 4,
  },
  rejectedTitle: {
    ...type.captionMedium,
    fontFamily: font.semibold,
    color: statusColor.danger.fg,
  },
  rejectedBody: {
    ...type.body,
    color: color.text,
  },
  buttons: {
    gap: space.sm,
    marginTop: space.lg,
  },
  error: {
    ...type.captionMedium,
    color: color.alert,
  },
  stats: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xl,
  },
  stat: {
    flex: 1,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
  },
  statValue: {
    ...type.h3,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    ...type.small,
    color: color.textSecondary,
  },
  capacity: {
    marginTop: space.md,
    gap: 6,
  },
  capText: {
    ...type.captionMedium,
    color: color.text,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: color.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: color.brand,
  },
  sectionTitle: {
    ...type.h3,
    color: color.text,
    marginTop: space.xxl,
    marginBottom: space.md,
  },
  timeline: {
    paddingLeft: space.xs,
  },
  step: {
    flexDirection: 'row',
    gap: space.md,
  },
  rail: {
    alignItems: 'center',
    width: 20,
  },
  node: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: color.border,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeDone: {
    backgroundColor: color.brand,
    borderColor: color.brand,
  },
  nodeCurrent: {
    borderColor: color.interactive,
    borderWidth: 3,
  },
  line: {
    width: 2,
    flex: 1,
    minHeight: 20,
    backgroundColor: color.border,
  },
  lineDone: {
    backgroundColor: color.brand,
  },
  stepText: {
    flex: 1,
    paddingBottom: space.lg,
  },
  stepLabel: {
    ...type.bodyMedium,
    color: color.text,
    lineHeight: 20,
  },
  stepMuted: {
    color: color.textMuted,
  },
  stepNote: {
    ...type.small,
    color: color.textSecondary,
  },
  list: {
    gap: space.sm,
  },
  historyRow: {
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  historyText: {
    ...type.captionMedium,
    color: color.text,
  },
  historyMeta: {
    ...type.small,
    color: color.textMuted,
  },
  historyReason: {
    ...type.small,
    color: color.textSecondary,
    marginTop: 2,
  },
  muted: {
    ...type.body,
    color: color.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  actionTitle: {
    ...type.bodySemibold,
    color: color.text,
  },
  actionMeta: {
    ...type.small,
    color: color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  actionMessage: {
    ...type.caption,
    color: color.text,
    marginTop: 4,
  },
  sheetFooter: {
    flexDirection: 'row',
    gap: space.md,
  },
});
