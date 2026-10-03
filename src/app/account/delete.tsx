/**
 * Delete account. App Store and Play both require that deleting an account
 * can be started in the app.
 *
 * request_account_deletion() cancels open claims and bookings (their places
 * go back to the deals), forgets saved deals, marks the profile, and files a
 * request for the team to remove the sign-in. Business owners are sent to
 * support instead, so a business is never left without anyone to run it.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { auth, db, RuleViolation } from '../../data';
import { useViewer } from '../../state/session';
import { color, radius, space, type } from '../../theme/tokens';
import { Button, Header, Icon } from '../../components';

const WHAT_HAPPENS = [
  'Your open claims and bookings are cancelled, and their places go back to the deals.',
  'Your saved deals are removed.',
  'Your profile is marked for deletion and the YOLO team removes your sign-in and personal details.',
  'Codes you have already used stay with the businesses as their record of the sale.',
];

export default function DeleteAccountScreen() {
  const viewer = useViewer();
  const [reason, setReason] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await db.requestAccountDeletion(reason.trim() || undefined);
      await auth?.signOut();
      router.dismissTo('/');
    } catch (e) {
      setError(e instanceof RuleViolation ? e.message : 'That did not go through. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Header title="Delete account" onBack={close} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title} accessibilityRole="header">
          Delete your YOLO account?
        </Text>
        <Text style={styles.para}>
          {viewer?.full_name ? viewer.full_name + ', this' : 'This'} cannot be undone. Here is what happens:
        </Text>

        <View style={styles.card}>
          {WHAT_HAPPENS.map((line) => (
            <View key={line} style={styles.item}>
              <Icon name="check" size={16} color={color.textSecondary} strokeWidth={2} />
              <Text style={[styles.para, styles.flex]}>{line}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.label}>Why are you leaving? (optional)</Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="It helps us make YOLO better"
          placeholderTextColor={color.textMuted}
          multiline
          maxLength={500}
          accessibilityLabel="Reason for leaving"
          style={styles.textarea}
        />

        <Pressable
          onPress={() => setSure((v) => !v)}
          accessibilityRole="checkbox"
          aria-checked={sure}
          style={styles.confirm}
        >
          <View style={[styles.tick, sure && styles.tickOn]}>
            {sure ? <Icon name="check" size={12} color={color.white} strokeWidth={2.6} /> : null}
          </View>
          <Text style={[styles.para, styles.flex]}>I understand my account and its history will be deleted.</Text>
        </Pressable>

        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <Pressable
          onPress={() => void remove()}
          disabled={!sure || busy}
          accessibilityRole="button"
          aria-disabled={!sure || busy}
          style={({ pressed }) => [styles.danger, (!sure || busy) && styles.dangerOff, pressed && styles.pressed]}
        >
          <Text style={styles.dangerText}>{busy ? 'Deleting…' : 'Delete my account'}</Text>
        </Pressable>
        <Button variant="text" full onPress={close}>
          Keep my account
        </Button>
      </ScrollView>
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
  title: {
    ...type.display,
    fontSize: 26,
    lineHeight: 32,
    color: color.text,
  },
  para: {
    ...type.body,
    color: color.textSecondary,
  },
  card: {
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.xxl - 2,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  item: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
  },
  label: {
    ...type.overline,
    color: color.textMuted,
    marginTop: space.sm,
  },
  textarea: {
    minHeight: 88,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    textAlignVertical: 'top',
    ...type.body,
    color: color.text,
  },
  confirm: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    minHeight: 44,
  },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: color.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: {
    backgroundColor: color.alert,
    borderColor: color.alert,
  },
  error: {
    ...type.captionMedium,
    color: color.alert,
  },
  danger: {
    height: 52,
    borderRadius: 999,
    backgroundColor: color.alert,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerOff: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.85,
  },
  dangerText: {
    ...type.bodySemibold,
    color: color.white,
  },
});
