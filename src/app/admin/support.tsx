/**
 * Support inbox: customer requests, open ones first. Each shows who sent it,
 * the claim it is about (code and status) when there is one, and the
 * message. An admin replies, and either leaves it answered (the customer can
 * follow up) or closes it. The customer is notified either way.
 */

import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { db, RuleViolation, type SupportQueueItem, type SupportTopic } from '../../data';
import { dateLabel } from '../../lib/format';
import { useQuery } from '../../lib/useQuery';
import { color, radius, space, type } from '../../theme/tokens';
import { Button, EmptyState, Header, StatusPill } from '../../components';

const TOPIC: Record<SupportTopic, string> = {
  claim_problem: 'Problem with a claim',
  payment_refund: 'Payment or refund',
  deal_wrong: 'Deal not as described',
  account: 'Account',
  account_deletion: 'Account deletion',
  other: 'Other',
};

export default function SupportInboxScreen() {
  const fetchQueue = useCallback(() => db.listSupportQueue(), []);
  const { data, loading, reload } = useQuery(fetchQueue);
  const queue = data ?? [];
  const open = queue.filter((t) => t.status === 'open').length;

  return (
    <View style={styles.screen}>
      <Header title="Support inbox" dark onBack={() => router.back()} />
      <FlatList
        data={queue}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={queue.length > 0 ? <Text style={styles.count}>{open} open</Text> : null}
        ItemSeparatorComponent={Gap}
        renderItem={({ item }) => <Ticket item={item} onDone={reload} />}
        ListEmptyComponent={
          loading ? null : <EmptyState icon="chat" title="Inbox zero" body="Customer requests will appear here." />
        }
      />
    </View>
  );
}

function Ticket({ item, onDone }: { item: SupportQueueItem; onDone: () => void }) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState<'answer' | 'close' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (close: boolean) => {
    if (reply.trim().length < 2) return setError('Write a reply first');
    setBusy(close ? 'close' : 'answer');
    setError(null);
    try {
      await db.replySupportTicket(item.id, reply.trim(), close);
      setReply('');
      onDone();
    } catch (e) {
      setError(e instanceof RuleViolation ? e.message : 'That did not send. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.topic}>{TOPIC[item.topic]}</Text>
        <StatusPill
          label={item.status === 'open' ? 'Open' : 'Answered'}
          tone={item.status === 'open' ? 'pending' : 'active'}
        />
      </View>
      <Text style={styles.meta}>
        {[item.customer_name || 'Customer', item.customer_contact, dateLabel(item.created_at)].filter(Boolean).join(' · ')}
      </Text>
      {item.deal_title ? (
        <Text style={styles.meta}>
          {item.deal_title}
          {item.redemption_code ? ' · ' + item.redemption_code : ''}
          {item.action_status ? ' · ' + item.action_status : ''}
        </Text>
      ) : null}
      <Text style={styles.message}>{item.message}</Text>
      {item.reply ? (
        <View style={styles.previous}>
          <Text style={styles.previousLabel}>Your last reply</Text>
          <Text style={styles.meta}>{item.reply}</Text>
        </View>
      ) : null}

      <TextInput
        value={reply}
        onChangeText={(t) => {
          setReply(t);
          setError(null);
        }}
        placeholder="Reply to the customer"
        placeholderTextColor={color.textMuted}
        multiline
        accessibilityLabel={'Reply to ' + (item.customer_name || 'customer')}
        style={styles.input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button full variant="secondary" loading={busy === 'close'} onPress={() => void send(true)}>
            Reply and close
          </Button>
        </View>
        <View style={styles.flex}>
          <Button full variant="cta" loading={busy === 'answer'} onPress={() => void send(false)}>
            Send reply
          </Button>
        </View>
      </View>
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
    padding: space.lg,
  },
  count: {
    ...type.caption,
    color: color.textSecondary,
    marginBottom: space.md,
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
  },
  meta: {
    ...type.small,
    color: color.textSecondary,
  },
  message: {
    ...type.body,
    color: color.text,
    marginTop: space.xs,
  },
  previous: {
    marginTop: space.xs,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
    gap: 2,
  },
  previousLabel: {
    ...type.smallMedium,
    color: color.textMuted,
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
