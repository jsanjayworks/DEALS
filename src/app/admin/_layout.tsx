/**
 * Admin tools, in-app for the MVP. Gated on is_admin, the same flag the
 * database's current_is_admin() reads; the Next.js console replaces this later.
 */

import { Stack, router } from 'expo-router';
import { View } from 'react-native';
import { useViewer, useViewerReady } from '../../state/session';
import { color } from '../../theme/tokens';
import { screenTransition } from '../../ui/ScreenTransition';
import { Button, EmptyState, Header } from '../../components';

/**
 * On a wide screen the admin tools sit in a centred column, not a 1,280 px stretch:
 * review cards read best at console width.
 */
// Auto margins, not alignSelf: React Navigation positions screens absolutely from the left.
const COLUMN = { width: '100%', maxWidth: 960, marginHorizontal: 'auto' } as const;

export default function AdminLayout() {
  const viewer = useViewer();
  const ready = useViewerReady();
  if (!ready) return null;
  // Say why, rather than bouncing silently somewhere else.
  if (!viewer?.is_admin) {
    return (
      <View style={{ flex: 1, backgroundColor: color.background }}>
        <Header title="YOLO team" onBack={() => router.replace('/')} />
        <EmptyState
          icon="shield"
          title="This area is for the YOLO team"
          body="It holds the review and support tools. Your account does not have access."
          action={<Button onPress={() => router.replace('/')}>Go to Home</Button>}
        />
      </View>
    );
  }
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.background, ...COLUMN } }}
      screenLayout={screenTransition}
    />
  );
}
