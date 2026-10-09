/**
 * "Just looking?" on the real sign-in screens: a way into the demo, with
 * sample businesses and deals, for anyone who wants to see how YOLO works
 * before signing up. Web only, since the demo keeps its data in the browser.
 */

import { Platform, StyleSheet, Text, View } from 'react-native';
import { demoIsOptional, enterDemo } from '../data';
import { useDemo } from '../state/session';
import { color, radius, space, type } from '../theme/tokens';
import { Button } from '../components';

export function ExploreDemo({ lead }: { lead?: string }) {
  // Hidden once the page is live in the demo; the server renders the real app (useDemo).
  const demo = useDemo();
  if (!(demoIsOptional && !demo && Platform.OS === 'web')) return null;
  return (
    <View style={styles.box}>
      <Text style={styles.title}>Just looking around?</Text>
      <Text style={styles.body}>
        {lead ??
          'Explore the demo: sample businesses and deals to try ordering, booking and listing a business. Nothing there is real, and it stays in this browser.'}
      </Text>
      <Button small variant="secondary" icon="sparkles" onPress={enterDemo}>
        Explore the demo
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: space.sm,
    marginTop: space.xl,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: color.surfaceSoftAlt,
    alignItems: 'flex-start',
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
