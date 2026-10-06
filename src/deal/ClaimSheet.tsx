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
 *
 * A priced deal is paid before it is taken: a payment step with a choice of
 * method and a mock "Pay" (lib/payment.ts). The payment rides on the action's
 * payload, so the order, My Deals and the merchant's orders all show it.
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { db, RuleViolation } from '../data';
import { slotCapacity, slotKey } from '../data/booking';
import { useQuery } from '../lib/useQuery';
import { useViewer } from '../state/session';
import type { CustomerAction, CustomerActionType, DealCardModel } from '../data/types';
import { checkAction, mintsCode } from '../domain/rules';
import { dateLabel, quantityLabel, slotLabel, timeLabel } from '../lib/format';
import { hapticSuccess, hapticTap } from '../lib/device';
import {
  PAY_METHOD_LABEL,
  needsPayment,
  newOrderId,
  paymentOf,
  type MockPayment,
  type PayMethod,
} from '../lib/payment';
import { color, font, inr, radius, space, status, type } from '../theme/tokens';
import { Button, Chip, Icon, Label, Sheet, type IconName } from '../components';

const PAY_METHODS: { key: PayMethod; icon: IconName; detail: string }[] = [
  { key: 'upi', icon: 'phone', detail: 'Google Pay, PhonePe, Paytm or any UPI app' },
  { key: 'card', icon: 'ticket', detail: 'Credit or debit card' },
  { key: 'netbanking', icon: 'building', detail: 'All major banks' },
];

/** How long the mock "processing" shows, so paying reads as a step. */
const PROCESSING_MS = 1400;

