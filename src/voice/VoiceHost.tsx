/**
 * The voice assistant, mounted once at the root. Any mic button calls
 * openVoice(); a suggestion chip calls openVoice('Order my usual'). This
 * shows the voice sheet, works out what was meant (Claude, or the built-in
 * rules), and either takes the person there or answers in the sheet from
 * their own orders. On the merchant screens it answers as the shop's
 * assistant: today's summary, pausing a deal, redeeming a code.
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'expo-router';
import { AnswerView } from '../assistant/AnswerView';
import type { Answer } from '../assistant/jobs';
import { useBusinessId } from '../merchant/useBusiness';
import { useOrigin, useSession, useViewer } from '../state/session';
import { understand } from './assist';
import { runIntent } from './runIntent';
import { VoiceSheet } from './VoiceSheet';
import type { AssistMode, VoiceLang } from './types';

const openers = new Set<(ask?: string) => void>();

/**
 * Opens the voice assistant from anywhere; with words, asks them straight
 * away. Mic buttons pass it as onPress, so anything but a string (the press
 * event) just opens it.
 */
export function openVoice(ask?: unknown): void {
  const words = typeof ask === 'string' ? ask : undefined;
  openers.forEach((cb) => cb(words));
}

const CUSTOMER_EXAMPLES = [
  "What's the best deal for me today?",
  'Order my usual',
  'How much have I saved?',
  'Is Rangoli Kitchen open now?',
  'Book a table for 4 at Rangoli Kitchen tomorrow at 8',
  'Chicken biryani under 300 in HSR for 4 people',
  "What's my code?",
  'मेरे लिए आज सबसे अच्छी डील कौन सी है?',
  'ಇಂದಿರಾನಗರದಲ್ಲಿ ಬಿರಿಯಾನಿ ಡೀಲ್ಸ್ ತೋರಿಸು',
];

const MERCHANT_EXAMPLES = [
  "How's business today?",
  'Redeem code RNG7K2',
  'Pause the dosa deal',
  'Resume the dosa deal',
  "Show tonight's bookings",
  'Create a new deal',
];

export function VoiceHost() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const origin = useOrigin();
  const viewer = useViewer();
  const businessId = useBusinessId();
  const lang = useSession((s) => s.voiceLang);
  const pathname = usePathname();
  const mode: AssistMode = pathname.startsWith('/merchant') && businessId ? 'merchant' : 'customer';

  const submit = async (text: string, l: VoiceLang) => {
    setBusy(true);
    setProblem(null);
    try {
      const { result } = await understand('customer', text, l, { mode });
      const out = await runIntent(result, { origin, signedIn: viewer !== null, businessId });
      if (out.kind === 'done') setOpen(false);
      else if (out.kind === 'answer') setAnswer(out.answer);
      else setProblem('Could not work that out. Try saying it another way, or tap an example.');
    } catch {
      setProblem('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  // The opener outlives renders; it always reaches the latest submit.
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });

  useEffect(() => {
    const cb = (ask?: string) => {
      setProblem(null);
      setAnswer(null);
      setAsked(ask ?? null);
      setOpen(true);
      if (ask) void submitRef.current(ask, lang);
    };
    openers.add(cb);
    return () => {
      openers.delete(cb);
    };
  }, [lang]);

  const close = () => {
    setOpen(false);
    setAnswer(null);
    setAsked(null);
  };

  return (
    <VoiceSheet
      visible={open}
      onClose={close}
      title={mode === 'merchant' ? 'Ask YOLO for business' : 'Ask YOLO'}
      examples={mode === 'merchant' ? MERCHANT_EXAMPLES : CUSTOMER_EXAMPLES}
      autoSubmit
      submitLabel="Go"
      busy={busy}
      busyText="Working on it…"
      problem={problem}
      initialText={asked}
      onSubmit={(t, l) => void submit(t, l)}
      answer={answer ? <AnswerView answer={answer} onClose={close} onReplace={setAnswer} /> : null}
      onAskAgain={() => {
        setAnswer(null);
        setAsked(null);
        setProblem(null);
      }}
    />
  );
}
