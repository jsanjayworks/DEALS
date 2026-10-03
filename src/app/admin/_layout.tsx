/**
 * Admin tools, in-app for the MVP. Gated on is_admin, the same flag the
 * database's current_is_admin() reads; the Next.js console replaces this later.
 */

import { Redirect, Stack } from 'expo-router';
import { useViewer, useViewerReady } from '../../state/session';
import { color } from '../../theme/tokens';

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
  if (!viewer?.is_admin) return <Redirect href="/profile" />;
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.background, ...COLUMN } }}
    />
  );
}
