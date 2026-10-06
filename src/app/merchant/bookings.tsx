/**
 * Bookings: every table, chair and slot booked, by day, the way a host stand
 * keeps them. Upcoming starts with today (earlier ones today stay, marked
 * Redeemed or not); Past goes back from yesterday.
 */

import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { db, type BusinessOrder } from '../../data';
import { slotKey } from '../../data/booking';
import { dayHeading } from '../../lib/format';
import { useQuery } from '../../lib/useQuery';
import { BookingRow } from '../../merchant/BookingRow';
import { useBusinessId } from '../../merchant/useBusiness';
import { color, radius, space, type } from '../../theme/tokens';
import { Chip, EmptyState, Header } from '../../components';

type View_ = 'upcoming' | 'past';

export default function BookingsScreen() {
  const businessId = useBusinessId();
  const [view, setView] = useState<View_>('upcoming');

  const fetchBookings = useCallback(async () => {
    if (!businessId) return null;
    const orders = await db.listBusinessOrders(businessId);
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const from = midnight.getTime();
    const booked = orders.filter((o) => o.slot_start != null);
    const upcoming = booked
      .filter((o) => slotKey(o.slot_start!) >= from && o.status !== 'cancelled')
      .sort((a, b) => slotKey(a.slot_start!) - slotKey(b.slot_start!));
    const past = booked
      .filter((o) => slotKey(o.slot_start!) < from || o.status === 'cancelled')
      .sort((a, b) => slotKey(b.slot_start!) - slotKey(a.slot_start!));
    return { upcoming, past };
  }, [businessId]);
  const { data } = useQuery(fetchBookings);

  const list = (view === 'upcoming' ? data?.upcoming : data?.past) ?? [];
  const groups: { day: string; items: BusinessOrder[] }[] = [];
  for (const b of list) {
    const day = dayHeading(b.slot_start!);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(b);
    else groups.push({ day, items: [b] });
  }

  return (
    <View style={styles.screen}>
      <Header title="Bookings" onBack={() => (router.canGoBack() ? router.back() : router.replace('/merchant'))} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.chips}>
          <Chip selected={view === 'upcoming'} onPress={() => setView('upcoming')} count={data?.upcoming.length}>
            Upcoming
          </Chip>
          <Chip selected={view === 'past'} onPress={() => setView('past')} count={data?.past.length}>
            Past
          </Chip>
        </View>

        {data && groups.length === 0 ? (
          <EmptyState
            icon="clock"
            title={view === 'upcoming' ? 'No bookings coming up' : 'No past bookings'}
            body="Bookings appear here when customers reserve a table or pick a time on your deals."
          />
        ) : null}

        {groups.map((g) => (
          <View key={g.day} style={styles.group}>
            <Text style={styles.day}>
              {g.day} · {g.items.length} {g.items.length === 1 ? 'booking' : 'bookings'}
            </Text>
            <View style={styles.card}>
              {g.items.map((b, i) => (
                <BookingRow
                  key={b.id}
                  booking={b}
                  last={i === g.items.length - 1}
                  onPress={() => router.push({ pathname: '/merchant/deal/[id]', params: { id: b.deal_id } })}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.background,
  },
  content: {
    padding: space.xl,
    paddingBottom: space.xxxl,
    gap: space.lg,
  },
  chips: {
    flexDirection: 'row',
    gap: space.sm,
  },
  group: {
    gap: space.sm,
  },
  day: {
    ...type.overline,
    color: color.textSecondary,
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
});
