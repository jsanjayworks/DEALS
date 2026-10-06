/**
 * Customer sign-in with a one-time code.
 *
 * There is no separate sign-up. A first sign-in creates the account, and the
 * on_auth_user_created trigger (0004) gives it the profile everything else
 * hangs off. Merchants have their own door, "YOLO for Business" at /business,
 * which uses the same account; the link at the bottom goes there.
 *
 * On the local demo the same form signs in to the three demo accounts, which
 * are listed under it with their addresses and the code.
 */

import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DemoLogins } from '../auth/DemoLogins';
import { DoorLink, OtpForm } from '../auth/OtpForm';
import { auth, backend } from '../data';
import { useSession } from '../state/session';
import { color, space } from '../theme/tokens';
import { Header } from '../components';

const DEMO = backend === 'local';

/** Where a finished sign-in may continue to. Anything else closes the sheet. */
const NEXT_ROUTES = ['/list-business', '/merchant'] as const;
type NextRoute = (typeof NEXT_ROUTES)[number];
const asNext = (v: unknown): NextRoute | null =>
  NEXT_ROUTES.includes(v as NextRoute) ? (v as NextRoute) : null;

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const setMode = useSession((s) => s.setMode);
  const close = () => (router.canGoBack() ? router.back() : router.dismissTo('/'));

  return (
    <View style={styles.screen}>
      <Header title="Sign in" onBack={close} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xl }]}
        >
          <OtpForm
            api={auth}
            title="Welcome to YOLO Deals"
            lead={
              DEMO
                ? 'Demo: enter any email to sign in. No code needed; a new email makes a new account.'
                : 'We will send you a one-time code. No password needed.'
            }
            onSignedIn={() => {
              const to = asNext(next);
              if (to) router.replace(to);
              else close();
            }}
            footer={
              <DoorLink
                prompt="Own a business?"
                action="Merchant login"
                onPress={() => router.replace('/business')}
              />
            }
          />
          {DEMO ? (
            <DemoLogins
              onSignedIn={(kind) => {
                // Each demo account lands where that person would start.
                if (kind === 'merchant') {
                  setMode('merchant');
                  router.replace('/merchant');
                } else if (kind === 'admin') router.replace('/profile');
                else {
                  const to = asNext(next);
                  if (to) router.replace(to);
                  else close();
                }
              }}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.surface,
  },
  flex: {
    flex: 1,
  },
  body: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    padding: space.xl,
  },
});
