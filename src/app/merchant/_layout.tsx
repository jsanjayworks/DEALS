/**
 * Merchant mode. Only someone who belongs to a business gets in, the same
 * rule business_members enforces in the database. Signed-out visitors get the
 * merchant login (/business); signed-in accounts without a business get the
 * "List your business" setup. Getting in is remembered, so a merchant
 * reopens the app into their dashboard.
 */

import { useEffect } from 'react';
import { Redirect, Stack } from 'expo-router';
import { useBusinessId } from '../../merchant/useBusiness';
import { useSession, useViewer, useViewerReady } from '../../state/session';
import { color } from '../../theme/tokens';

export default function MerchantLayout() {
  const businessId = useBusinessId();
  const ready = useViewerReady();
  const viewer = useViewer();
  const setMode = useSession((s) => s.setMode);

  useEffect(() => {
    if (businessId) setMode('merchant');
  }, [businessId, setMode]);

  // Right after launch the session may still be restoring; deciding now would
  // send a real merchant to the setup screen.
  if (!ready) return null;
  if (!viewer) return <Redirect href="/business" />;
  if (!businessId) return <Redirect href="/list-business" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.background },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="deal/[id]" />
      {/* Full screen: a swipe-to-dismiss sheet is too easy to lose mid-form. */}
      <Stack.Screen name="new" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="verify" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  );
}
