/**
 * Notifications: claim confirmations for customers, approvals and new claims
 * for merchants. Opening one marks it read and goes to the deal it is about.
 */

import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { db } from '../data';
import type { Notification } from '../data/types';
import { shortAgo } from '../lib/format';
import { useQuery } from '../lib/useQuery';
import { useSession } from '../state/session';
import { color, space, type } from '../theme/tokens';
import { Divider, EmptyState, Header, Icon, type IconName } from '../components';

const KIND_ICON: Record<Notification['kind'], IconName> = {
  deal_approved: 'check',
  deal_rejected: 'x',
  action_confirmed: 'ticket',
  new_claim: 'bell',
  ending_soon: 'clock',
  business_verified: 'shield',
  business_rejected: 'x',
};

export default function NotificationsScreen() {
  const account = useSession((s) => s.account);
  const fetchAll = useCallback(() => {
    void account;
    return db.listNotifications();
  }, [account]);
  const { data, loading, reload } = useQuery(fetchAll);

  const open = async (n: Notification) => {
    if (!n.read_at) {
      await db.markNotificationRead(n.id);
      reload();
    }
    const dealId = typeof n.data.deal_id === 'string' ? n.data.deal_id : null;
    if (dealId) router.push({ pathname: '/deal/[id]', params: { id: dealId } });
  };

  return (
    <View style={styles.screen}>
      <Header title="Notifications" onBack={() => router.back()} />
      <FlatList
        data={data ?? []}
        keyExtractor={(n) => n.id}
        ItemSeparatorComponent={Divider}
        contentContainerStyle={{ flexGrow: 1 }}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="bell"
              title="All caught up"
              body="Claims, bookings and deal updates will show up here."
            />
          )
        }
        renderItem={({ item }) => {
          const unread = item.read_at === null;
          return (
            <Pressable
              onPress={() => void open(item)}
              accessibilityRole="button"
              accessibilityLabel={(unread ? 'Unread. ' : '') + item.title + '. ' + item.body}
              style={({ pressed }) => [
                styles.row,
                unread && styles.rowUnread,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.icon, (item.kind === 'deal_rejected' || item.kind === 'business_rejected') && styles.iconAlert]}>
                <Icon
                  name={KIND_ICON[item.kind]}
                  size={18}
                  color={item.kind === 'deal_rejected' || item.kind === 'business_rejected' ? color.alert : color.brand}
                />
              </View>
              <View style={styles.text}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.body}>{item.body}</Text>
              </View>
              <View style={styles.meta}>
                <Text style={styles.ago}>{shortAgo(item.created_at)}</Text>
                {unread ? <View style={styles.dot} /> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.surface,
  },
  row: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
  },
  rowUnread: {
    backgroundColor: color.surfaceSoftAlt,
  },
  pressed: {
    opacity: 0.7,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.surfaceSoftAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconAlert: {
    backgroundColor: '#FDECEF',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...type.bodySemibold,
    color: color.text,
  },
  body: {
    ...type.caption,
    color: color.textSecondary,
  },
  meta: {
    alignItems: 'flex-end',
    gap: 6,
  },
  ago: {
    ...type.small,
    color: color.textMuted,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.alertSoft,
  },
});
