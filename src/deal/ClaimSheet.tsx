/**
 * The claim sheet: Claim, Book, Reserve, Register, Enquire and Buy all land
 * here, as the one customer_actions write the backend allows.
 *
 * Eligibility runs locally first through domain/rules (the mirror of
 * take_deal_action) so the button can say why it is disabled before a round
 * trip. The server still decides: a RuleViolation it raises, such as someone
 * else taking the last unit a moment earlier, is shown verbatim.
 *
 * Slots are built in IST because availability windows are stored in IST and
 * the rules read them that way, whatever timezone the phone is set to.
 */

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { db, RuleViolation } from '../data';
import { useViewer } from '../state/session';
import type { CustomerAction, CustomerActionType, DealCardModel } from '../data/types';
import { checkAction, mintsCode } from '../domain/rules';
import { dateLabel, slotLabel, timeLabel } from '../lib/format';
import { hapticSuccess, hapticTap } from '../lib/device';
import { color, font, inr, radius, space, status, type } from '../theme/tokens';
import { Button, Chip, Icon, Label, Sheet } from '../components';

const IST_OFFSET_MS = 330 * 60_000;
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface SlotDay {
  key: string;
  label: string;
  y: number;
  m: number;
  d: number;
}

function istParts(at: Date) {
  const s = new Date(at.getTime() + IST_OFFSET_MS);
  return { y: s.getUTCFullYear(), m: s.getUTCMonth(), d: s.getUTCDate(), dow: s.getUTCDay() };
}

