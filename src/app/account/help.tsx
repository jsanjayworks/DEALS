/**
 * Help and support: answers first, then a way to reach YOLO, then the
 * requests already sent and their replies.
 *
 * The FAQ is honest about money: YOLO takes no payments, so refunds come from
 * the business under its own policy. What YOLO can do — and what the form is
 * for — is take it up with a business that did not honour a deal or charged
 * more than the deal price. A request about a claim carries that claim, so
 * nobody has to describe it from memory.
 *
 * Opened with ?action=<id> (from Order history) the form starts on "Problem
 * with a claim" with that claim picked; ?topic=refunds opens the refund answer.
 */

import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, RuleViolation, type ActionWithDeal, type SupportTicket, type SupportTopic } from '../../data';
import { dateLabel } from '../../lib/format';
import { hapticSuccess } from '../../lib/device';
import { useQuery } from '../../lib/useQuery';
import { useViewer } from '../../state/session';
import { color, font, radius, space, type } from '../../theme/tokens';
import { Button, Chip, Header, Icon, Label, StatusPill } from '../../components';

const FAQ: { id: string; q: string; a: string }[] = [
  {
    id: 'pay',
    q: 'Do I pay in the app?',
    a: 'No. You claim or book a deal here, show your code at the business, and pay them directly at the deal price. YOLO never asks for card or UPI details.',
  },
  {
    id: 'refunds',
    q: 'How do refunds work?',
    a: 'Because you pay the business, any refund comes from them, under their own policy. If a business will not honour a deal, or charged you more than the deal price, tell us below with the claim attached and we will take it up with them.',
  },
  {
    id: 'code',
    q: 'My code did not work at the counter',
    a: 'Check the deal’s days and hours in My Deals: codes only work while the deal is open. If the time is right and the business still refused it, send us a request with the claim attached.',
  },
  {
    id: 'cancel',
    q: 'How do I cancel a claim or booking?',
    a: 'Open My Deals and tap Cancel on it. Your place goes back to the deal for someone else. A code that has been redeemed can no longer be cancelled.',
  },
  {
    id: 'age',
    q: 'Why can I not claim some deals?',
    a: 'Some deals are for 18+ or 21+, and some are for YOLO Verified members. Add your date of birth in Edit profile to unlock age-limited deals.',
  },
  {
    id: 'delete',
    q: 'How do I delete my account?',
    a: 'Go to Profile, then Delete account. Your open claims are cancelled and your saved deals are removed straight away; the team then removes your sign-in.',
  },
];

