/**
 * The review queue: every submitted deal waits here until someone approves it
 * or sends it back with a reason.
 *
 * Approving runs review_deal, which takes the deal through VERIFICATION and
 * APPROVED to PUBLISHED, and on to ACTIVE if its start date has passed. A
 * rejection must carry a reason; the merchant sees it word for word.
 */

import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { db, RuleViolation } from '../../data';
import type { DealCardModel, DealStatus } from '../../data/types';
import { STATUS_LABEL } from '../../domain/lifecycle';
import { availabilityLabel, dateLabel, DEAL_TYPE_LABEL } from '../../lib/format';
import { hapticSuccess } from '../../lib/device';
import { useQuery } from '../../lib/useQuery';
import { color, font, inr, radius, space, status as statusColor, type } from '../../theme/tokens';
import {
  Button,
  Chip,
  DealCard,
  DealStatusPill,
  EmptyState,
  Header,
  Label,
  Sheet,
} from '../../components';

const REASONS = [
  'The photo does not show what is on offer',
  'The usual price looks inflated',
  'The terms are missing or unclear',
  'This is not allowed on YOLO',
];

interface Outcome {
  title: string;
  approved: boolean;
  status: DealStatus;
}

export default function ReviewQueueScreen() {
  const fetchQueue = useCallback(() => db.listReviewQueue(), []);
  const { data, loading, reload } = useQuery(fetchQueue);
  const [open, setOpen] = useState<DealCardModel | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<Outcome | null>(null);

  const close = () => {
    setOpen(null);
    setRejecting(false);
    setReason('');
    setError(null);
  };

  const decide = async (approve: boolean) => {
    if (!open) return;
    if (!approve && !reason.trim()) {
      setError('Say what needs to change. The merchant sees this word for word.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const status = await db.reviewDeal(open.id, approve, approve ? undefined : reason.trim());
      if (approve) hapticSuccess();
      setLast({ title: open.title, approved: approve, status });
      close();
      reload();
    } catch (e) {
      setError(e instanceof RuleViolation ? e.message : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const queue = data ?? [];

  return (
    <View style={styles.screen}>
      <Header title="Review queue" dark onBack={() => router.back()} />
      <FlatList
        data={queue}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Gap}
        ListHeaderComponent={
          <>
            {last ? (
              <View
                style={[styles.banner, !last.approved && styles.bannerRejected]}
                accessibilityLiveRegion="polite"
              >
                <Text style={[styles.bannerText, !last.approved && styles.bannerTextRejected]}>
                  {last.approved
                    ? last.title + ' is ' + STATUS_LABEL[last.status].toLowerCase() + '.'
                    : last.title + ' was sent back to the merchant.'}
                </Text>
              </View>
            ) : null}
            {queue.length > 0 ? (
              <Text style={styles.count}>
                {queue.length} waiting
              </Text>
            ) : null}
          </>
        }
        renderItem={({ item }) => (
          // The card is the button; wrapping it in another one nests <button>s on web.
          <View style={styles.item}>
            <View style={styles.itemHead}>
              <DealStatusPill status={item.status} />
              <Text style={styles.biz} numberOfLines={1}>
                {item.business.name}
                {item.business.verification_status !== 'verified' ? ' · unverified business' : ''}
              </Text>
            </View>
            <DealCard deal={item} variant="list" badge={null} onPress={() => setOpen(item)} />
          </View>
        )}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState icon="check" title="Queue is clear" body="New submissions will appear here." />
          )
        }
      />

      <Sheet
        visible={open !== null}
        onClose={close}
        title={rejecting ? 'Send back with a reason' : 'Review deal'}
        footer={
          open ? (
            rejecting ? (
              <View style={styles.footer}>
                <Button variant="secondary" onPress={() => setRejecting(false)}>
                  Back
                </Button>
                <View style={styles.flex}>
                  <Button full loading={busy} onPress={() => void decide(false)}>
                    Send back
                  </Button>
                </View>
              </View>
            ) : (
              <View style={styles.footer}>
                <View style={styles.flex}>
                  <Button variant="secondary" full onPress={() => setRejecting(true)}>
                    Reject
                  </Button>
                </View>
                <View style={styles.flex}>
                  <Button variant="cta" full loading={busy} onPress={() => void decide(true)}>
                    Approve
                  </Button>
                </View>
              </View>
            )
          ) : undefined
        }
      >
        {open && !rejecting ? <ReviewDetail deal={open} /> : null}
        {open && rejecting ? (
          <View>
            <Label>Common reasons</Label>
            <View style={styles.chips}>
              {REASONS.map((r) => (
                <Chip key={r} selected={reason === r} onPress={() => setReason(r)}>
                  {r}
                </Chip>
              ))}
            </View>
            <Label>Reason sent to the merchant</Label>
            <TextInput
              value={reason}
              onChangeText={(t) => {
                setReason(t);
                setError(null);
              }}
              placeholder="What should they change before resubmitting?"
              placeholderTextColor={color.textMuted}
              multiline
              style={styles.reasonInput}
              accessibilityLabel="Rejection reason"
            />
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Sheet>
    </View>
  );
}

function ReviewDetail({ deal }: { deal: DealCardModel }) {
  const e = deal.eligibility;
  const rows: [string, string][] = [
    ['Business', deal.business.name + ' · ' + deal.business.verification_status],
    ['Type', (DEAL_TYPE_LABEL[deal.deal_type_code] ?? deal.deal_type_code) + ' · ' + deal.category.name],
    [
      'Price',
      (deal.deal_price === 0 ? 'Free' : inr(deal.deal_price ?? 0)) +
        (deal.price_unit ?? '') +
        (deal.original_price != null ? ' (usually ' + inr(deal.original_price) + ', ' + Math.round(deal.discount_pct ?? 0) + '% off)' : ''),
    ],
    ['Runs', dateLabel(deal.starts_at) + ' to ' + dateLabel(deal.ends_at) + ' · ' + availabilityLabel(deal.availability)],
    [
      'Limits',
      (deal.capacity_total != null ? deal.capacity_total + ' total' : 'No total limit') +
        (deal.max_qty_per_customer != null ? ' · ' + deal.max_qty_per_customer + ' per customer' : ''),
    ],
    [
      'Who',
      [
        e.audience,
        e.min_age != null ? e.min_age + '+' : null,
        e.min_spend != null ? 'min spend ' + inr(e.min_spend) : null,
        e.custom_rule,
      ]
        .filter(Boolean)
        .join(' · '),
    ],
  ];
  return (
    <View>
      <Text style={styles.detailTitle}>{deal.title}</Text>
      <Text style={styles.detailShort}>{deal.short_description}</Text>
      <View style={styles.detailRows}>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.detailRow}>
            <Text style={styles.detailKey}>{k}</Text>
            <Text style={styles.detailValue}>{v}</Text>
          </View>
        ))}
      </View>
      <Label>Description</Label>
      <Text style={styles.detailBody}>{deal.description || '—'}</Text>
      {deal.terms ? (
        <>
          <Label>Terms</Label>
          <Text style={styles.detailBody}>{deal.terms}</Text>
        </>
      ) : null}
    </View>
  );
}

