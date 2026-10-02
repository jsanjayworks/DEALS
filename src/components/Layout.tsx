/**
 * Layout primitives, from `Top`, `Section`, `Label` and `Field` in
 * docs/design/figma-make/ui.tsx.
 *
 * The `dark` header is how the design signals merchant mode: the same app, a
 * deep plum bar instead of white.
 */

import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, font, radius, size, type } from '../theme/tokens';
import { Icon } from './Icon';

export interface HeaderProps {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  /** Merchant mode: plum bar, white text. */
  dark?: boolean;
}

export function Header({ title, onBack, right, dark }: HeaderProps) {
  const insets = useSafeAreaInsets();
  const tint = dark ? color.white : color.text;

  return (
    <View
      style={[
        styles.header,
        dark ? styles.headerDark : styles.headerLight,
        { paddingTop: insets.top },
      ]}
    >
      <View style={styles.headerRow}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Icon name="back" size={22} color={tint} />
          </Pressable>
        ) : null}
        <Text
          style={[styles.headerTitle, { color: tint }, !onBack && styles.headerTitleInset]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {right}
      </View>
    </View>
  );
}

export interface SectionProps {
  title: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
}

export function Section({ title, action, onAction, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action ? (
          <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.sectionAction}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export interface FieldProps extends TextInputProps {
  label: string;
  /** Shown in alert red under the input. */
  error?: string | null;
}

export function Field({ label, error, style, ...props }: FieldProps) {
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <TextInput
        {...props}
        placeholderTextColor={color.textMuted}
        style={[styles.input, !!error && styles.inputError, style]}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

/** Full-bleed divider matching the 1px hairline the design uses everywhere. */
export function Divider() {
  return <View style={styles.divider} />;
}

/** Centred empty / error state: icon, headline, body, optional action. */
export function EmptyState({
  icon = 'pin',
  title,
  body,
  action,
  tone = 'brand',
}: {
  icon?: Parameters<typeof Icon>[0]['name'];
  title: string;
  body?: string;
  action?: ReactNode;
  tone?: 'brand' | 'alert';
}) {
  const tint = tone === 'alert' ? color.alert : color.brand;
  return (
    <View style={styles.empty}>
      <View
        style={[
          styles.emptyIcon,
          { backgroundColor: tone === 'alert' ? '#FDECEF' : color.background },
        ]}
      >
        <Icon name={icon} size={32} color={tint} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    zIndex: 20,
  },
  headerLight: {
    backgroundColor: color.surface,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  headerDark: {
    backgroundColor: color.brandStrong,
  },
  headerRow: {
    height: size.header,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  pressed: {
    opacity: 0.6,
  },
  headerTitle: {
    ...type.h3,
    flex: 1,
  },
  headerTitleInset: {
    paddingLeft: 12,
  },
  section: {
    marginTop: 28,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    ...type.h2,
    color: color.text,
  },
  sectionAction: {
    ...type.captionMedium,
    fontFamily: font.semibold,
    color: color.brand,
  },
  label: {
    ...type.overline,
    color: color.textSecondary,
    marginBottom: 8,
  },
  field: {
    gap: 0,
  },
  input: {
    height: size.input,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    ...type.body,
    color: color.text,
  },
  inputError: {
    borderColor: color.alert,
  },
  errorText: {
    ...type.caption,
    color: color.alert,
    marginTop: 6,
  },
  divider: {
    height: 1,
    backgroundColor: color.border,
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 72,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...type.h2,
    color: color.text,
    marginTop: 20,
    textAlign: 'center',
  },
  emptyBody: {
    ...type.body,
    color: color.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  emptyAction: {
    marginTop: 24,
  },
});