function istInstant(y: number, m: number, d: number, hh: number, mm: number): Date {
  return new Date(Date.UTC(y, m, d, hh, mm) - IST_OFFSET_MS);
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** The next week of days the deal runs on, stopping at its end date. */
function slotDays(deal: DealCardModel, now: Date): SlotDay[] {
  const out: SlotDay[] = [];
  const allowed = deal.availability.days;
  const end = new Date(deal.ends_at).getTime();
  for (let i = 0; i < 14 && out.length < 7; i++) {
    const p = istParts(new Date(now.getTime() + i * 86_400_000));
    if (allowed.length > 0 && !allowed.includes(p.dow)) continue;
    if (istInstant(p.y, p.m, p.d, 0, 0).getTime() > end) break;
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAY_SHORT[p.dow] + ' ' + p.d;
    out.push({ key: p.y + '-' + p.m + '-' + p.d, label, ...p });
  }
  return out;
}

/**
 * Hourly start times inside the window. Registration is for a session with a
 * fixed start, so it offers just that one time.
 */
function slotTimes(
  deal: DealCardModel,
  day: SlotDay,
  actionType: CustomerActionType,
  now: Date,
): Date[] {
  const start = toMinutes(deal.availability.start_time);
  const end = toMinutes(deal.availability.end_time);
  const lead = (deal.eligibility.advance_booking_hours ?? 0) * 3_600_000;
  const earliest = now.getTime() + Math.max(lead, 15 * 60_000);
  const latest = new Date(deal.ends_at).getTime();

  const minutes: number[] = [];
  if (actionType === 'registration' || end - start < 60) {
    minutes.push(start);
  } else {
    for (let t = start; t + 60 <= end; t += 60) minutes.push(t);
  }
  return minutes
    .map((t) => istInstant(day.y, day.m, day.d, Math.floor(t / 60), t % 60))
    .filter((d) => d.getTime() >= earliest && d.getTime() <= latest);
}

function istTimeLabel(d: Date): string {
  const s = new Date(d.getTime() + IST_OFFSET_MS);
  return timeLabel(s.getUTCHours() + ':' + String(s.getUTCMinutes()).padStart(2, '0'));
}

/** Far enough ahead to pass the time checks while no slot is chosen yet. */
const PLACEHOLDER_SLOT = '2999-01-01T00:00:00.000Z';

const CONFIRM_LABEL: Record<CustomerActionType, string> = {
  claim: 'Claim deal',
  booking: 'Confirm booking',
  reserve: 'Confirm reservation',
  registration: 'Register',
  enquiry: 'Send enquiry',
  purchase_intent: 'Continue',
};

export interface ClaimSheetProps {
  visible: boolean;
  deal: DealCardModel;
  actionType: CustomerActionType;
  /** The viewer's actions, for the one-live-action-per-deal rule. */
  existing: CustomerAction[];
  onClose: () => void;
  /** Called after a successful write so the page can re-read capacity. */
  onTaken: (action: CustomerAction) => void;
  onViewMyDeals: () => void;
}

/**
 * Mounted only while open, so every opening starts from a blank form and the
 * clock the slots are built from is read at that moment.
 */
export function ClaimSheet(props: ClaimSheetProps) {
  return props.visible ? <ClaimSheetOpen {...props} /> : null;
}

function ClaimSheetOpen({
  visible,
  deal,
  actionType,
  existing,
  onClose,
  onTaken,
  onViewMyDeals,
}: ClaimSheetProps) {
  const viewer = useViewer();
  const [quantity, setQuantity] = useState(1);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CustomerAction | null>(null);
  const [now] = useState(() => new Date());

  const needsSlot =
    actionType === 'booking' ||
    actionType === 'reserve' ||
    actionType === 'registration' ||
    (deal.booking_required && actionType !== 'enquiry');
  const isEnquiry = actionType === 'enquiry';

  const days = useMemo(() => (needsSlot ? slotDays(deal, now) : []), [deal, needsSlot, now]);
  const day = days.find((d) => d.key === dayKey) ?? days[0] ?? null;
  const times = useMemo(
    () => (day ? slotTimes(deal, day, actionType, now) : []),
    [deal, day, actionType, now],
  );

  const maxQty = Math.max(
    1,
    Math.min(deal.max_qty_per_customer ?? 10, deal.capacity_remaining ?? 10, 10),
  );
  const showQty = !isEnquiry && maxQty > 1;

  const verdict = checkAction({
    deal,
    viewer,
    actionType,
    quantity,
    slotStart: needsSlot ? (slot ?? PLACEHOLDER_SLOT) : null,
    existing,
  });

  const canSubmit = verdict.ok && (!needsSlot || slot !== null) && !submitting;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const action = await db.takeDealAction({
        deal_id: deal.id,
        action_type: actionType,
        quantity,
        slot_start: needsSlot ? slot : null,
        payload: isEnquiry && message.trim() ? { message: message.trim() } : {},
      });
      hapticSuccess();
      setDone(action);
      onTaken(action);
    } catch (e) {
      setError(e instanceof RuleViolation ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Sheet visible={visible} onClose={onClose}>
        <Success
          action={done}
          deal={deal}
          onViewMyDeals={onViewMyDeals}
          onClose={onClose}
        />
      </Sheet>
    );
  }

  const total = deal.deal_price != null ? deal.deal_price * quantity : null;
  const blockedReason = !verdict.ok ? verdict.reason : error;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={CONFIRM_LABEL[actionType]}
      footer={
        <View style={styles.footer}>
          {total != null && !isEnquiry ? (
            <View>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.total}>{total === 0 ? 'Free' : inr(total)}</Text>
            </View>
          ) : null}
          <View style={styles.footerMain}>
            <Button
              variant="cta"
              full
              loading={submitting}
              disabled={!canSubmit}
              onPress={() => void submit()}
            >
              {needsSlot && !slot ? 'Pick a time' : CONFIRM_LABEL[actionType]}
            </Button>
          </View>
        </View>
      }
    >
      <View style={styles.summary}>
        <View style={styles.summaryText}>
          <Text style={styles.summaryTitle} numberOfLines={2}>
            {deal.title}
          </Text>
          <Text style={styles.summaryBiz}>{deal.business.name}</Text>
        </View>
        {deal.deal_price != null ? (
          <Text style={styles.summaryPrice}>
            {deal.deal_price === 0 ? 'Free' : inr(deal.deal_price)}
            {deal.price_unit ?? ''}
          </Text>
        ) : null}
      </View>

      {showQty ? (
        <View style={styles.block}>
          <Label>Quantity</Label>
          <View style={styles.stepper}>
            <StepButton
              icon="minus"
              disabled={quantity <= 1}
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}
            />
            <Text style={styles.qty} accessibilityLiveRegion="polite">
              {quantity}
            </Text>
            <StepButton
              icon="plus"
              disabled={quantity >= maxQty}
              onPress={() => setQuantity((q) => Math.min(maxQty, q + 1))}
            />
            <Text style={styles.qtyHint}>
              {deal.max_qty_per_customer != null
                ? 'Up to ' + deal.max_qty_per_customer + ' per person'
                : ''}
            </Text>
          </View>
        </View>
      ) : null}

      {needsSlot ? (
        <View style={styles.block}>
          <Label>Day</Label>
          {days.length === 0 ? (
            <Text style={styles.muted}>No upcoming days left on this deal.</Text>
          ) : (
            <View style={styles.chips}>
              {days.map((d) => (
                <Chip
                  key={d.key}
                  selected={day?.key === d.key}
                  onPress={() => {
                    hapticTap();
                    setDayKey(d.key);
                    setSlot(null);
                  }}
                >
                  {d.label}
                </Chip>
              ))}
            </View>
          )}

          {day ? (
            <>
              <View style={styles.gapSm} />
              <Label>Time</Label>
              {times.length === 0 ? (
                <Text style={styles.muted}>
                  No times left that day
                  {deal.eligibility.advance_booking_hours
                    ? ' — bookings close ' + deal.eligibility.advance_booking_hours + ' hours ahead'
                    : ''}
                  .
                </Text>
              ) : (
                <View style={styles.chips}>
                  {times.map((t) => {
                    const iso = t.toISOString();
                    return (
                      <Chip
                        key={iso}
                        selected={slot === iso}
                        onPress={() => {
                          hapticTap();
                          setSlot(iso);
                        }}
                      >
                        {istTimeLabel(t)}
                      </Chip>
                    );
                  })}
                </View>
              )}
            </>
          ) : null}
        </View>
      ) : null}

      {isEnquiry ? (
        <View style={styles.block}>
          <Label>Message (optional)</Label>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder={'Hi, is this still available?'}
            placeholderTextColor={color.textMuted}
            multiline
            maxLength={500}
            style={styles.message}
            accessibilityLabel="Message to the business"
          />
        </View>
      ) : null}

      <View style={styles.note}>
        <Icon name="shield" size={16} color={color.textSecondary} />
        <Text style={styles.noteText}>
          {isEnquiry
            ? deal.business.name + ' will reply to the number on your profile.'
            : actionType === 'purchase_intent'
              ? deal.business.name + ' will contact you to complete the purchase.'
              : 'No payment in the app. Show your code and pay at ' + deal.business.name + '.'}
        </Text>
      </View>

      {blockedReason ? (
        <View style={styles.blocked} accessibilityLiveRegion="assertive">
          <Icon name="x" size={16} color={status.danger.fg} />
          <Text style={styles.blockedText}>{blockedReason}</Text>
        </View>
      ) : null}
    </Sheet>
  );
}

