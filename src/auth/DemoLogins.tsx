/**
 * The ready-made demo accounts, under the sign-in form on the demo website.
 * Any other email works too and makes a new account; these are one tap.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { auth, DEMO_LOGINS, type DemoAccountKind } from '../data';
import { hapticSuccess } from '../lib/device';
import { color, radius, space, type } from '../theme/tokens';
import { Icon, type IconName } from '../components';

const ICON: Record<DemoAccountKind, IconName> = {
  customer: 'user',
  merchant: 'store',
  admin: 'shield',
};

export function DemoLogins({
  only,
  onSignedIn,
}: {
  /** Which accounts, in this order; the merchant door lists the merchant first. */
  only?: DemoAccountKind[];
  onSignedIn: (kind: DemoAccountKind) => void;
}) {
  const [busy, setBusy] = useState<DemoAccountKind | null>(null);
  const logins = only
    ? DEMO_LOGINS.filter((l) => only.includes(l.kind)).sort((a, b) => only.indexOf(a.kind) - only.indexOf(b.kind))
    : DEMO_LOGINS;

  const signIn = async (kind: DemoAccountKind, email: string) => {
    setBusy(kind);
    try {
      await auth.verifyCode({ email }, '');
      hapticSuccess();
      onSignedIn(kind);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Demo accounts</Text>
      <Text style={styles.body}>Ready-made, with deals and orders already in them. Tap one to sign in.</Text>
      {logins.map((l) => (
        <Pressable
          key={l.kind}
          onPress={() => void signIn(l.kind, l.email)}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityLabel={'Sign in as the demo ' + l.label.toLowerCase() + ', ' + l.who}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <View style={styles.icon}>
            <Icon name={ICON[l.kind]} size={18} color={color.brand} />
          </View>
          <View style={styles.text}>
            <Text style={styles.label}>
              {l.label} · <Text style={styles.who}>{l.who}</Text>
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {l.email}
            </Text>
          </View>
          <Text style={styles.go}>{busy === l.kind ? '…' : 'Sign in →'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: space.xl,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: color.surfaceSoftAlt,
    gap: space.sm,
  },
  title: {
    ...type.bodySemibold,
    color: color.text,
  },
  body: {
    ...type.caption,
    color: color.textSecondary,
    marginBottom: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  pressed: {
    opacity: 0.7,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surfaceSoftAlt,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    ...type.captionMedium,
    color: color.text,
  },
  who: {
    ...type.caption,
    color: color.textSecondary,
  },
  email: {
    ...type.small,
    color: color.textMuted,
  },
  go: {
    ...type.captionMedium,
    color: color.brand,
  },
});
