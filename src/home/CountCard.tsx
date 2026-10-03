/**
 * The headline tile on Home: how many deals are live within the chosen
 * distance, in the theme's hero colours (navy and gold on premium), with the
 * distance selector inside it. The number rolls when the distance or the
 * locality changes, so the card is the answer to "what is near me" at a glance.
 */

import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { RollingNumber } from '../components';
import { font, radius, space, theme, type } from '../theme/tokens';
import { RadiusSelector } from './RadiusSelector';

export function CountCard({
  count,
  caption,
  options,
  radiusM,
  onRadius,
}: {
  count: number | null;
  caption: string;
  options: readonly { label: string; m: number }[];
  radiusM: number;
  onRadius: (m: number) => void;
}) {
  return (
    <View style={styles.card}>
      <LinearGradient
        colors={theme.hero.colors}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* A soft ring in the corner, for depth without another colour. */}
      <View style={styles.ring} pointerEvents="none" />

      <View accessible accessibilityLabel={(count ?? 0) + ' ' + caption}>
        <RollingNumber value={count ?? 0} style={styles.count} />
        <Text style={styles.caption}>{caption}</Text>
      </View>
      <View style={styles.selector}>
        <RadiusSelector options={options} value={radiusM} onChange={onRadius} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xxl + 2,
    overflow: 'hidden',
    paddingHorizontal: space.xl,
    paddingTop: space.lg + 2,
    paddingBottom: 2,
  },
  ring: {
    position: 'absolute',
    right: -48,
    top: -48,
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 28,
    borderColor: 'rgba(226,190,90,0.10)',
  },
  count: {
    fontFamily: font.display,
    fontSize: 64,
    lineHeight: 70,
    letterSpacing: -2,
    color: theme.onSelected ?? theme.hero.text,
    fontVariant: ['tabular-nums'],
  },
  caption: {
    ...type.bodyMedium,
    color: theme.hero.muted,
    marginTop: -2,
  },
  selector: {
    marginTop: space.md,
  },
});
