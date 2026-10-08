/**
 * Privacy and data: switch personalised suggestions on or off (as easy as it
 * was to agree), see what has been recorded, clear it in one tap, and bring
 * back anything said "not for me" to. DPDP Act 2023: consent per purpose,
 * withdrawal as easy as giving it, and the right to see and erase.
 */

import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, refreshViewer, RuleViolation, type HiddenItem } from '../../data';
import { shortAgo } from '../../lib/format';
import { useQuery } from '../../lib/useQuery';
import { useViewer } from '../../state/session';
import { color, radius, space, type } from '../../theme/tokens';
import { Button, EmptyState, Header } from '../../components';
import { ToggleRow } from '../../ui/ToggleRow';

/** What each recorded kind of activity reads as. */
const ACTIVITY_LABEL: Record<string, string> = {
  app_open: 'Times you opened YOLO',
  deal_open: 'Deals you opened',
  shop_open: 'Shop pages you visited',
  search: 'Searches',
  voice_query: 'Things you asked the assistant',
  cta_tap: 'Calls and directions',
  share: 'Deals you shared',
  save: 'Deals you saved',
  unsave: 'Deals you unsaved',
  not_interested: '"Not for me" taps',
  collection_open: 'Collections you opened',
  category_open: 'Categories you browsed',
  notif_open: 'Notifications you opened',
  checkout_start: 'Checkouts you started',
  reorder_tap: '"Order again" taps',
};

const KIND_LABEL: Record<HiddenItem['kind'], string> = {
  deal: 'Deal',
  business: 'Place',
  category: 'Kind of deal',
};

