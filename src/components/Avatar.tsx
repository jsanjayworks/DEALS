/**
 * A person's picture, or their initial on the theme's highlight colours when
 * they have not set one. Used in the Home header, on Profile and on the edit
 * screen, so one change shows everywhere.
 */

import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { font, theme } from '../theme/tokens';

export function Avatar({ uri, name, size = 40 }: { uri?: string | null; name: string; size?: number }) {
  const initial = name.trim().charAt(0).toUpperCase() || '·';
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          accessibilityLabel={name + "'s profile picture"}
        />
      ) : (
        <Text style={[styles.initial, { fontSize: Math.round(size * 0.42) }]}>{initial}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.countPill.bg,
  },
  initial: {
    fontFamily: font.semibold,
    color: theme.countPill.text,
  },
});
