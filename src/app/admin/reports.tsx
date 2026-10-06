/**
 * Reports: deals customers flagged ("misleading", "not honoured"), grouped
 * per deal, most reported first. An admin opens the deal to check it, then
 * either dismisses the reports or pauses the deal with a note the merchant
 * receives. A paused deal disappears from customers until the merchant
 * fixes it and resumes it.
 */

import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { db, RuleViolation, type ReportGroup } from '../../data';
import { dateLabel } from '../../lib/format';
import { useQuery } from '../../lib/useQuery';
import { color, radius, space, status as statusColor, type } from '../../theme/tokens';
import { Button, EmptyState, Header, StatusPill } from '../../components';

export default function ReportsScreen() {
  const fetchQueue = useCallback(() => db.listReportsQueue(), []);
  const { data, loading, reload } = useQuery(fetchQueue);
  const queue = data ?? [];
  const total = queue.reduce((n, g) => n + g.open_count, 0);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(t);
  }, [note]);

  return (
    <View style={styles.screen}>
      <Header title="Reports" dark onBack={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
      <FlatList
        data={queue}
        keyExtractor={(g) => g.target_type + g.target_id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {note ? (
              <View style={styles.note} accessibilityLiveRegion="polite">
                <Text style={styles.noteText}>{note}</Text>
              </View>
            ) : null}
            {queue.length > 0 ? (
              <Text style={styles.count}>
                {total} open {total === 1 ? 'report' : 'reports'} on {queue.length}{' '}
                {queue.length === 1 ? 'item' : 'items'}
              </Text>
            ) : null}
          </>
        }
        ItemSeparatorComponent={Gap}
        renderItem={({ item }) => (
          <ReportCard
            group={item}
            onDone={(message) => {
              setNote(message);
              reload();
            }}
          />
        )}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="shield"
              title="No open reports"
              body="When customers report a deal, it appears here to check."
            />
          )
        }
      />
    </View>
  );
}

function ReportCard({ group, onDone }: { group: ReportGroup; onDone: (message: string) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'dismiss' | 'pause' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDeal = group.target_type === 'deal';
  const live = group.deal_status === 'ACTIVE';

  const resolve = async (action: 'dismiss' | 'pause') => {
    if (action === 'pause' && note.trim().length < 5) {
      return setError('Write a note for the merchant: what is wrong and what to fix');
    }
    setBusy(action);
    setError(null);
    try {
      await db.resolveReports(group.target_type, group.target_id, action, action === 'pause' ? note.trim() : undefined);
      onDone(
        action === 'dismiss'
          ? 'Reports on ' + group.title + ' dismissed.'
          : live
            ? group.title + ' is paused and the merchant has your note.'
            : 'The merchant has your note about ' + group.title + '.',
      );
    } catch (e) {
      setError(e instanceof RuleViolation ? e.message : 'That did not go through. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={2}>
          {group.title}
        </Text>
        <StatusPill
          label={group.open_count + (group.open_count === 1 ? ' report' : ' reports')}
          tone={group.open_count > 2 ? 'danger' : 'pending'}
        />
      </View>
      <Text style={styles.meta}>
        {[
          group.business_name,
          isDeal && group.deal_status ? (live ? 'Live' : group.deal_status.toLowerCase()) : null,
          'last ' + dateLabel(group.last_at),
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>

      <View style={styles.reasons}>
        {group.reasons.map((r) => (
          <View key={r} style={styles.reason}>
            <Text style={styles.reasonText}>{r}</Text>
          </View>
        ))}
      </View>
      {group.details.slice(0, 3).map((d, i) => (
        <Text key={i} style={styles.quote}>
          “{d}”
        </Text>
      ))}

      {isDeal ? (
        <Pressable
          onPress={() => router.push({ pathname: '/deal/[id]', params: { id: group.target_id } })}
          accessibilityRole="link"
          hitSlop={8}
          style={styles.view}
        >
          <Text style={styles.viewText}>Open the deal →</Text>
        </Pressable>
      ) : null}

      {isDeal ? (
        <TextInput
          value={note}
          onChangeText={(t) => {
            setNote(t);
            setError(null);
          }}
          placeholder="Note to the merchant if you pause it"
          placeholderTextColor={color.textMuted}
          multiline
          accessibilityLabel={'Note to the merchant about ' + group.title}
          style={styles.input}
        />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button full variant="secondary" loading={busy === 'dismiss'} onPress={() => void resolve('dismiss')}>
            Dismiss
          </Button>
        </View>
        {isDeal ? (
          <View style={styles.flex}>
            <Button full variant="cta" loading={busy === 'pause'} onPress={() => void resolve('pause')}>
              {live ? 'Pause deal' : 'Notify merchant'}
            </Button>
          </View>
        ) : null}
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
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  title: {
    ...type.h3,
    color: color.text,
    flex: 1,
  },
  meta: {
    ...type.small,
    color: color.textSecondary,
  },
  reasons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.xs,
  },
  reason: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceSoftAlt,
  },
  reasonText: {
    ...type.captionMedium,
    color: color.text,
  },
  quote: {
    ...type.caption,
    color: color.text,
    fontStyle: 'italic',
  },
  view: {
    alignSelf: 'flex-start',
    paddingVertical: space.xs,
  },
  viewText: {
    ...type.captionMedium,
    color: color.brandStrong,
  },
  note: {
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: statusColor.active.bg,
    marginBottom: space.md,
  },
  noteText: {
    ...type.captionMedium,
    color: statusColor.active.fg,
  },
  input: {
    minHeight: 64,
    marginTop: space.xs,
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
