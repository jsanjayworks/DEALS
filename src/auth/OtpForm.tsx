/**
 * The one-time-code form behind both doors: customer sign-in and the
 * "YOLO for Business" merchant login. The real app signs in by mobile number,
 * the way people in India expect; EXPO_PUBLIC_SIGNIN can widen it to
 * "phone,email" or switch to "email" (phone codes need an SMS provider and
 * DLT registration; Supabase test numbers work before that). The demo signs
 * in by email, because its ready-made accounts are email addresses.
 *
 * Both doors lead to the same account. What the account can open afterwards
 * (merchant mode, admin) comes from the data, so the form only signs in and
 * hands back; the screen around it decides where to go next.
 */

import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { RuleViolation, type AuthApi, type OtpTarget } from '../data';
import { useDemo } from '../state/session';
import { hapticSuccess } from '../lib/device';
import { color, font, radius, size, space, type } from '../theme/tokens';
import { Button, Chip } from '../components';
import { reach } from '../lib/a11y';

type Method = 'phone' | 'email';

/** How the real app signs in; the first one listed is the default. */
const REAL_METHODS: Method[] = (() => {
  const raw = process.env.EXPO_PUBLIC_SIGNIN || (process.env.EXPO_PUBLIC_PHONE_SIGNIN === 'on' ? 'phone,email' : 'phone');
  const list = raw
    .split(',')
    .map((m) => m.trim())
    .filter((m): m is Method => m === 'phone' || m === 'email');
  return list.length ? list : ['phone'];
})();