function Gap() {
  return <View style={{ height: space.lg }} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.background,
  },
  flex: {
    flex: 1,
  },
  list: {
    padding: space.lg,
    paddingBottom: space.xxxl,
    flexGrow: 1,
  },
  banner: {
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: statusColor.active.bg,
    marginBottom: space.md,
  },
  bannerRejected: {
    backgroundColor: statusColor.pending.bg,
  },
  bannerText: {
    ...type.captionMedium,
    color: statusColor.active.fg,
  },
  bannerTextRejected: {
    color: statusColor.pending.fg,
  },
  count: {
    ...type.caption,
    color: color.textSecondary,
    marginBottom: space.md,
  },
  item: {
    gap: space.sm,
  },
  itemHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  biz: {
    ...type.small,
    color: color.textSecondary,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: space.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.lg,
  },
  reasonInput: {
    minHeight: 96,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    textAlignVertical: 'top',
    ...type.body,
    color: color.text,
  },
  error: {
    ...type.captionMedium,
    color: color.alert,
    marginTop: space.md,
  },
  detailTitle: {
    ...type.h2,
    color: color.text,
  },
  detailShort: {
    ...type.body,
    color: color.textSecondary,
    marginTop: 2,
  },
  detailRows: {
    marginVertical: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
    padding: space.md,
    gap: space.sm,
  },
  detailRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  detailKey: {
    ...type.captionMedium,
    fontFamily: font.semibold,
    color: color.textSecondary,
    width: 72,
  },
  detailValue: {
    ...type.caption,
    color: color.text,
    flex: 1,
  },
  detailBody: {
    ...type.body,
    color: color.text,
    marginBottom: space.lg,
  },
});
