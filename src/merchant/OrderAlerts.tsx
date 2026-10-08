/**
 * Asks once, on the merchant dashboard, to let the browser ring for new
 * orders and bookings while this tab is in the background. Web only; the
 * phone apps will use push notifications.
 */

import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { color, radius, space, type } from '../theme/tokens';
import { Button, Icon } from '../components';

type BrowserNotification = { permission: string; requestPermission: () => Promise<string> };

const browser = (): BrowserNotification | null =>
  Platform.OS === 'web' ? ((globalThis as { Notification?: BrowserNotification }).Notification ?? null) : null;

export function OrderAlerts() {
  const [state, setState] = useState(() => browser()?.permission ?? 'unsupported');
  if (state !== 'default') return null;
  return (
    <View style={styles.card}>
      <Icon name="bell" size={20} color={color.brand} />
      <View style={styles.text}>
        <Text style={styles.title}>Get order alerts</Text>
        <Text style={styles.body}>Hear about new orders and bookings even when this tab is in the background.</Text>
      </View>
      <Button
        small
        variant="secondary"
        onPress={() => {
          void browser()
            ?.requestPermission()
            .then(setState)
            .catch(() => setState('denied'));
        }}
      >
        Turn on
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...type.bodySemibold,
    color: color.text,
  },
  body: {
    ...type.caption,
    color: color.textSecondary,
  },
});
