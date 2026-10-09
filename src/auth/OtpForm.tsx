/**
 * The sign-in form behind both doors: customer sign-in and the "YOLO for
 * Business" merchant login.
 *
 * While YOLO is being tested, a mobile number alone signs in ("number"): no
 * code, no password. A number with no account asks for a name and makes one.
 * For launch, EXPO_PUBLIC_SIGNIN switches to one-time codes: "phone", "email"
 * or "phone,email" (phone codes need an SMS provider and DLT registration).
 * The demo always signs in by number.
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
import { toast } from '../ui/Toast';

/** "number": mobile number, no code (testing). "phone" and "email": a one-time code. */
type Method = 'number' | 'phone' | 'email';

/** How the real app signs in; the first one listed is the default. */
const REAL_METHODS: Method[] = (() => {
  const raw = process.env.EXPO_PUBLIC_SIGNIN || 'number';
  const list = raw
    .split(',')
    .map((m) => m.trim())
    .filter((m): m is Method => m === 'number' || m === 'phone' || m === 'email');
  return list.length ? list : ['number'];
})();

/** Accepts "98450 12345", "+91 98450 12345" or "919845012345"; returns E.164. */
function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return '+91' + digits;
  if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
  return null;
}

/** "+919000017011" as people write it: "+91 90000 17011". */
const showNumber = (e164: string) => e164.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2');

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
  // The demo has no codes: it signs in by number. Only once the page is live,
  // since the server renders the real app's form (useDemo).
  const methods: Method[] = useDemo() ? ['number'] : REAL_METHODS;
  const [picked, setMethod] = useState<Method>(methods[0]);
  const method = methods.includes(picked) ? picked : methods[0];
  const [value, setValue] = useState('');
  const [target, setTarget] = useState<OtpTarget | null>(null);
  const [code, setCode] = useState('');
  /** A number with no account yet: asking for the name to make one. */
  const [newNumber, setNewNumber] = useState<string | null>(null);
  const [name, setName] = useState('');
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
      if (method === 'phone' || method === 'number') {
        const phone = toE164(value);
        if (!phone) throw new RuleViolation('Enter a 10-digit mobile number');
        t = { phone };
      } else {
        const email = value.trim().toLowerCase();
        if (!EMAIL_RE.test(email)) throw new RuleViolation('Enter a valid email address');
        t = { email };
      }
      if (method === 'number' && 'phone' in t) {
        if ((await api.signInWithNumber(t.phone)) === 'needs_name') {
          setNewNumber(t.phone);
          setName('');
          return;
        }
        hapticSuccess();
        toast('Welcome back');
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

  const create = () =>
    run(async () => {
      if (!newNumber) return;
      if (name.trim().length < 2) throw new RuleViolation('Enter your name');
      await api.signInWithNumber(newNumber, name.trim());
      hapticSuccess();
      toast('Welcome to YOLO, ' + name.trim().split(/\s+/)[0]);
      await onSignedIn();
    });

  const pick = (m: Method) => {
    setMethod(m);
    setValue('');
    setError(null);
  };

  if (newNumber) {
    return (
      <View>
        <Text style={styles.title} accessibilityRole="header">
          Welcome to YOLO
        </Text>
        <Text style={styles.lead}>{showNumber(newNumber)} is new here. What should we call you?</Text>
        <TextInput
          value={name}
          onChangeText={(t) => {
            setName(t);
            setError(null);
          }}
          onSubmitEditing={() => void create()}
          placeholder="Your name"
          placeholderTextColor={color.textMuted}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          accessibilityLabel="Your name"
          autoFocus
          style={[styles.input, styles.nameInput]}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.cta}>
          <Button variant="cta" full loading={busy} onPress={() => void create()}>
            Create my account
          </Button>
        </View>
        <View style={styles.links}>
          <Pressable
            onPress={() => {
              setNewNumber(null);
              setError(null);
            }}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={styles.link}>Change number</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!target) {
    return (
      <View>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.lead}>{lead}</Text>

        {methods.length > 1 ? (
          <View style={styles.methods}>
            {methods.map((m) => (
              <Chip key={m} selected={method === m} onPress={() => pick(m)}>
                {m === 'email' ? 'Email' : 'Phone'}
              </Chip>
            ))}
          </View>
        ) : null}

        <View style={styles.inputRow}>
          {method !== 'email' ? <Text style={styles.prefix}>+91</Text> : null}
          <TextInput
            value={value}
            onChangeText={(t) => {
              setValue(t);
              setError(null);
            }}
            onSubmitEditing={() => void send()}
            placeholder={method !== 'email' ? '98450 12345' : 'you@example.com'}
            placeholderTextColor={color.textMuted}
            keyboardType={method !== 'email' ? 'phone-pad' : 'email-address'}
            autoCapitalize="none"
            autoComplete={method !== 'email' ? 'tel' : 'email'}
            textContentType={method !== 'email' ? 'telephoneNumber' : 'emailAddress'}
            accessibilityLabel={method !== 'email' ? 'Mobile number' : 'Email address'}
            style={styles.input}
          />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.cta}>
          <Button variant="cta" full loading={busy} onPress={() => void send()}>
            {method === 'number' ? 'Continue' : 'Send code'}
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
  nameInput: {
    // The shared input style grows sideways in a row; here it stands alone.
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    height: size.input,
    marginTop: space.xl,
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
