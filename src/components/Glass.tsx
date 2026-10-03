/**
 * Frosted glass: the floating tab bar, the header over the spotlight, the round
 * buttons over photos.
 *
 * iOS and web get a real blur (web through CSS backdrop-filter). Android's blur
 * needs the content behind it wrapped in a BlurTargetView, which does not suit
 * chrome that floats over whatever screen is showing, so Android gets a
 * near-opaque tint instead: the same surface, without the blur.
 *
 * On web the blur is an absolutely positioned layer, which paints above any
 * child that is not itself positioned. Views are; a bare Svg icon is not, so
 * wrap icons in a View or they come out blurred.
 */

import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { alpha, color, theme } from '../theme/tokens';

export type GlassTone = 'light' | 'dark' | 'brand' | 'hero' | 'accent';

export interface GlassProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * light  over light content
   * dark   over photos
   * brand  brand-coloured glass, for the header over the hero
   * accent glass in the accent colour
   */
  tone?: GlassTone;
  intensity?: number;
  /** Draw the bright hairline edge that makes it read as glass. */
  edge?: boolean;
}

const TINT: Record<GlassTone, { blur: 'light' | 'dark'; blurred: string; solid: string; edge: string }> = {
  light: {
    blur: 'light',
    blurred: 'rgba(255,255,255,0.74)',
    solid: 'rgba(255,255,255,0.96)',
    edge: 'rgba(0,0,0,0.07)',
  },
  dark: {
    blur: 'dark',
    blurred: alpha(color.text, 0.38),
    solid: alpha(color.text, 0.86),
    edge: 'rgba(255,255,255,0.16)',
  },
  brand: {
    blur: 'dark',
    blurred: alpha(color.brandStrong, 0.62),
    solid: alpha(color.brandStrong, 0.96),
    edge: 'rgba(255,255,255,0.14)',
  },
  hero: {
    blur: theme.hero.light ? 'light' : 'dark',
    blurred: alpha(theme.hero.colors[0], 0.78),
    solid: alpha(theme.hero.colors[0], 0.97),
    edge: 'rgba(255,255,255,0.12)',
  },
  accent: {
    blur: 'light',
    blurred: alpha(color.cta, 0.84),
    solid: alpha(color.cta, 0.97),
    edge: 'rgba(255,255,255,0.55)',
  },
};

export function Glass({ children, style, tone = 'light', intensity = 40, edge = true }: GlassProps) {
  const t = TINT[tone];
  const edgeStyle = edge
    ? { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: t.edge }
    : null;

  if (Platform.OS === 'android') {
    return (
      <View style={[{ backgroundColor: t.solid, overflow: 'hidden' }, edgeStyle, style]}>
        {children}
      </View>
    );
  }
  // The blur and the tint are separate layers. On web, BlurView paints its own
  // tint over any backgroundColor it is given, which turned accent and brand glass
  // grey; a tint layer above the blur keeps the palette colour on every platform.
  // Chrome does not clip a backdrop-filter to its parent's rounded corners, so
  // the layers carry the radius themselves or square corners show through.
  const corners = { borderRadius: StyleSheet.flatten(style)?.borderRadius };
  return (
    <View style={[{ overflow: 'hidden' }, edgeStyle, style]}>
      <BlurView intensity={intensity} tint={t.blur} style={[StyleSheet.absoluteFill, corners]} />
      <View
        style={[StyleSheet.absoluteFill, corners, { backgroundColor: t.blurred }]}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}