export default function PrivacyScreen() {
  const viewer = useViewer();
  const insets = useSafeAreaInsets();
  const account = viewer?.id ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const fetchAll = useCallback(async () => {
    void account;
    if (!account) return null;
    const [consents, summary, hidden] = await Promise.all([
      db.getMyConsents(),
      db.getMyActivitySummary().catch(() => []),
      db.listHidden().catch(() => [] as HiddenItem[]),
    ]);
    const said = (p: string) => consents.find((c) => c.purpose === p)?.granted ?? false;
    return { adult: said('adult'), personalise: said('personalisation'), summary, hidden };
  }, [account]);
  const { data, reload } = useQuery(fetchAll);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/profile'));
  const channel = Platform.OS === 'web' ? 'web' : 'app';

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await refreshViewer();
      reload();
    } catch (e) {
      setError(e instanceof RuleViolation ? e.message : 'That did not save. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  if (!viewer) {
    return (
      <View style={styles.screen}>
        <Header title="Privacy and data" onBack={close} />
        <EmptyState icon="shield" title="Sign in first" action={<Button onPress={() => router.push('/sign-in')}>Sign in</Button>} />
      </View>
    );
  }

  const total = (data?.summary ?? []).reduce((s, r) => s + r.events, 0);
  // Suggestions need 18+ as well, so they read as off whenever that is.
  const personalise = Boolean(data?.adult && data.personalise);
  return (
    <View style={styles.screen}>
      <Header title="Privacy and data" onBack={close} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}>
        <Text style={styles.section}>Suggestions</Text>
        <ToggleRow
          label="I am 18 or older"
          hint="We only personalise for adults. Some deals are 18+ or 21+."
          value={data?.adult ?? false}
          disabled={!data || busy !== null}
          onChange={(v) =>
            void run('adult', async () => {
              await db.setConsent('adult', v, channel);
              // A no to 18+ is a no to suggestions too, as at the welcome; saying
              // yes again later does not quietly switch them back on.
              if (!v && data?.personalise) await db.setConsent('personalisation', false, channel);
            })
          }
        />
        <ToggleRow
          label="Personalised suggestions"
          hint={
            personalise
              ? 'On: YOLO learns from what you open, search for, ask and book. Switching it off forgets what was learned. Your “not for me” choices stay.'
              : 'Off: suggestions are the same for everyone nearby. Switch on to let YOLO learn what you like.'
          }
          value={personalise}
          disabled={!data || !data.adult || busy !== null}
          onChange={(v) => void run('personalise', () => db.setConsent('personalisation', v, channel))}
        />

        <Text style={styles.section}>What we have recorded</Text>
        <View style={styles.card}>
          {data && data.summary.length === 0 ? (
            <Text style={styles.muted}>
              Nothing about you. {personalise ? 'It fills in as you use YOLO.' : 'Suggestions are off, so nothing is tied to you.'}
            </Text>
          ) : (
            (data?.summary ?? []).map((r) => (
              <View key={r.name} style={styles.line}>
                <Text style={styles.lineText}>{ACTIVITY_LABEL[r.name] ?? r.name}</Text>
                <Text style={styles.lineValue}>{r.events}</Text>
              </View>
            ))
          )}
          <Text style={styles.small}>
            Kept for 180 days. Your orders, bookings and reviews are kept separately to run your account.
          </Text>
          {total > 0 ? (
            asking ? (
              <View style={styles.confirm}>
                <Text style={styles.muted}>
                  Forget everything above, and what YOLO learned from it? Your “not for me” choices below stay.
                </Text>
                <View style={styles.buttons}>
                  <Button small variant="secondary" onPress={() => setAsking(false)}>
                    Keep it
                  </Button>
                  <Button
                    small
                    loading={busy === 'erase'}
                    onPress={() =>
                      void run('erase', async () => {
                        await db.eraseMyActivity();
                        setAsking(false);
                      })
                    }
                  >
                    Yes, clear it
                  </Button>
                </View>
              </View>
            ) : (
              <Button small variant="secondary" icon="x" onPress={() => setAsking(true)}>
                Clear my activity
              </Button>
            )
          ) : null}
        </View>

        <Text style={styles.section}>Hidden from your suggestions</Text>
        <View style={styles.card}>
          {data && data.hidden.length === 0 ? (
            <Text style={styles.muted}>Nothing. Say “not for me” about a deal, or tap it, and it stops being suggested.</Text>
          ) : (
            (data?.hidden ?? []).map((h) => (
              <View key={h.kind + h.target_id} style={styles.line}>
                <View style={styles.flex}>
                  <Text style={styles.lineText} numberOfLines={1}>
                    {h.label}
                  </Text>
                  <Text style={styles.small}>{KIND_LABEL[h.kind] + ' · ' + shortAgo(h.created_at)}</Text>
                </View>
                <Pressable
                  onPress={() => void run('unhide' + h.target_id, () => db.unhide(h.kind, h.target_id))}
                  accessibilityRole="button"
                  accessibilityLabel={'Show ' + h.label + ' again'}
                  hitSlop={8}
                >
                  <Text style={styles.action}>Show again</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>

        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <View style={styles.links}>
          <Button variant="text" onPress={() => router.push('/legal/privacy')}>
            Read the privacy policy
          </Button>
          <Button variant="text" onPress={() => router.push('/account/delete')}>
            Delete my account
          </Button>
        </View>
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
    minWidth: 0,
  },
  body: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    padding: space.xl,
    gap: space.md,
  },
  section: {
    ...type.overline,
    color: color.textMuted,
    marginTop: space.lg,
  },
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'stretch',
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  lineText: {
    ...type.body,
    color: color.text,
    flex: 1,
  },
  lineValue: {
    ...type.bodySemibold,
    color: color.text,
  },
  muted: {
    ...type.body,
    color: color.textSecondary,
  },
  small: {
    ...type.small,
    color: color.textSecondary,
  },
  action: {
    ...type.captionMedium,
    color: color.brand,
  },
  confirm: {
    gap: space.sm,
  },
  buttons: {
    flexDirection: 'row',
    gap: space.sm,
  },
  error: {
    ...type.captionMedium,
    color: color.alert,
  },
  links: {
    marginTop: space.lg,
    alignItems: 'flex-start',
  },
});
