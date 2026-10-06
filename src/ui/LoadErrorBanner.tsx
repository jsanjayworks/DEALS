/**
 * A slim notice low on every screen when something failed to load or
 * the device is offline, with one Retry for all of it. It sits over the page
 * rather than replacing it, so whatever did load stays readable.
 */

import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadErrorSnapshot, loadErrorState, retryAll, subscribeLoadErrors } from '../lib/loadErrors';
import { radius, shadow, space, status, type } from '../theme/tokens';
import { Icon } from '../components';

export function LoadErrorBanner() {
  useSyncExternalStore(subscribeLoadErrors, loadErrorSnapshot, loadErrorSnapshot);
  const insets = useSafeAreaInsets();
  const { failing, offline } = loadErrorState();
  if (!offline && failing === 0) return null;

  return (
    // Low on the screen, clear of the tab bar and a deal's action bar, so it
    // never covers a back button or the header.
    <View style={[styles.wrap, { bottom: insets.bottom + 104 }]} pointerEvents="box-none">
      <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Icon name="wifi" size={16} color={status.danger.fg} />
        <Text style={styles.text}>
          {offline ? 'You are offline. Deals will load when you reconnect.' : 'Something did not load. Check your connection.'}
        </Text>
        {offline ? null : (
          <Pressable onPress={retryAll} accessibilityRole="button" hitSlop={10} style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: space.lg,
    zIndex: 1000,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    maxWidth: 520,
    width: '100%',
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    backgroundColor: status.danger.bg,
    borderWidth: 1,
    borderColor: 'rgba(185,28,28,0.18)',
    ...shadow.card,
  },
  text: {
    ...type.captionMedium,
    color: status.danger.fg,
    flex: 1,
  },
  retry: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    minHeight: 32,
    justifyContent: 'center',
  },
  retryText: {
    ...type.captionMedium,
    color: status.danger.fg,
    textDecorationLine: 'underline',
  },
});