const TOPICS: { key: SupportTopic; label: string; needsClaim?: boolean }[] = [
  { key: 'claim_problem', label: 'Problem with a claim', needsClaim: true },
  { key: 'payment_refund', label: 'Payment or refund', needsClaim: true },
  { key: 'deal_wrong', label: 'Deal not as described' },
  { key: 'account', label: 'My account' },
  { key: 'other', label: 'Something else' },
];
const TOPIC_LABEL: Record<SupportTopic, string> = {
  claim_problem: 'Problem with a claim',
  payment_refund: 'Payment or refund',
  deal_wrong: 'Deal not as described',
  account: 'My account',
  account_deletion: 'Account deletion',
  other: 'Something else',
};
const STATUS: Record<SupportTicket['status'], { label: string; tone: 'pending' | 'active' | 'neutral' }> = {
  open: { label: 'Open', tone: 'pending' },
  answered: { label: 'Answered', tone: 'active' },
  closed: { label: 'Closed', tone: 'neutral' },
};

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const viewer = useViewer();
  const params = useLocalSearchParams<{ action?: string; topic?: string }>();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  const fetchAll = useCallback(async () => {
    if (!viewer) return { actions: [] as ActionWithDeal[], tickets: [] as SupportTicket[] };
    const [actions, tickets] = await Promise.all([db.listMyActions(), db.listMySupportTickets()]);
    return { actions, tickets };
  }, [viewer]);
  const { data, reload } = useQuery(fetchAll);

  return (
    <View style={styles.screen}>
      <Header title="Help and support" onBack={close} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}
        >
          <Text style={styles.title} accessibilityRole="header">
            How can we help?
          </Text>

          <View style={styles.card}>
            {FAQ.map((f, i) => (
              <FaqItem key={f.id} item={f} last={i === FAQ.length - 1} startOpen={params.topic === f.id} />
            ))}
          </View>

          <Text style={styles.section}>Contact us</Text>
          {viewer ? (
            data ? (
              <ContactForm
                actions={data.actions}
                preset={params.action}
                onSent={() => {
                  hapticSuccess();
                  reload();
                }}
              />
            ) : null
          ) : (
            <View style={[styles.card, styles.pad]}>
              <Text style={styles.para}>Sign in to send us a request and see our replies.</Text>
              <View style={styles.gapTop}>
                <Button onPress={() => router.push('/sign-in')}>Sign in</Button>
              </View>
            </View>
          )}

          {data && data.tickets.length > 0 ? (
            <>
              <Text style={styles.section}>Your requests</Text>
              <View style={styles.card}>
                {data.tickets.map((t, i) => (
                  <View key={t.id} style={[styles.ticket, i < data.tickets.length - 1 && styles.line]}>
                    <View style={styles.ticketHead}>
                      <Text style={styles.ticketTopic}>{TOPIC_LABEL[t.topic]}</Text>
                      <StatusPill label={STATUS[t.status].label} tone={STATUS[t.status].tone} />
                    </View>
                    <Text style={styles.para} numberOfLines={3}>
                      {t.message}
                    </Text>
                    <Text style={styles.small}>Sent {dateLabel(t.created_at)}</Text>
                    {t.reply ? (
                      <View style={styles.reply}>
                        <Text style={styles.replyBy}>YOLO support{t.replied_at ? ' · ' + dateLabel(t.replied_at) : ''}</Text>
                        <Text style={styles.para}>{t.reply}</Text>
                      </View>
                    ) : (
                      <Text style={styles.small}>Our reply will appear here, and you will get a notification.</Text>
                    )}
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function FaqItem({ item, last, startOpen }: { item: (typeof FAQ)[number]; last: boolean; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <View style={[styles.faq, !last && styles.line]}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        aria-expanded={open}
        style={styles.faqHead}
      >
        <Text style={styles.faqQ}>{item.q}</Text>
        <Icon name={open ? 'minus' : 'plus'} size={18} color={color.textSecondary} />
      </Pressable>
      {open ? <Text style={[styles.para, styles.faqA]}>{item.a}</Text> : null}
    </View>
  );
}

function ContactForm({
  actions,
  preset,
  onSent,
}: {
  actions: ActionWithDeal[];
  preset?: string;
  onSent: () => void;
}) {
  const presetAction = actions.find((a) => a.id === preset);
  const [topic, setTopic] = useState<SupportTopic | null>(presetAction ? 'claim_problem' : null);
  const [actionId, setActionId] = useState<string | null>(presetAction?.id ?? null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const meta = TOPICS.find((t) => t.key === topic);
  const recent = [...actions].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);

  const send = async () => {
    if (!topic) return setError('Choose what your request is about');
    if (message.trim().length < 10) return setError('Tell us a little more, at least 10 characters');
    setBusy(true);
    setError(null);
    try {
      await db.createSupportTicket({
        topic,
        message: message.trim(),
        action_id: meta?.needsClaim && actionId ? actionId : undefined,
      });
      setSent(true);
      setMessage('');
      setTopic(null);
      setActionId(null);
      onSent();
    } catch (e) {
      setError(e instanceof RuleViolation ? e.message : 'That did not send. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, styles.pad, styles.form]}>
      {sent ? (
        <View style={styles.sent} accessibilityLiveRegion="polite">
          <Icon name="check" size={16} color={color.brand} strokeWidth={2.4} />
          <Text style={styles.sentText}>Sent. We will reply here and send you a notification.</Text>
        </View>
      ) : null}

      <Label>What is it about?</Label>
      <View style={styles.chips}>
        {TOPICS.map((t) => (
          <Chip
            key={t.key}
            selected={topic === t.key}
            onPress={() => {
              setTopic(t.key);
              setError(null);
              setSent(false);
            }}
          >
            {t.label}
          </Chip>
        ))}
      </View>

      {meta?.needsClaim ? (
        <>
          <Label>Which claim? (optional)</Label>
          {recent.length === 0 ? (
            <Text style={styles.small}>You have not claimed anything yet.</Text>
          ) : (
            <View style={styles.claims}>
              {recent.map((a) => {
                const on = a.id === actionId;
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => setActionId(on ? null : a.id)}
                    accessibilityRole="radio"
                    aria-checked={on}
                    style={[styles.claim, on && styles.claimOn]}
                  >
                    <Text style={[styles.claimTitle, on && styles.claimTitleOn]} numberOfLines={1}>
                      {a.deal.title}
                    </Text>
                    <Text style={[styles.small, on && styles.claimSubOn]} numberOfLines={1}>
                      {(a.redemption_code ? a.redemption_code + ' · ' : '') + dateLabel(a.created_at)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      ) : null}

      <Label>Tell us what happened</Label>
      <TextInput
        value={message}
        onChangeText={(t) => {
          setMessage(t);
          setError(null);
        }}
        placeholder="The more detail, the faster we can help."
        placeholderTextColor={color.textMuted}
        multiline
        maxLength={2000}
        accessibilityLabel="Your message"
        style={styles.textarea}
      />

      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button variant="cta" full loading={busy} onPress={() => void send()}>
        Send request
      </Button>
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
  body: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: space.lg,
    gap: space.md,
  },
  title: {
    ...type.display,
    fontSize: 28,
    lineHeight: 34,
    color: color.text,
    marginTop: space.sm,
  },
  section: {
    ...type.h3,
    color: color.text,
    marginTop: space.lg,
  },
  card: {
    borderRadius: radius.xxl - 2,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    overflow: 'hidden',
  },
  pad: {
    padding: space.lg,
  },
  gapTop: {
    marginTop: space.md,
    alignItems: 'flex-start',
  },
  line: {
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  faq: {
    paddingHorizontal: space.lg,
  },
  faqHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
  },
  faqQ: {
    ...type.bodySemibold,
    color: color.text,
    flex: 1,
  },
  faqA: {
    paddingBottom: space.lg,
  },
  para: {
    ...type.body,
    color: color.textSecondary,
  },
  small: {
    ...type.small,
    color: color.textMuted,
  },
  form: {
    gap: space.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.xs,
  },
  claims: {
    gap: space.xs,
    marginBottom: space.xs,
  },
  claim: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
  },
  claimOn: {
    backgroundColor: color.brand,
    borderColor: color.brand,
  },
  claimTitle: {
    ...type.captionMedium,
    color: color.text,
  },
  claimTitleOn: {
    color: color.onBrand,
  },
  claimSubOn: {
    color: 'rgba(255,255,255,0.75)',
  },
  textarea: {
    minHeight: 120,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    textAlignVertical: 'top',
    ...type.body,
    color: color.text,
  },
  error: {
    ...type.captionMedium,
    color: color.alert,
  },
  sent: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
    marginBottom: space.sm,
  },
  sentText: {
    ...type.captionMedium,
    color: color.text,
    flex: 1,
  },
  ticket: {
    padding: space.lg,
    gap: 4,
  },
  ticketHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  ticketTopic: {
    ...type.bodySemibold,
    color: color.text,
  },
  reply: {
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
    gap: 2,
  },
  replyBy: {
    ...type.smallMedium,
    fontFamily: font.semibold,
    color: color.brand,
  },
});
