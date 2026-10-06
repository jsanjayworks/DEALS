/**
 * Support inbox: customer requests as conversations, open ones first. Each
 * shows who sent it (phone or email you can tap), the claim it is about,
 * and the whole thread. An admin replies, closes, or both; the customer is
 * notified of every reply and can answer back, which reopens the request.
 * Closed requests stay findable under Closed.
 */

import { useCallback, useEffect, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { db, RuleViolation, type SupportQueueItem, type SupportTopic } from '../../data';
import type { CustomerActionStatus } from '../../data/types';
import { ACTION_STATUS_LABEL, dateLabel } from '../../lib/format';
import { useQuery } from '../../lib/useQuery';
import { color, radius, space, status as statusColor, type } from '../../theme/tokens';
import { Button, Chip, EmptyState, Header, StatusPill } from '../../components';

/** The same names the customer picked from. */
const TOPIC: Record<SupportTopic, string> = {
  claim_problem: 'Problem with a claim',
  payment_refund: 'Payment or refund',
  deal_wrong: 'Deal not as described',
  account: 'My account',
  account_deletion: 'Account deletion',
  other: 'Something else',
};

const STATUS: Record<SupportQueueItem['status'], { label: string; tone: 'pending' | 'active' | 'neutral' }> = {
  open: { label: 'Open', tone: 'pending' },
  answered: { label: 'Answered', tone: 'active' },
  closed: { label: 'Closed', tone: 'neutral' },
};

type View_ = 'active' | 'closed';

export default function SupportInboxScreen() {
  const [view, setView] = useState<View_>('active');
  const [note, setNote] = useState<string | null>(null);
  const fetchQueue = useCallback(() => db.listSupportQueue(view), [view]);
  const { data, loading, reload } = useQuery(fetchQueue);
  const queue = data ?? [];
  const open = queue.filter((t) => t.status === 'open').length;

  // A confirmation after each action, gone after a few seconds.
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(t);
  }, [note]);

  return (
    <View style={styles.screen}>
      <Header title="Support inbox" dark onBack={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
      <FlatList
        data={queue}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.top}>
            <View style={styles.views}>
              <Chip selected={view === 'active'} onPress={() => setView('active')}>
                Active
              </Chip>
              <Chip selected={view === 'closed'} onPress={() => setView('closed')}>
                Closed
              </Chip>
            </View>
            {note ? (
              <View style={styles.note} accessibilityLiveRegion="polite">
                <Text style={styles.noteText}>{note}</Text>
              </View>
            ) : null}
            {view === 'active' && queue.length > 0 ? (
              <Text style={styles.count}>
                {open} open · {queue.length - open} answered
              </Text>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={Gap}
        renderItem={({ item }) => (
          <Ticket
            item={item}
            onDone={(message) => {
              setNote(message);
              reload();
            }}
          />
        )}
        ListEmptyComponent={
          loading ? null : view === 'active' ? (
            <EmptyState icon="chat" title="Inbox zero" body="Customer requests will appear here." />
          ) : (
            <EmptyState icon="chat" title="Nothing closed yet" body="Closed requests are kept here." />
          )
        }
      />
    </View>
  );
}

function Ticket({ item, onDone }: { item: SupportQueueItem; onDone: (message: string) => void }) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState<'answer' | 'close' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const who = item.customer_name || 'the customer';
  const closed = item.status === 'closed';

  const send = async (close: boolean) => {
    const text = reply.trim();
    if (!close && text.length < 2) return setError('Write a reply first');
    setBusy(close ? 'close' : 'answer');
    setError(null);
    try {
      await db.replySupportTicket(item.id, text, close);
      setReply('');
      onDone(
        text.length >= 2
          ? close
            ? 'Reply sent to ' + who + ' and the request closed.'
            : 'Reply sent to ' + who + '.'
          : 'Request closed.',
      );
    } catch (e) {
      setError(e instanceof RuleViolation ? e.message : 'That did not send. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const contact = item.customer_contact;
  const openContact = () => {
    if (!contact) return;
    void Linking.openURL(contact.includes('@') ? 'mailto:' + contact : 'tel:' + contact.replace(/\s/g, ''));
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.topic}>{TOPIC[item.topic]}</Text>
        <StatusPill label={STATUS[item.status].label} tone={STATUS[item.status].tone} />
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>{(item.customer_name || 'Customer') + ' · ' + dateLabel(item.created_at)}</Text>
        {contact ? (
          <Pressable onPress={openContact} accessibilityRole="link" hitSlop={8}>
            <Text style={styles.link}>{contact}</Text>
          </Pressable>
        ) : null}
      </View>
      {item.deal_title ? (
        <Pressable
          onPress={() => item.deal_id && router.push({ pathname: '/deal/[id]', params: { id: item.deal_id } })}
          accessibilityRole="link"
          disabled={!item.deal_id}
        >
          <Text style={[styles.meta, item.deal_id && styles.link]}>
            {item.deal_title}
            {item.redemption_code ? ' · ' + item.redemption_code : ''}
            {item.action_status
              ? ' · ' + (ACTION_STATUS_LABEL[item.action_status as CustomerActionStatus] ?? item.action_status)
              : ''}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.thread}>
        {item.messages.map((m, i) => (
          <View key={i} style={[styles.message, m.author === 'team' && styles.messageTeam]}>
            <Text style={styles.messageBy}>
              {(m.author === 'team' ? 'YOLO team' : 'Customer') + ' · ' + dateLabel(m.created_at)}
            </Text>
            <Text style={styles.messageBody}>{m.body}</Text>
          </View>
        ))}
      </View>

      {closed ? null : (
        <>
          <TextInput
            value={reply}
            onChangeText={(t) => {
              setReply(t);
              setError(null);
            }}
            placeholder={'Reply to ' + who}
            placeholderTextColor={color.textMuted}
            multiline
            accessibilityLabel={'Reply to ' + who}
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button full variant="secondary" loading={busy === 'close'} onPress={() => void send(true)}>
                {reply.trim().length >= 2 ? 'Reply and close' : 'Close request'}
              </Button>
            </View>
            <View style={styles.flex}>
              <Button full variant="cta" loading={busy === 'answer'} onPress={() => void send(false)}>
                Send reply
              </Button>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function Gap() {
  return <View style={{ height: space.md }} />;
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
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: space.lg,
  },
  top: {
    gap: space.sm,
    marginBottom: space.md,
  },
  views: {
    flexDirection: 'row',
    gap: space.sm,
  },
  note: {
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: statusColor.active.bg,
  },
  noteText: {
    ...type.captionMedium,
    color: statusColor.active.fg,
  },
  count: {
    ...type.caption,
    color: color.textSecondary,
  },
  card: {
    padding: space.lg,
    borderRadius: radius.xxl - 2,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    gap: space.xs,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  topic: {
    ...type.h3,
    color: color.text,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: space.sm,
  },
  meta: {
    ...type.small,
    color: color.textSecondary,
  },
  link: {
    ...type.small,
    color: color.brandStrong,
    textDecorationLine: 'underline',
  },
  thread: {
    gap: space.sm,
    marginTop: space.sm,
  },
  message: {
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
    gap: 2,
    marginRight: space.xl,
  },
  messageTeam: {
    backgroundColor: color.background,
    borderWidth: 1,
    borderColor: color.border,
    marginRight: 0,
    marginLeft: space.xl,
  },
  messageBy: {
    ...type.smallMedium,
    color: color.textMuted,
  },
  messageBody: {
    ...type.body,
    color: color.text,
  },
  input: {
    minHeight: 72,
    marginTop: space.sm,
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
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.sm,
  },
});
