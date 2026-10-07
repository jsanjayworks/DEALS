/**
 * The voice sheet: pick a language, speak, see the words as they are heard,
 * fix them if needed, and send. It starts listening as soon as it opens.
 * Where the browser cannot listen, it is a text box with the same examples.
 * When the assistant answers rather than going somewhere, the answer takes
 * the sheet's place, with "Ask something else" to listen again.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSession } from '../state/session';
import { color, radius, space, type } from '../theme/tokens';
import { Button, Chip, Icon, Sheet } from '../components';
import { speechSupported, UNSUPPORTED_TEXT, useSpeech } from './useSpeech';
import { VOICE_LANGS, type VoiceLang } from './types';

export interface VoiceSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Examples to tap or say. */
  examples: string[];
  /** Keep listening through pauses, for a long description. */
  continuous?: boolean;
  /** Send by itself when the speaker stops (short commands). */
  autoSubmit?: boolean;
  submitLabel: string;
  /** Working on what was said: shows on the button. */
  busy?: boolean;
  busyText?: string;
  /** A problem from the caller, e.g. nothing matched. */
  problem?: string | null;
  onSubmit: (text: string, lang: VoiceLang) => void;
  /** The assistant's answer, shown in place of the mic and examples. */
  answer?: ReactNode;
  /** Back from an answer to listening. */
  onAskAgain?: () => void;
  /** Words already asked (a suggestion tapped), shown instead of listening. */
  initialText?: string | null;
}

export function VoiceSheet(props: VoiceSheetProps) {
  // Mounted only while open, so each opening starts fresh and listening.
  return props.visible ? <VoiceSheetOpen {...props} /> : null;
}

