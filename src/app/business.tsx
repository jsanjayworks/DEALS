/**
 * "YOLO for Business": the merchant login, at /business on the web.
 *
 * A separate door, not a separate account. It signs in with the same one-time
 * code as the customer app, and where it leads afterwards comes from the
 * account: a business owner lands on the dashboard, anyone else is taken to
 * set up their business. A merchant can still browse and claim deals with the
 * same account.
 *
 * Routing is done by the redirects below, which run whenever the viewer
 * changes, so a finished sign-in only has to refresh the viewer.
 */

import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DoorLink, OtpForm } from '../auth/OtpForm';
import { auth, backend, refreshViewer } from '../data';
import { useSession, useViewer, useViewerReady } from '../state/session';
import { color, radius, shadow, space, theme, type } from '../theme/tokens';
import { Button, Icon, type IconName } from '../components';

const PERKS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'pin', title: 'Seen by people nearby', body: 'Your deals show to customers within a few kilometres.' },
  { icon: 'qr', title: 'Redeem at the counter', body: 'Customers show a code; you type or scan it. No payments in the app.' },
  { icon: 'chart', title: 'See what works', body: 'Views, claims and bookings for every deal.' },
];

export default function BusinessLoginScreen() {
  const insets = useSafeAreaInsets();
  const viewer = useViewer();
  const ready = useViewerReady();
  const setAccount = useSession((s) => s.setAccount);
  const setMode = useSession((s) => s.setMode);

  const close = () => (router.canGoBack() ? router.back() : router.dismissTo('/'));

  if (!ready) return <View style={styles.screen} />;
  if (viewer && viewer.business_ids.length > 0) return <Redirect href="/merchant" />;
  // Signed in on Supabase but no business yet: setting one up is the next step.
  // (The local demo always has a viewer, so it gets the demo panel instead.)
  if (viewer && backend === 'supabase') return <Redirect href="/list-business" />;

  return (
    <View style={styles.screen}>
      <StatusBar style={theme.hero.light ? 'dark' : 'light'} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}>
          <View style={[styles.hero, { paddingTop: insets.top + space.sm }]}>
            <LinearGradient colors={theme.hero.colors} style={StyleSheet.absoluteFill} pointerEvents="none" />
            <View style={styles.inner}>
              <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Go back" style={styles.back}>
                <Icon name="back" size={22} color={theme.hero.text} />
              </Pressable>
              <Text style={styles.overline}>YOLO for Business</Text>
              <Text style={styles.title} accessibilityRole="header">
                Merchant login
              </Text>
              <Text style={styles.lead}>Post deals, redeem codes and see what is working.</Text>
            </View>
          </View>

          <View style={styles.cardWrap}>
            <View style={styles.card}>
            {auth ? (
              <OtpForm
                api={auth}
                title="Sign in to your business"
                lead="New here? Use your number and we will set up your business next."
                onSignedIn={async () => {
                  setMode('merchant');
                  await refreshViewer();
                }}
              />
            ) : (
              <DemoPanel
                onMerchant={() => {
                  setAccount('merchant');
                  setMode('merchant');
                  router.replace('/merchant');
                }}
                onNew={() => router.push('/list-business')}
              />
            )}
            </View>
          </View>

          <View style={[styles.inner, styles.perks]}>
            {PERKS.map((p) => (
              <View key={p.title} style={styles.perk}>
                <View style={styles.perkIcon}>
                  <Icon name={p.icon} size={20} color={color.cta} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.perkTitle}>{p.title}</Text>
                  <Text style={styles.perkBody}>{p.body}</Text>
                </View>
              </View>
            ))}
            <DoorLink prompt="Looking for deals?" action="Customer app" onPress={() => router.dismissTo('/')} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** The local demo has no sign-in: pick the seeded merchant, or set up a new business. */
function DemoPanel({ onMerchant, onNew }: { onMerchant: () => void; onNew: () => void }) {
  return (
    <View style={styles.demo}>
      <Text style={styles.demoTitle}>Demo mode</Text>
      <Text style={styles.demoBody}>
        This build runs on offline demo data. Open the demo merchant, Rangoli Kitchen, or set up a new business as
        the demo customer.
      </Text>
      <Button variant="cta" full onPress={onMerchant}>
        Continue as demo merchant
      </Button>
      <Button variant="secondary" full onPress={onNew}>
        List a new business
      </Button>
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
  inner: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: space.xl,
  },
  hero: {
    overflow: 'hidden',
    paddingBottom: 72,
    borderBottomLeftRadius: theme.hero.light ? 0 : 28,
    borderBottomRightRadius: theme.hero.light ? 0 : 28,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginLeft: -10,
    marginBottom: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overline: {
    ...type.overline,
    color: theme.hero.muted,
  },
  title: {
    ...type.display,
    fontSize: 34,
    lineHeight: 42,
    color: theme.hero.text,
    marginTop: space.xs,
  },
  lead: {
    ...type.body,
    color: theme.hero.muted,
    marginTop: space.xs,
  },
  // The form card rides up over the hero's edge.
  cardWrap: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    marginTop: -48,
  },
  card: {
    padding: space.xl,
    borderRadius: radius.xxl,
    backgroundColor: color.surface,
    ...shadow.raised,
  },
  perks: {
    gap: space.lg,
    marginTop: space.xxl,
  },
  perk: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
  },
  perkIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: color.deal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perkTitle: {
    ...type.bodySemibold,
    color: color.text,
  },
  perkBody: {
    ...type.caption,
    color: color.textSecondary,
  },
  demo: {
    gap: space.md,
  },
  demoTitle: {
    ...type.h1,
    color: color.text,
  },
  demoBody: {
    ...type.body,
    color: color.textSecondary,
    marginBottom: space.sm,
  },
});
