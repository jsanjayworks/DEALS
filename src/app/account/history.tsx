/**
 * Order history: every claim, booking and enquiry, newest first, grouped by
 * month, with what it saved.
 *
 * There is no payment in the app, so "orders" are deals taken; the saving is
 * the deal's discount times the quantity, counted once the code is redeemed
 * (that is when the customer actually paid the lower price). Each row can
 * raise a support request with the claim already attached.
 */

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { db, type ActionWithDeal } from '../../data';
import { ACTION_LABEL, ACTION_STATUS_LABEL, dateLabel } from '../../lib/format';
import { useQuery } from '../../lib/useQuery';
import { useViewer } from '../../state/session';
import { color, font, inr, radius, space, theme, type } from '../../theme/tokens';
import { Button, Chip, EmptyState, Header, Icon, StatusPill } from '../../components';

type Filter = 'all' | 'upcoming' | 'used' | 'closed';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'used', label: 'Used' },
  { key: 'closed', label: 'Cancelled & expired' },
];
const IN: Record<Filter, (a: ActionWithDeal) => boolean> = {
  all: () => true,
  upcoming: (a) => a.status === 'pending' || a.status === 'confirmed',
  used: (a) => a.status === 'redeemed',
  closed: (a) => a.status === 'cancelled' || a.status === 'expired',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** What one action saved: the discount on each unit, times how many. */
function savingOf(a: ActionWithDeal): number {
  const { original_price: was, deal_price: now } = a.deal;
  if (was == null || now == null || was <= now) return 0;
  return (was - now) * a.quantity;
}

export default function OrderHistoryScreen() {
  const viewer = useViewer();
  const [filter, setFilter] = useState<Filter>('all');
  const fetchAll = useCallback(() => {
    void viewer;
    return db.listMyActions();
  }, [viewer]);
  const { data, loading } = useQuery(fetchAll);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  const all = [...(data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const used = all.filter(IN.used);
  const saved = used.reduce((sum, a) => sum + savingOf(a), 0);
  const shown = all.filter(IN[filter]);

  // Month headings, in order of first appearance (the list is newest first).
  const groups: { title: string; items: ActionWithDeal[] }[] = [];
  for (const a of shown) {
    const d = new Date(a.created_at);
    const title = MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    const g = groups[groups.length - 1];
    if (g && g.title === title) g.items.push(a);
    else groups.push({ title, items: [a] });
  }

  return (
    <View style={styles.screen}>
      <Header title="Order history" onBack={close} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.summary}>
          <Text style={styles.summaryKicker}>You have saved</Text>
          <Text style={styles.summaryBig}>{inr(saved)}</Text>
          <Text style={styles.summarySub}>
            {used.length} {used.length === 1 ? 'deal' : 'deals'} used · {all.length} taken in all
          </Text>
        </View>

        <View style={styles.filters}>
          {FILTERS.map((f) => (
            <Chip key={f.key} selected={filter === f.key} onPress={() => setFilter(f.key)} count={all.filter(IN[f.key]).length}>
              {f.label}
            </Chip>
          ))}
        </View>

        {!loading && shown.length === 0 ? (
          <EmptyState
            icon="ticket"
            title={filter === 'all' ? 'Nothing here yet' : 'Nothing in this list'}
            body="Deals you claim, book or enquire about show up here, with what they saved you."
            action={filter === 'all' ? <Button onPress={() => router.dismissTo('/')}>Browse deals</Button> : undefined}
          />
        ) : null}

        {groups.map((g) => (
          <View key={g.title} style={styles.group}>
            <Text style={styles.month}>{g.title}</Text>
            <View style={styles.list}>
              {g.items.map((a, i) => (
                <Row key={a.id} action={a} last={i === g.items.length - 1} />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function Row({ action, last }: { action: ActionWithDeal; last: boolean }) {
  const saving = savingOf(action);
  const d = action.deal;
  return (
    <View style={[styles.row, !last && styles.rowLine]}>
      <Pressable
        onPress={() => router.push({ pathname: '/deal/[id]', params: { id: d.id } })}
        accessibilityRole="button"
        accessibilityLabel={d.title + ', ' + ACTION_STATUS_LABEL[action.status]}
        style={styles.rowMain}
      >
        <Image source={{ uri: d.image }} style={styles.thumb} contentFit="cover" />
        <View style={styles.flex}>
          <Text style={styles.title} numberOfLines={1}>
            {d.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {/* Date first: if the line is cut, it is the business name that goes. */}
            {ACTION_LABEL[action.action_type]} {dateLabel(action.created_at)}
            {action.quantity > 1 ? ' · ×' + action.quantity : ''} · {d.business.name}
          </Text>
          <View style={styles.rowFoot}>
            <StatusPill label={ACTION_STATUS_LABEL[action.status]} />
            {action.redemption_code ? <Text style={styles.code}>{action.redemption_code}</Text> : null}
          </View>
        </View>
        <View style={styles.right}>
          <Text style={styles.price}>{d.deal_price === 0 ? 'Free' : inr((d.deal_price ?? 0) * action.quantity)}</Text>
          {saving > 0 ? (
            <Text style={[styles.saved, action.status !== 'redeemed' && styles.savedPending]}>
              {action.status === 'redeemed' ? 'saved ' : 'saves '}
              {inr(saving)}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        onPress={() => router.push({ pathname: '/account/help', params: { action: action.id } })}
        accessibilityRole="button"
        accessibilityLabel={'Get help with ' + d.title}
        hitSlop={6}
        style={styles.help}
      >
        <Icon name="chat" size={14} color={color.textSecondary} />
        <Text style={styles.helpText}>Get help</Text>
      </Pressable>
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
    minWidth: 0,
  },
  body: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: space.lg,
    paddingBottom: space.xxxl,
    gap: space.md,
  },
  summary: {
    padding: space.xl,
    borderRadius: radius.xxl,
    backgroundColor: theme.hero.colors[1] ?? color.brand,
  },
  summaryKicker: {
    ...type.overline,
    color: theme.hero.muted,
  },
  summaryBig: {
    fontFamily: font.display,
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: -1,
    color: theme.onSelected ?? theme.hero.text,
    fontVariant: ['tabular-nums'],
  },
  summarySub: {
    ...type.caption,
    color: theme.hero.muted,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  group: {
    gap: space.sm,
    marginTop: space.sm,
  },
  month: {
    ...type.overline,
    color: color.textMuted,
  },
  list: {
    borderRadius: radius.xxl - 2,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    overflow: 'hidden',
  },
  row: {
    padding: space.md,
    gap: space.sm,
  },
  rowLine: {
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  rowMain: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'center',
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
  },
  title: {
    ...type.bodySemibold,
    color: color.text,
  },
  meta: {
    ...type.small,
    color: color.textSecondary,
  },
  rowFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: 4,
  },
  code: {
    ...type.smallMedium,
    color: color.text,
    letterSpacing: 0.5,
  },
  right: {
    alignItems: 'flex-end',
  },
  price: {
    ...type.bodySemibold,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  saved: {
    ...type.smallMedium,
    color: color.accentText,
  },
  savedPending: {
    color: color.textMuted,
  },
  help: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
  },
  helpText: {
    ...type.smallMedium,
    color: color.textSecondary,
  },
});
