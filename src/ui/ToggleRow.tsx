/**
 * A setting that is on or off, with a line saying what it means. The whole
 * row toggles, and screen readers hear it as a switch.
 */

import { useRef } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { color, radius, space, type } from '../theme/tokens';

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  // One tap is one change, even if the click reaches the row twice in one go.
  const firing = useRef(false);
  const toggle = () => {
    if (disabled || firing.current) return;
    firing.current = true;
    setTimeout(() => {
      firing.current = false;
    }, 0);
    onChange(!value);
  };

  return (
    <Pressable
      onPress={toggle}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      aria-checked={value}
      aria-disabled={disabled}
      style={[styles.row, disabled && styles.off]}
    >
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {/* Only a picture of the state: the row is the one control, for taps and screen readers. */}
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" aria-hidden>
        <Switch
          value={value}
          // On the web the switch is a checkbox that would take clicks and a tab
          // stop of its own; disabled it takes neither, and these colours keep its look.
          disabled={disabled || Platform.OS === 'web'}
          trackColor={{ true: color.brand, false: color.border }}
          thumbColor={color.white}
          // React Native Web's own default is teal; keep it in the theme.
          {...({ activeThumbColor: color.white } as object)}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  off: {
    opacity: 0.55,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  label: {
    ...type.bodySemibold,
    color: color.text,
  },
  hint: {
    ...type.caption,
    color: color.textSecondary,
  },
});
