/**
 * Speech to text in the browser (the Web Speech API): Chrome and Edge on
 * desktop and Android, Safari on recent iPhones. Words appear as they are
 * heard, and the final text is handed back. No audio is kept by the app.
 *
 * The phone apps get a native recogniser later; until then, and in browsers
 * without speech recognition, `supported` is false and the voice sheet
 * falls back to typing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { VoiceLang } from './types';

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Preview windows built on Electron (VS Code's browser, desktop app shells)
 * have the API but no speech service behind it, so every attempt fails.
 */
function embeddedBrowser(): boolean {
  return typeof navigator !== 'undefined' && /\bElectron\//.test(navigator.userAgent);
}

export function speechSupported(): boolean {
  return recognitionCtor() !== null && !embeddedBrowser();
}

/** Why the mic is off, for the voice sheet. */
export const UNSUPPORTED_TEXT = 'Voice needs Chrome or Edge. Open this page there to speak, or type below.';

const ERROR_TEXT: Record<string, string> = {
  'not-allowed': 'The microphone is blocked. Allow it from the icon in the address bar, or type instead.',
  'service-not-allowed': 'The microphone is blocked. Allow it from the icon in the address bar, or type instead.',
  'no-speech': 'Did not catch anything. Tap the mic and try again.',
  'audio-capture': 'No microphone found. Type instead.',
  network: 'Could not reach the speech service. Open this page in Chrome or Edge, or type below.',
  'language-not-supported': 'This browser cannot listen in that language. Try English, or type.',
};

/** `onEnd` hears the final words when listening stops (empty if nothing was caught). */
export function useSpeech({ onEnd }: { onEnd?: (text: string) => void } = {}) {
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);

  /** Stops without handing anything back (an example was picked instead). */
  const cancel = useCallback(() => {
    const r = rec.current;
    rec.current = null;
    r?.abort();
  }, []);

  /** Starts listening; `continuous` keeps going through pauses (a merchant describing a business). */
  const start = useCallback((lang: VoiceLang, continuous = false) => {
    const Ctor = recognitionCtor();
    if (!Ctor || embeddedBrowser()) {
      setError(UNSUPPORTED_TEXT);
      return;
    }
    rec.current?.abort();
    const r = new Ctor();
    r.lang = lang;
    r.continuous = continuous;
    r.interimResults = true;
    r.maxAlternatives = 1;
    let kept = '';
    r.onresult = (e) => {
      let fin = '';
      let mid = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) fin += res[0].transcript + ' ';
        else mid += res[0].transcript;
      }
      kept = fin;
      setFinalText(fin.trim());
      setInterim(mid.trim());
    };
    r.onerror = (e) => {
      if (e.error !== 'aborted') setError(ERROR_TEXT[e.error] ?? 'Could not listen just now. Type instead.');
    };
    r.onend = () => {
      setListening(false);
      setInterim('');
      setFinalText(kept.trim());
      if (rec.current === r) onEndRef.current?.(kept.trim());
    };
    rec.current = r;
    setError(null);
    setFinalText('');
    setInterim('');
    try {
      r.start();
      setListening(true);
    } catch {
      setError('Could not start the microphone. Type instead.');
    }
  }, []);

  useEffect(() => () => rec.current?.abort(), []);

  return { listening, finalText, interim, error, start, stop, cancel };
}