const IST_OFFSET_MS = 330 * 60_000;
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface SlotDay {
  key: string;
  label: string;
  y: number;
  m: number;
  d: number;
  /** Start times still open that day; days without any are left out. */
  times: Date[];
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

/** Whether a start time has no room left, given bookings held per slot. */
type IsFull = (t: Date) => boolean;

/**
 * Up to a week of days the deal runs on that still have a time to book,
 * stopping at its end date. A day with nothing left (today, late in the
 * evening, or every table taken) is skipped rather than offered empty.
 */
function slotDays(deal: DealCardModel, actionType: CustomerActionType, now: Date, isFull: IsFull): SlotDay[] {
  const out: SlotDay[] = [];
  const allowed = deal.availability.days;
  const end = new Date(deal.ends_at).getTime();
  for (let i = 0; i < 21 && out.length < 7; i++) {
    const p = istParts(new Date(now.getTime() + i * 86_400_000));
    if (allowed.length > 0 && !allowed.includes(p.dow)) continue;
    if (istInstant(p.y, p.m, p.d, 0, 0).getTime() > end) break;
    const times = slotTimes(deal, p, actionType, now);
    if (times.length === 0 || times.every(isFull)) continue;
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAY_SHORT[p.dow] + ' ' + p.d;
    out.push({ key: p.y + '-' + p.m + '-' + p.d, label, ...p, times });
  }
  return out;
}

/**
 * Hourly start times inside the window. Registration is for a session with a
 * fixed start, so it offers just that one time.
 */
function slotTimes(
  deal: DealCardModel,
  day: { y: number; m: number; d: number },
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
  purchase_intent: 'Request to buy',
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
  const [stage, setStage] = useState<'form' | 'pay' | 'paying'>('form');
  const [method, setMethod] = useState<PayMethod>('upi');
  const pays = needsPayment(deal, actionType);

  const needsSlot =
    actionType === 'booking' ||
    actionType === 'reserve' ||
    actionType === 'registration' ||
    (deal.booking_required && actionType !== 'enquiry');
  const isEnquiry = actionType === 'enquiry';

  // Bookings already held per time slot, when the deal caps each slot.
  const perSlot = needsSlot ? slotCapacity(deal.attributes) : null;
  const fetchLoad = useCallback(
    () => (perSlot != null ? db.listSlotLoad(deal.id) : Promise.resolve([])),
    [deal.id, perSlot],
  );
  const { data: load, reload: reloadLoad } = useQuery(fetchLoad);
  const held = useMemo(() => new Map((load ?? []).map((l) => [slotKey(l.slot_start), l.taken])), [load]);
  const left = useCallback(
    (t: Date) => (perSlot == null ? null : Math.max(0, perSlot - (held.get(t.getTime()) ?? 0))),
    [perSlot, held],
  );
  const isFull = useCallback((t: Date) => left(t) === 0, [left]);

  const days = useMemo(
    () => (needsSlot ? slotDays(deal, actionType, now, isFull) : []),
    [deal, needsSlot, actionType, now, isFull],
  );
  const day = days.find((d) => d.key === dayKey) ?? days[0] ?? null;
  const times = day?.times ?? [];
  const noTimes = needsSlot && days.length === 0;

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

  // A slot picked before the counts arrived, or taken since, is no longer offered.
  const slotFull = slot !== null && isFull(new Date(slot));
  const canSubmit = verdict.ok && !noTimes && !slotFull && (!needsSlot || slot !== null) && !submitting;

  const submit = async (payment?: MockPayment) => {
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = isEnquiry && message.trim() ? { message: message.trim() } : {};
      if (payment) payload.payment = payment;
      const action = await db.takeDealAction({
        deal_id: deal.id,
        action_type: actionType,
        quantity,
        slot_start: needsSlot ? slot : null,
        payload,
      });
      hapticSuccess();
      setDone(action);
      onTaken(action);
    } catch (e) {
      setError(
        (e instanceof RuleViolation ? e.message : 'Something went wrong. Please try again.') +
          (payment ? ' Nothing was charged.' : ''),
      );
      // Someone may have taken the last table meanwhile: show the slots as they are now.
      if (perSlot != null) {
        reloadLoad();
        setSlot(null);
        if (payment) setStage('form');
      } else if (payment) setStage('pay');
    } finally {
      setSubmitting(false);
    }
  };

  /** The mock gateway: a moment of "processing", then the order goes through as paid. */
  const payNow = (amount: number) => {
    setStage('paying');
    setError(null);
    setTimeout(() => {
      void submit({
        status: 'paid',
        method,
        amount,
        currency: 'INR',
        order_id: newOrderId(),
        paid_at: new Date().toISOString(),
        mock: true,
      });
    }, PROCESSING_MS);
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

  if (pays && total != null && stage !== 'form') {
    return (
      <PaymentStep
        visible={visible}
        onClose={onClose}
        deal={deal}
        quantity={quantity}
        total={total}
        method={method}
        onMethod={setMethod}
        paying={stage === 'paying' || submitting}
        error={error}
        onBack={() => {
          setStage('form');
          setError(null);
        }}
        onPay={() => payNow(total)}
      />
    );
  }

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
              <Text style={styles.total}>
                {total === 0 ? 'Free' : inr(total)}
                {total > 0 && deal.price_unit ? <Text style={styles.totalUnit}>{deal.price_unit}</Text> : null}
              </Text>
            </View>
          ) : null}
          <View style={styles.footerMain}>
            <Button
              variant="cta"
              full
              loading={submitting}
              disabled={!canSubmit}
              onPress={() => (pays ? setStage('pay') : void submit())}
            >
              {noTimes
                ? 'No times left'
                : needsSlot && (!slot || slotFull)
                  ? 'Pick a time'
                  : pays && total != null
                    ? 'Continue to pay ' + inr(total)
                    : CONFIRM_LABEL[actionType]}
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
            <Text style={styles.muted}>
              No times left to book on this deal
              {deal.eligibility.advance_booking_hours
                ? '. Bookings close ' + deal.eligibility.advance_booking_hours + ' hours ahead'
                : ''}
              .
            </Text>
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
              <View style={styles.chips}>
                {times.map((t) => {
                  const iso = t.toISOString();
                  const room = left(t);
                  const full = room === 0;
                  return (
                    <Chip
                      key={iso}
                      selected={slot === iso && !full}
                      disabled={full}
                      onPress={() => {
                        hapticTap();
                        setSlot(iso);
                        setError(null);
                      }}
                    >
                      {istTimeLabel(t) + (full ? ' · Full' : room != null && room <= 2 ? ' · ' + room + ' left' : '')}
                    </Chip>
                  );
                })}
              </View>
              {perSlot != null ? (
                <Text style={styles.slotNote}>
                  {perSlot === 1 ? 'One booking' : 'Up to ' + perSlot + ' bookings'} per time. Full times are crossed out.
                </Text>
              ) : null}
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
            : pays
              ? 'You pay now, then show your code at ' + deal.business.name + '.'
              : actionType === 'purchase_intent'
                ? deal.business.name + ' will contact you to complete the purchase.'
                : 'Free. Show your code at ' + deal.business.name + '.'}
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
      aria-disabled={disabled}
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
  const paid = paymentOf(action);
  return (
    <View style={styles.success}>
      <View style={styles.successTick}>
        <Icon name="check" size={32} color={color.onCta} strokeWidth={2.4} />
      </View>
      <Text style={styles.successTitle} accessibilityRole="header">
        {isEnquiry ? 'Enquiry sent' : paid ? 'Payment successful' : 'You’re all set'}
      </Text>
      {paid ? (
        <View style={styles.paidPill}>
          <Text style={styles.paidPillText}>
            Paid {inr(paid.amount)} by {PAY_METHOD_LABEL[paid.method]} · {paid.order_id}
          </Text>
        </View>
      ) : null}
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
          {action.quantity > 1 ? (
            <Text style={styles.codeMeta}>{quantityLabel(action.action_type, action.quantity)}</Text>
          ) : null}
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

/** Checkout: what is being paid for, how, and the mock Pay button. */
function PaymentStep({
  visible,
  onClose,
  deal,
  quantity,
  total,
  method,
  onMethod,
  paying,
  error,
  onBack,
  onPay,
}: {
  visible: boolean;
  onClose: () => void;
  deal: DealCardModel;
  quantity: number;
  total: number;
  method: PayMethod;
  onMethod: (m: PayMethod) => void;
  paying: boolean;
  error: string | null;
  onBack: () => void;
  onPay: () => void;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={paying ? () => {} : onClose}
      title="Payment"
      footer={
        <View style={styles.footer}>
          <Button variant="secondary" onPress={onBack} disabled={paying}>
            Back
          </Button>
          <View style={styles.footerMain}>
            <Button variant="cta" full loading={paying} onPress={onPay}>
              {'Mock pay ' + inr(total)}
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
          <Text style={styles.summaryBiz}>
            {deal.business.name}
            {quantity > 1 ? ' · ' + quantity + ' × ' + inr(deal.deal_price ?? 0) : ''}
          </Text>
        </View>
        <Text style={styles.summaryPrice}>
          {inr(total)}
          {deal.price_unit ?? ''}
        </Text>
      </View>

      <View style={styles.block}>
        <Label>Pay with</Label>
        <View style={styles.methods} accessibilityRole="radiogroup">
          {PAY_METHODS.map((m) => {
            const on = method === m.key;
            return (
              <Pressable
                key={m.key}
                onPress={() => {
                  hapticTap();
                  onMethod(m.key);
                }}
                disabled={paying}
                accessibilityRole="radio"
                aria-checked={on}
                accessibilityLabel={PAY_METHOD_LABEL[m.key]}
                style={[styles.method, on && styles.methodOn]}
              >
                <Icon name={m.icon} size={18} color={on ? color.brand : color.textSecondary} />
                <View style={styles.methodText}>
                  <Text style={styles.methodName}>{PAY_METHOD_LABEL[m.key]}</Text>
                  <Text style={styles.methodDetail}>{m.detail}</Text>
                </View>
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.mock}>
        <Icon name="shield" size={16} color={color.accentText} />
        <Text style={styles.mockText}>
          {paying ? 'Processing payment…' : 'Mock payment for the demo. No money moves and no card details are asked for.'}
        </Text>
      </View>

      {error ? (
        <View style={styles.blocked} accessibilityLiveRegion="assertive">
          <Icon name="x" size={16} color={status.danger.fg} />
          <Text style={styles.blockedText}>{error}</Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  methods: {
    gap: space.sm,
  },
  slotNote: {
    ...type.small,
    color: color.textMuted,
    marginTop: space.sm,
  },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 60,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  methodOn: {
    borderColor: color.brand,
    borderWidth: 2,
  },
  methodText: {
    flex: 1,
  },
  methodName: {
    ...type.bodySemibold,
    color: color.text,
  },
  methodDetail: {
    ...type.small,
    color: color.textSecondary,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    borderColor: color.brand,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: color.brand,
  },
  mock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginTop: space.xl,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
  },
  mockText: {
    ...type.caption,
    color: color.textSecondary,
    flex: 1,
  },
  paidPill: {
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: status.active.bg,
  },
  paidPillText: {
    ...type.captionMedium,
    color: status.active.fg,
  },
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
  totalUnit: {
    ...type.caption,
    color: color.textSecondary,
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
