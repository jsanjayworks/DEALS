/**
 * Root layout. Loads Inter and the display faces, holds the providers, and keeps the splash up until
 * the fonts are ready — otherwise the first frame renders in the system face
 * and visibly reflows once Inter arrives.
 */

import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { color } from '../theme/tokens';
import { installFocusRing } from '../lib/focus-ring';
import { ChromeProvider } from '../ui/chrome';
import { LaunchSplash } from '../ui/LaunchSplash';
import { LoadErrorBanner } from '../ui/LoadErrorBanner';
import { PageTitle } from '../ui/PageTitle';

// A deep link to a deal, a category or Profile still has Home underneath, so
// Back and "go home" land somewhere instead of leaving the app.
export const unstable_settings = {
  anchor: '(customer)',
};

// Web: no outline box after clicks and taps; a brand ring for keyboard users.
installFocusRing();

/** The website opens on the brand screen; phones have the native splash. */
const WEB = Platform.OS === 'web';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden, or called twice during fast refresh. Not worth failing for.
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    BricolageGrotesque_700Bold,
    Fraunces_600SemiBold,
  });
  const [splashDone, setSplashDone] = useState(!WEB);
  const endSplash = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    // Hide on error too: a missing font should degrade to the system face,
    // not leave the user staring at the splash forever.
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return WEB ? <LaunchSplash ready={false} /> : null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ChromeProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: color.background },
            }}
          >
            <Stack.Screen name="(customer)" />
            <Stack.Screen name="deal/[id]" options={{ presentation: 'card' }} />
            <Stack.Screen name="profile" />
            <Stack.Screen name="sign-in" options={{ presentation: 'modal' }} />
            <Stack.Screen name="business" />
            <Stack.Screen name="list-business" />
            <Stack.Screen name="merchant" />
            <Stack.Screen name="admin" />
          </Stack>
          <LoadErrorBanner />
          <PageTitle />
          {splashDone ? null : <LaunchSplash ready onDone={endSplash} />}
        </ChromeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
