/**
 * Edit profile: picture, name, email and date of birth.
 *
 * Phone is shown but not editable: it is how the person signs in, so changing
 * it belongs to sign-in, not to a form. Date of birth is what unlocks 18+ and
 * 21+ deals; it is entered as DD/MM/YYYY, the way people in India write it.
 */

import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, refreshViewer, RuleViolation, type AppViewer } from '../../data';
import { hapticSuccess } from '../../lib/device';
import { useViewer } from '../../state/session';
import { color, radius, space, type } from '../../theme/tokens';
import { Avatar, Button, EmptyState, Field, Header } from '../../components';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "2001-04-12" -> "12/04/2001". */
const toDisplay = (iso: string | null | undefined) =>
  iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';

/** "12/04/2001" -> "2001-04-12" when it is a real date between 13 and 100 years ago, else an error. */
function parseDob(text: string): { iso: string | null } | { error: string } {
  const t = text.trim();
  if (!t) return { iso: null };
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (!m) return { error: 'Write your date of birth as DD/MM/YYYY' };
  const [, dd, mm, yyyy] = m;
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  if (date.getUTCDate() !== Number(dd) || date.getUTCMonth() !== Number(mm) - 1) {
    return { error: 'That date does not exist' };
  }
  const age = (Date.now() - date.getTime()) / (365.25 * 86_400_000);
  if (age < 13 || age > 100) return { error: 'Check the year of your date of birth' };
  return { iso: yyyy + '-' + mm + '-' + dd };
}

/** Types the slashes for you: 12042001 -> 12/04/2001. */
function maskDob(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/');
}

export default function EditProfileScreen() {
  const viewer = useViewer();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  if (!viewer) {
    return (
      <View style={styles.screen}>
        <Header title="Edit profile" onBack={close} />
        <EmptyState icon="user" title="Sign in first" action={<Button onPress={() => router.push('/sign-in')}>Sign in</Button>} />
      </View>
    );
  }
  // Keyed by account, so switching demo accounts starts the form afresh.
  return <EditForm key={viewer.id} viewer={viewer} onDone={close} />;
}

function EditForm({ viewer, onDone }: { viewer: AppViewer; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(viewer.full_name ?? '');
  const [email, setEmail] = useState(viewer.email ?? '');
  const [dob, setDob] = useState(toDisplay(viewer.date_of_birth));
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    setError(null);
  };

  const pickPhoto = async () => {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    setPhotoBusy(true);
    try {
      await db.setAvatar({ uri: result.assets[0].uri, mimeType: result.assets[0].mimeType });
      await refreshViewer();
      hapticSuccess();
    } catch (e) {
      setError(e instanceof RuleViolation ? e.message : 'That picture did not upload. Try another one.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      await db.removeAvatar();
      await refreshViewer();
    } catch (e) {
      setError(e instanceof RuleViolation ? e.message : 'That did not go through. Try again.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const save = async () => {
    if (name.trim().length < 2) return setError('Enter your name');
    if (email.trim() && !EMAIL_RE.test(email.trim())) return setError('Enter a valid email address');
    const parsed = parseDob(dob);
    if ('error' in parsed) return setError(parsed.error);
    setBusy(true);
    setError(null);
    try {
      await db.updateMyProfile({
        full_name: name.trim(),
        email: email.trim() || null,
        date_of_birth: parsed.iso,
      });
      await refreshViewer();
      hapticSuccess();
      onDone();
    } catch (e) {
      setError(e instanceof RuleViolation ? e.message : 'That did not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Header title="Edit profile" onBack={onDone} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}
        >
          <View style={styles.photoRow}>
            <Avatar uri={viewer.avatar_url} name={name || viewer.full_name || '?'} size={88} />
            <View style={styles.photoActions}>
              <Button small variant="secondary" icon="upload" loading={photoBusy} onPress={() => void pickPhoto()}>
                {viewer.avatar_url ? 'Change photo' : 'Add a photo'}
              </Button>
              {viewer.avatar_url ? (
                <Button small variant="text" onPress={() => void removePhoto()}>
                  Remove
                </Button>
              ) : null}
            </View>
          </View>

          <Field label="Full name" value={name} onChangeText={edit(setName)} autoCapitalize="words" accessibilityLabel="Full name" />
          <Field
            label="Email"
            value={email}
            onChangeText={edit(setEmail)}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            accessibilityLabel="Email"
          />
          <Field
            label="Date of birth"
            value={dob}
            onChangeText={(t) => edit(setDob)(maskDob(t))}
            placeholder="DD/MM/YYYY"
            keyboardType="number-pad"
            maxLength={10}
            accessibilityLabel="Date of birth"
          />
          <Text style={styles.hint}>Some deals are for 18+ or 21+. Your date of birth lets you claim them.</Text>

          <View style={styles.locked}>
            <Text style={styles.lockedLabel}>Phone</Text>
            <Text style={styles.lockedValue}>{viewer.phone || 'Not set'}</Text>
            <Text style={styles.hint}>This is how you sign in. To change it, contact support from Help.</Text>
          </View>

          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <Button variant="cta" full loading={busy} onPress={() => void save()}>
            Save changes
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.background,
  },
  flex: {
    flex: 1,
  },
  body: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    padding: space.xl,
    gap: space.md,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    marginBottom: space.md,
  },
  photoActions: {
    gap: space.xs,
    alignItems: 'flex-start',
  },
  hint: {
    ...type.small,
    color: color.textMuted,
    marginTop: -space.xs,
  },
  locked: {
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: color.surfaceSoftAlt,
    gap: 4,
    marginTop: space.sm,
  },
  lockedLabel: {
    ...type.overline,
    color: color.textMuted,
  },
  lockedValue: {
    ...type.bodySemibold,
    color: color.text,
  },
  error: {
    ...type.captionMedium,
    color: color.alert,
  },
});
