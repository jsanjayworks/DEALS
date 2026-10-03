/**
 * Buttons and chips, from the `Btn` and `Chip` components in
 * docs/design/figma-make/ui.tsx.
 *
 * Variants, in the design's own terms:
 *   primary    ink fill, white text    — the default action
 *   cta        accent fill, white text — the one action a screen exists for: Claim Deal, Submit
 *   secondary  white fill, brand text, hairline border
 *   text       brand text, no fill
 *
 * The web version animates `active:scale-[.98]` on press. Pressable's `pressed`
 * state gives the same feedback without an Animated value for every button.
 */

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { color, font, radius, size, theme, type } from '../theme/tokens';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'cta' | 'secondary' | 'text';

export interface ButtonProps {
  children: ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  full?: boolean;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  icon?: IconName;
  accessibilityLabel?: string;
}

const FILL: Record<ButtonVariant, string> = {
  primary: color.brand,
  cta: color.cta,
  secondary: color.surface,
  text: 'transparent',
};

const LABEL: Record<ButtonVariant, string> = {
  primary: color.onBrand,
  cta: color.onCta,
  secondary: color.brand,
  text: color.brand,
};

export function Button({
  children,
  onPress,
  variant = 'primary',
  full,
  disabled,
  loading,
  small,
  icon,
  accessibilityLabel,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const height = small ? size.buttonSmall : size.button;
  const tint = LABEL[variant];
  // The theme may give the main action a sheen (gold, on the premium theme).
  const sheen = variant === 'cta' && theme.accentGradient ? theme.accentGradient : null;
  const corner = variant === 'text' ? radius.lg : (theme.buttonRadius ?? radius.lg);

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          borderRadius: corner,
          paddingHorizontal: small ? 16 : 20,
          backgroundColor: FILL[variant],
          alignSelf: full ? 'stretch' : 'flex-start',
        },
        sheen && styles.sheenShadow,
        variant === 'secondary' && styles.bordered,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      {sheen ? (
        <LinearGradient
          colors={sheen}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: corner }]}
          pointerEvents="none"
        />
      ) : null}
      {loading ? (
        <ActivityIndicator color={tint} size="small" />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={small ? 16 : 18} color={tint} /> : null}
          {typeof children === 'string' ? (
            <Text
              style={[styles.label, { color: tint, fontSize: small ? 14 : 15 }]}
              numberOfLines={1}
            >
              {children}
            </Text>
          ) : (
            children
          )}
        </View>
      )}
    </Pressable>
  );
}

export interface ChipProps {
  children: ReactNode;
  onPress?: () => void;
  /** Selected state: brand fill with white text. */
  selected?: boolean;
  /** Trailing count, e.g. the tab chips on My Deals. */
  count?: number;
}

export function Chip({ children, onPress, selected, count }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipOn : styles.chipOff,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipLabel, { color: selected ? color.onBrand : color.text }]}>
        {children}
      </Text>
      {count !== undefined ? (
        <Text
          style={[
            styles.chipCount,
            { color: selected ? color.onBrand : color.textSecondary },
          ]}
        >
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  sheenShadow: {
    shadowColor: color.accentText,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  bordered: {
    borderWidth: 1,
    borderColor: color.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontFamily: font.semibold,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.4,
  },
  chip: {
    height: size.chip,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  chipOn: {
    backgroundColor: color.brand,
    borderColor: color.brand,
  },
  chipOff: {
    backgroundColor: color.surface,
    borderColor: color.border,
  },
  chipLabel: {
    ...type.captionMedium,
  },
  chipCount: {
    ...type.captionMedium,
    opacity: 0.7,
    fontVariant: ['tabular-nums'],
  },
});