/** Accepts "98450 12345", "+91 98450 12345" or "919845012345"; returns E.164. */
function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return '+91' + digits;
  if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function OtpForm({
  api,
  title,
  lead,
  footer,
  codeHint,
  onSignedIn,
}: {
  api: AuthApi;
  /** Heading on the first step; the code step always reads "Enter the code". */
  title: string;
  lead: string;
  /** Under the Send code button on the first step, e.g. the link to the other door. */
  footer?: ReactNode;
  /** Under "Sent to …" on the code step, e.g. the demo's fixed code. */
  codeHint?: string;
  onSignedIn: () => void | Promise<void>;
}) {
  // The demo has no codes: Continue signs in with the address as it is. Only
  // once the page is live, since the server renders the real app's form (useDemo).
  const instant = useDemo() && typeof api.signInWithoutCode === 'function';
  const methods: Method[] = instant ? ['email'] : REAL_METHODS;
  const [picked, setMethod] = useState<Method>(methods[0]);
  const method = methods.includes(picked) ? picked : methods[0];
  const [value, setValue] = useState('');
  const [target, setTarget] = useState<OtpTarget | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof RuleViolation ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    run(async () => {
      let t: OtpTarget;
      if (method === 'phone') {
        const phone = toE164(value);
        if (!phone) throw new RuleViolation('Enter a 10-digit mobile number');
        t = { phone };
      } else {
        const email = value.trim().toLowerCase();
        if (!EMAIL_RE.test(email)) throw new RuleViolation('Enter a valid email address');
        t = { email };
      }
      if (instant && api.signInWithoutCode) {
        await api.signInWithoutCode(t);
        hapticSuccess();
        await onSignedIn();
        return;
      }
      await api.sendCode(t);
      setTarget(t);
      setCode('');
    });

  const verify = () =>
    run(async () => {
      if (!target) return;
      if (!/^\d{6}$/.test(code)) throw new RuleViolation('Enter the 6-digit code');
      await api.verifyCode(target, code);
      hapticSuccess();
      await onSignedIn();
    });

  const pick = (m: Method) => {
    setMethod(m);
    setValue('');
    setError(null);
  };

  if (!target) {
    return (
      <View>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.lead}>{lead}</Text>

        {methods.length > 1 ? (
          <View style={styles.methods}>
            <Chip selected={method === 'phone'} onPress={() => pick('phone')}>
              Phone
            </Chip>
            <Chip selected={method === 'email'} onPress={() => pick('email')}>
              Email
            </Chip>
          </View>
        ) : null}

        <View style={styles.inputRow}>
          {method === 'phone' ? <Text style={styles.prefix}>+91</Text> : null}
          <TextInput
            value={value}
            onChangeText={(t) => {
              setValue(t);
              setError(null);
            }}
            onSubmitEditing={() => void send()}
            placeholder={method === 'phone' ? '98450 12345' : 'you@example.com'}
            placeholderTextColor={color.textMuted}
            keyboardType={method === 'phone' ? 'phone-pad' : 'email-address'}
            autoCapitalize="none"
            autoComplete={method === 'phone' ? 'tel' : 'email'}
            textContentType={method === 'phone' ? 'telephoneNumber' : 'emailAddress'}
            accessibilityLabel={method === 'phone' ? 'Mobile number' : 'Email address'}
            style={styles.input}
          />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.cta}>
          <Button variant="cta" full loading={busy} onPress={() => void send()}>
            {instant ? 'Continue' : 'Send code'}
          </Button>
        </View>
        <Text style={styles.agree}>
          By continuing you agree to the{' '}
          <Text style={styles.agreeLink} accessibilityRole="link" onPress={() => router.push('/legal/terms')}>
            Terms of use
          </Text>{' '}
          and the{' '}
          <Text style={styles.agreeLink} accessibilityRole="link" onPress={() => router.push('/legal/privacy')}>
            Privacy policy
          </Text>
          .
        </Text>
        {footer}
      </View>
    );
  }

  const sentTo = 'phone' in target ? target.phone : target.email;
  return (
    <View>
      <Text style={styles.title} accessibilityRole="header">
        Enter the code
      </Text>
      <Text style={styles.lead}>Sent to {sentTo}</Text>
      {codeHint ? <Text style={styles.hint}>{codeHint}</Text> : null}

      <TextInput
        value={code}
        onChangeText={(t) => {
          setCode(t.replace(/\D/g, '').slice(0, 6));
          setError(null);
        }}
        onSubmitEditing={() => void verify()}
        placeholder="123456"
        placeholderTextColor={color.textMuted}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        accessibilityLabel="One-time code"
        autoFocus
        style={[styles.input, styles.codeInput]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.cta}>
        <Button variant="cta" full loading={busy} onPress={() => void verify()}>
          Verify and sign in
        </Button>
      </View>
      <View style={styles.links}>
        <Pressable onPress={() => void send()} accessibilityRole="button" hitSlop={8} style={reach(8)}>
          <Text style={styles.link}>Send a new code</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setTarget(null);
            setError(null);
          }}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={styles.link}>Change {'phone' in target ? 'number' : 'email'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A quiet link under the form that points at the other door. */
export function DoorLink({ prompt, action, onPress }: { prompt: string; action: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8} style={styles.door}>
      <Text style={styles.doorText}>
        {prompt} <Text style={styles.doorAction}>{action} →</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hint: {
    ...type.captionMedium,
    color: color.accentText,
    marginTop: space.xs,
  },
  title: {
    ...type.h1,
    color: color.text,
  },
  lead: {
    ...type.body,
    color: color.textSecondary,
    marginTop: space.xs,
  },
  agree: {
    ...type.caption,
    color: color.textSecondary,
    textAlign: 'center',
    marginTop: space.md,
  },
  agreeLink: {
    color: color.brandStrong,
    textDecorationLine: 'underline',
  },
  methods: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xl,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.lg,
  },
  prefix: {
    ...type.bodySemibold,
    color: color.text,
    height: size.input,
    lineHeight: size.input,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    height: size.input,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    ...type.body,
    color: color.text,
  },
  codeInput: {
    flex: 0,
    marginTop: space.xl,
    height: 64,
    fontFamily: font.bold,
    fontSize: 28,
    letterSpacing: 8,
    textAlign: 'center',
  },
  error: {
    ...type.captionMedium,
    color: color.alert,
    marginTop: space.sm,
  },
  cta: {
    marginTop: space.xl,
  },
  links: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.lg,
  },
  link: {
    ...type.captionMedium,
    fontFamily: font.semibold,
    color: color.brand,
  },
  door: {
    marginTop: space.xl,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doorText: {
    ...type.caption,
    color: color.textSecondary,
    textAlign: 'center',
  },
  doorAction: {
    fontFamily: font.semibold,
    color: color.brand,
  },
});
