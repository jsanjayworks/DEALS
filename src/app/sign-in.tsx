/**
 * Customer sign-in and sign-up in one: a mobile number while YOLO is being
 * tested (one-time codes come back for launch, see OtpForm).
 *
 * A number with no account asks for a name and makes one; the
 * on_auth_user_created trigger (0004) gives it the profile everything else
 * hangs off. Merchants have their own door, "YOLO for Business" at /business,
 * which uses the same account; the link at the bottom goes there.
 */

import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DoorLink, OtpForm } from '../auth/OtpForm';
import { ExploreDemo } from '../auth/ExploreDemo';
import { auth } from '../data';
import { useDemo } from '../state/session';
import { color, space } from '../theme/tokens';
import { Header } from '../components';

/** Where a finished sign-in may continue to. Anything else closes the sheet. */
const NEXT_ROUTES = ['/list-business', '/merchant'] as const;
type NextRoute = (typeof NEXT_ROUTES)[number];
const asNext = (v: unknown): NextRoute | null =>
  NEXT_ROUTES.includes(v as NextRoute) ? (v as NextRoute) : null;

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { next } = useLocalSearchParams<{ next?: string }>();
  // The demo's parts appear once the page is live; the server renders the real app.
  const demo = useDemo();
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
              demo
                ? 'Demo: any number signs in. A new number makes a new demo account in this browser.'
                : 'Enter your mobile number. New here? We will make your account. No code or password while YOLO is in testing.'
            }
            onSignedIn={() => {
              const to = asNext(next);
              if (to) router.replace(to);
              else close();
            }}
            footer={
              <DoorLink
                prompt="Own a business?"
                action="YOLO for Business"
                onPress={() => router.replace('/business')}
              />
            }
          />
          <ExploreDemo />
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
