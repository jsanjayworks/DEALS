/**
 * The first-run welcome, once per account: what to call you, whether you
 * are 18 or older, and whether YOLO may learn from what you do to pick deals
 * for you. Each answer is a separate, recorded choice (DPDP Act 2023):
 * suggestions are off until switched on, need 18+, and can be switched off
 * or cleared any time in Privacy. It can all be said in one sentence.
 */

import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, refreshViewer, RuleViolation } from '../data';
import { parseWelcome } from '../auth/welcomeVoice';
import { hapticSuccess } from '../lib/device';
import { useSession, useViewer } from '../state/session';
import { color, radius, space, type } from '../theme/tokens';
import { Button, Field, Icon } from '../components';
import { ToggleRow } from '../ui/ToggleRow';
import { speechSupported, useSpeech } from '../voice/useSpeech';

const EXAMPLE = "I'm Aarav, I'm over 18, and yes to suggestions";

export default function WelcomeScreen() {
  const viewer = useViewer();
  const insets = useSafeAreaInsets();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const lang = useSession((s) => s.voiceLang);
  const [name, setName] = useState(viewer?.full_name ?? '');
  const [adult, setAdult] = useState(false);
  const [personalise, setPersonalise] = useState(false);
  const [byVoice, setByVoice] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const speech = useSpeech({
    onEnd: (said) => {
      if (!said) return;
      setHeard(said);
      const a = parseWelcome(said);
      if (a.name) setName(a.name);
      if (a.adult !== null) setAdult(a.adult);
      // Under 18 switches suggestions off, as the toggle does.
      if (a.adult === false) setPersonalise(false);
      else if (a.personalise !== null) setPersonalise(a.personalise && (a.adult ?? adult));
      setByVoice(true);
    },
  });

  // FirstRun opened this on top of where they were: go back to it as it was,
  // query and all. Only a cold load of /welcome has nothing underneath.
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace(typeof next === 'string' && next.startsWith('/') ? (next as '/') : '/');
  };

  const finish = async (skip: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const channel = byVoice ? 'voice' : Platform.OS === 'web' ? 'web' : 'app';
      if (!skip) {
        // Both answers are recorded, a no as much as a yes.
        await db.setConsent('adult', adult, channel);
        await db.setConsent('personalisation', adult && personalise, channel);
      }
      await db.updateMyProfile({
        ...(name.trim().length >= 2 && !skip ? { full_name: name.trim() } : {}),
        onboarded: true,
      });
      await refreshViewer();
      hapticSuccess();
      leave();
    } catch (e) {
      setError(e instanceof RuleViolation ? e.message : 'That did not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.body, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xxl }]}
        >
          <Text style={styles.title} accessibilityRole="header">
            Welcome to YOLO
          </Text>
          <Text style={styles.lead}>Three quick things. Tap, type, or say them all at once.</Text>

          {speechSupported() ? (
            <View style={styles.voiceWrap}>
              <Pressable
                onPress={() => (speech.listening ? speech.stop() : speech.start(lang, false))}
                accessibilityRole="button"
                accessibilityLabel={speech.listening ? 'Stop listening' : 'Answer by voice'}
                style={({ pressed }) => [styles.voice, speech.listening && styles.voiceOn, pressed && { opacity: 0.85 }]}
              >
                <View style={[styles.mic, speech.listening && styles.micOn]}>
                  <Icon name="mic" size={20} color={speech.listening ? color.onCta : color.white} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.voiceTitle}>{speech.listening ? 'Listening…' : 'Answer by voice'}</Text>
                  <Text style={styles.voiceHint} numberOfLines={2}>
                    {speech.listening
                      ? speech.interim || speech.finalText || 'Say it like: “' + EXAMPLE + '”'
                      : heard
                        ? 'Heard: “' + heard + '”. Check below.'
                        : 'Say: “' + EXAMPLE + '”'}
                  </Text>
                </View>
              </Pressable>
              {/* A blocked mic or nothing heard: say why, not just stop. */}
              {speech.error ? (
                <Text style={styles.error} accessibilityLiveRegion="polite">
                  {speech.error}
                </Text>
              ) : null}
            </View>
          ) : null}

          <Field
            label="What should we call you?"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            autoCapitalize="words"
            accessibilityLabel="Your name"
          />

          <View style={styles.toggles}>
            <ToggleRow
              label="I am 18 or older"
              hint="Some deals are for 18+ or 21+. We only personalise for adults."
              value={adult}
              onChange={(v) => {
                setAdult(v);
                if (!v) setPersonalise(false);
              }}
            />
            <ToggleRow
              label="Personalised suggestions"
              hint="Let YOLO learn from the deals you open, search for, ask the assistant about and book, to pick deals for you. Off unless you switch it on. Change it or clear what was learned any time in Privacy."
              value={personalise}
              disabled={!adult}
              onChange={setPersonalise}
            />
          </View>

          <Text style={styles.small}>
            Your orders and bookings are kept to run your account either way. Voice is turned into text by your
            browser&apos;s speech service and understood on our server; we keep what you asked, not the recording. Read
            the{' '}
            <Text style={styles.link} onPress={() => router.push('/legal/privacy')} accessibilityRole="link">
              privacy policy
            </Text>
            .
          </Text>

          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          <Button variant="cta" full loading={busy} onPress={() => void finish(false)}>
            Continue
          </Button>
          <Button variant="text" full disabled={busy} onPress={() => void finish(true)}>
            Skip
          </Button>
          <Text style={[styles.small, styles.center]}>Age and suggestions can be set later in Profile → Privacy and data.</Text>
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
    minWidth: 0,
  },
  body: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: space.xl,
    gap: space.lg,
  },
  title: {
    ...type.h1,
    color: color.text,
  },
  lead: {
    ...type.body,
    color: color.textSecondary,
    marginTop: -space.sm,
  },
  voiceWrap: {
    gap: space.sm,
  },
  voice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: color.surfaceSoftAlt,
  },
  voiceOn: {
    backgroundColor: color.accentSoft,
  },
  mic: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.brand,
  },
  micOn: {
    backgroundColor: color.cta,
  },
  voiceTitle: {
    ...type.bodySemibold,
    color: color.text,
  },
  voiceHint: {
    ...type.caption,
    color: color.textSecondary,
  },
  toggles: {
    gap: space.sm,
  },
  small: {
    ...type.caption,
    color: color.textSecondary,
  },
  center: {
    textAlign: 'center',
    marginTop: -space.sm,
  },
  link: {
    color: color.brand,
    textDecorationLine: 'underline',
  },
  error: {
    ...type.captionMedium,
    color: color.alert,
  },
});