function StepButton({
  icon,
  disabled,
  onPress,
}: {
  icon: 'plus' | 'minus';
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={icon === 'plus' ? 'Increase quantity' : 'Decrease quantity'}
      accessibilityState={{ disabled }}
      style={[styles.step, disabled && styles.stepDisabled]}
    >
      {icon === 'plus' ? (
        <Icon name="plus" size={18} color={color.brand} strokeWidth={2} />
      ) : (
        <View style={styles.minus} />
      )}
    </Pressable>
  );
}

function Success({
  action,
  deal,
  onViewMyDeals,
  onClose,
}: {
  action: CustomerAction;
  deal: DealCardModel;
  onViewMyDeals: () => void;
  onClose: () => void;
}) {
  const code = action.redemption_code;
  const isEnquiry = action.action_type === 'enquiry';
  return (
    <View style={styles.success}>
      <View style={styles.successTick}>
        <Icon name="check" size={32} color={color.onCta} strokeWidth={2.4} />
      </View>
      <Text style={styles.successTitle} accessibilityRole="header">
        {isEnquiry ? 'Enquiry sent' : 'You’re all set'}
      </Text>
      <Text style={styles.successBody}>
        {isEnquiry
          ? deal.business.name + ' will get back to you soon.'
          : code
            ? 'Show this code at ' + deal.business.name + '.'
            : deal.business.name + ' has your request.'}
      </Text>

      {code && mintsCode(action.action_type) ? (
        <View style={styles.codeCard}>
          <QRCode value={code} size={168} color={color.text} backgroundColor={color.surface} />
          <Text style={styles.code} selectable accessibilityLabel={'Code ' + code.split('').join(' ')}>
            {code}
          </Text>
          {action.slot_start ? (
            <Text style={styles.codeMeta}>{slotLabel(action.slot_start)}</Text>
          ) : (
            <Text style={styles.codeMeta}>Valid until {dateLabel(deal.ends_at)}</Text>
          )}
          {action.quantity > 1 ? <Text style={styles.codeMeta}>{action.quantity} people</Text> : null}
        </View>
      ) : null}

      <View style={styles.successActions}>
        <Button full onPress={onViewMyDeals}>
          View in My Deals
        </Button>
        <Button full variant="text" onPress={onClose}>
          Done
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: color.surfaceSoftAlt,
  },
  summaryText: {
    flex: 1,
  },
  summaryTitle: {
    ...type.bodySemibold,
    color: color.text,
  },
  summaryBiz: {
    ...type.small,
    color: color.textSecondary,
    marginTop: 2,
  },
  summaryPrice: {
    ...type.bodySemibold,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  block: {
    marginTop: space.xl,
  },
  gapSm: {
    height: space.lg,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  muted: {
    ...type.caption,
    color: color.textSecondary,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  step: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDisabled: {
    opacity: 0.35,
  },
  minus: {
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: color.brand,
  },
  qty: {
    ...type.h2,
    color: color.text,
    minWidth: 28,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  qtyHint: {
    ...type.small,
    color: color.textSecondary,
    flex: 1,
  },
  message: {
    minHeight: 96,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    textAlignVertical: 'top',
    ...type.body,
    color: color.text,
  },
  note: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xl,
  },
  noteText: {
    ...type.caption,
    color: color.textSecondary,
    flex: 1,
  },
  blocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: status.danger.bg,
  },
  blockedText: {
    ...type.captionMedium,
    color: status.danger.fg,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  footerMain: {
    flex: 1,
  },
  totalLabel: {
    ...type.small,
    color: color.textSecondary,
  },
  total: {
    ...type.h2,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  success: {
    alignItems: 'center',
    paddingTop: space.lg,
  },
  successTick: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: color.cta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    ...type.h1,
    color: color.text,
    marginTop: space.lg,
  },
  successBody: {
    ...type.body,
    color: color.textSecondary,
    marginTop: space.xs,
    textAlign: 'center',
  },
  codeCard: {
    marginTop: space.xl,
    padding: space.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'stretch',
  },
  code: {
    fontFamily: font.bold,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: 2,
    color: color.text,
    marginTop: space.sm,
    fontVariant: ['tabular-nums'],
  },
  codeMeta: {
    ...type.caption,
    color: color.textSecondary,
  },
  successActions: {
    alignSelf: 'stretch',
    marginTop: space.xl,
    gap: space.xs,
  },
});
