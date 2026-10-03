/**
 * Admin tools, in-app for the MVP. Gated on is_admin, the same flag the
 * database's current_is_admin() reads; the Next.js console replaces this later.
 */

import { Redirect, Stack } from 'expo-router';
import { useViewer, useViewerReady } from '../../state/session';
import { color } from '../../theme/tokens';

export default function AdminLayout() {
  const viewer = useViewer();
  const ready = useViewerReady();
  if (!ready) return null;
  if (!viewer?.is_admin) return <Redirect href="/profile" />;
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.background } }}
    />
  );
}
