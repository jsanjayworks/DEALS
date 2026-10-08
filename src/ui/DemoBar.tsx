/**
 * A slim bar above every screen while a real build is showing the demo, so
 * nobody mistakes the sample businesses and accounts for real ones, with
 * the way back to the real app.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { demoIsOptional, leaveDemo } from '../data';
import { useDemo } from '../state/session';
import { color, font, space, type } from '../theme/tokens';

export function DemoBar() {
  // Drawn once the page is live: the server renders the real app (useDemo).
  const demo = useDemo();
  if (!(demoIsOptional && demo)) return null;
  return (
    <View style={styles.bar} accessibilityRole="alert">
      <Text style={styles.text} numberOfLines={1}>
        <Text style={styles.tag}>Demo</Text> · sample businesses, nothing here is real
      </Text>
      <Pressable onPress={leaveDemo} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.leave, pressed && { opacity: 0.7 }]}>
        <Text style={styles.leaveText}>Leave demo</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    minHeight: 32,
    paddingHorizontal: space.lg,
    backgroundColor: color.brandStrong,
  },
  text: {
    ...type.small,
    color: color.white,
    flexShrink: 1,
  },
  tag: {
    fontFamily: font.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  leave: {
    paddingVertical: 4,
  },
  leaveText: {
    ...type.smallMedium,
    color: color.white,
    textDecorationLine: 'underline',
  },
});