function VoiceSheetOpen({
  visible,
  onClose,
  title,
  examples,
  continuous = false,
  autoSubmit = false,
  submitLabel,
  busy = false,
  busyText,
  problem,
  onSubmit,
  answer,
  onAskAgain,
  initialText,
}: VoiceSheetProps) {
  // The language last used, so the next open starts in it.
  const lang = useSession((s) => s.voiceLang);
  const setVoiceLang = useSession((s) => s.setVoiceLang);
  // What the person typed or picked over what was heard; null shows what was heard.
  const [edited, setEdited] = useState<string | null>(initialText ?? null);
  const canListen = speechSupported();
  // Short commands go on their own the moment the speaker stops.
  const speech = useSpeech({
    onEnd: (heard) => {
      if (autoSubmit && heard && !busy) onSubmit(heard, lang);
    },
  });

  // Listen straight away, in the language last used, unless it was asked already.
  useEffect(() => {
    if (canListen && !initialText) speech.start(lang, continuous);
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    if (speech.listening) speech.stop();
    else {
      setEdited(null);
      speech.start(lang, continuous);
    }
  };

  const pickLang = (l: VoiceLang) => {
    setVoiceLang(l);
    setEdited(null);
    if (canListen) speech.start(l, continuous);
  };

  const text = edited ?? speech.finalText;
  const live = (speech.finalText + ' ' + speech.interim).trim();
  const shown = speech.listening ? live : text;
  const status = speech.error
    ? speech.error
    : speech.listening
      ? continuous
        ? 'Listening… take your time. Tap the mic when you are done.'
        : 'Listening… speak now'
      : canListen
        ? 'Tap the mic to speak again, or type below'
        : UNSUPPORTED_TEXT;

  if (answer) {
    const asked = text.trim();
    return (
      <Sheet
        visible={visible}
        onClose={onClose}
        title={title}
        footer={
          <Button
            variant="secondary"
            full
            icon="mic"
            onPress={() => {
              onAskAgain?.();
              setEdited(null);
              if (canListen) speech.start(lang, continuous);
            }}
          >
            Ask something else
          </Button>
        }
      >
        {asked ? (
          <View style={styles.asked}>
            <Icon name="mic" size={14} color={color.textSecondary} />
            <Text style={styles.askedText} numberOfLines={3}>
              {asked}
            </Text>
          </View>
        ) : null}
        {answer}
      </Sheet>
    );
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      footer={
        <Button
          variant="cta"
          full
          loading={busy}
          disabled={!text.trim() || speech.listening}
          onPress={() => onSubmit(text.trim(), lang)}
        >
          {busy && busyText ? busyText : submitLabel}
        </Button>
      }
    >
      <View style={styles.langs}>
        {VOICE_LANGS.map((l) => (
          <Chip key={l.code} selected={lang === l.code} onPress={() => pickLang(l.code)}>
            {l.label}
          </Chip>
        ))}
      </View>

      <View style={styles.micRow}>
        <MicButton listening={speech.listening} disabled={!canListen || busy} onPress={toggle} />
        <Text style={[styles.status, speech.error && styles.statusError]} accessibilityLiveRegion="polite">
          {status}
        </Text>
      </View>

      <TextInput
        value={shown}
        onChangeText={setEdited}
        editable={!speech.listening && !busy}
        placeholder={canListen ? 'Your words appear here' : 'Type what you want'}
        placeholderTextColor={color.textMuted}
        multiline
        accessibilityLabel="What you said"
        style={[styles.text, continuous && styles.textTall, speech.listening && styles.textLive]}
      />
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}

      <Text style={styles.tryLabel}>Try saying</Text>
      <View style={styles.examples}>
        {examples.map((e) => (
          <Pressable
            key={e}
            onPress={() => {
              speech.cancel();
              setEdited(e);
            }}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={'Use example: ' + e}
            style={({ pressed }) => [styles.example, pressed && { opacity: 0.7 }]}
          >
            <Icon name="mic" size={14} color={color.textSecondary} />
            <Text style={styles.exampleText}>{e}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

function MicButton({ listening, disabled, onPress }: { listening: boolean; disabled: boolean; onPress: () => void }) {
  const reduce = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (listening && !reduce) {
      pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), -1, false);
    } else {
      cancelAnimation(pulse);
      pulse.value = 0;
    }
  }, [listening, reduce, pulse]);
  const ring = useAnimatedStyle(() => ({
    opacity: listening ? 0.45 * (1 - pulse.value) : 0,
    transform: [{ scale: 1 + 0.6 * pulse.value }],
  }));
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={listening ? 'Stop listening' : 'Start listening'}
      style={styles.micWrap}
    >
      <Animated.View style={[styles.micRing, ring]} />
      <View style={[styles.mic, listening && styles.micOn, disabled && styles.micOff]}>
        <Icon name="mic" size={30} color={listening ? color.onCta : color.white} strokeWidth={2} />
      </View>
    </Pressable>
  );
}

const MIC = 72;

const styles = StyleSheet.create({
  langs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  micRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    marginTop: space.xl,
  },
  micWrap: {
    width: MIC,
    height: MIC,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micRing: {
    position: 'absolute',
    width: MIC,
    height: MIC,
    borderRadius: MIC / 2,
    backgroundColor: color.cta,
  },
  mic: {
    width: MIC,
    height: MIC,
    borderRadius: MIC / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.brand,
  },
  micOn: {
    backgroundColor: color.cta,
  },
  micOff: {
    backgroundColor: color.textMuted,
  },
  status: {
    ...type.captionMedium,
    color: color.textSecondary,
    flex: 1,
  },
  statusError: {
    color: color.alert,
  },
  text: {
    ...type.body,
    color: color.text,
    marginTop: space.lg,
    minHeight: 72,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    textAlignVertical: 'top',
  },
  textTall: {
    minHeight: 140,
  },
  textLive: {
    borderColor: color.cta,
    backgroundColor: color.surfaceSoftAlt,
  },
  problem: {
    ...type.captionMedium,
    color: color.alert,
    marginTop: space.sm,
  },
  tryLabel: {
    ...type.overline,
    color: color.textMuted,
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  examples: {
    gap: space.sm,
  },
  example: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
  },
  exampleText: {
    ...type.caption,
    color: color.text,
    flex: 1,
  },
  asked: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    alignSelf: 'flex-end',
    maxWidth: '90%',
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
    marginBottom: space.lg,
  },
  askedText: {
    ...type.caption,
    color: color.text,
    flexShrink: 1,
  },
});
