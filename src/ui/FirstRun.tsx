/**
 * Sends a new account to the welcome once: name, age and whether to
 * personalise. Not in the middle of signing in or setting up a business; a
 * merchant sees it the first time they open the customer side.
 */

import { useEffect, useRef } from 'react';
import { router, usePathname } from 'expo-router';
import { useSession, useSessionHydrated, useViewer } from '../state/session';

const NOT_HERE = ['/welcome', '/sign-in', '/business', '/list-business', '/merchant', '/admin', '/legal'];

export function FirstRun() {
  const viewer = useViewer();
  const pathname = usePathname();
  const hydrated = useSessionHydrated();
  const mode = useSession((s) => s.mode);
  const sentFor = useRef<string | null>(null);

  useEffect(() => {
    if (!viewer || viewer.onboarded !== false) return;
    if (NOT_HERE.some((p) => pathname === p || pathname.startsWith(p + '/'))) return;
    // A merchant left in merchant mode is on their way back to the dashboard
    // (Home resumes it in the same moment); wait until they open the customer side.
    if (!hydrated || (mode === 'merchant' && viewer.business_ids.length > 0)) return;
    if (sentFor.current === viewer.id) return;
    sentFor.current = viewer.id;
    router.push({ pathname: '/welcome', params: { next: pathname } });
  }, [viewer, pathname, hydrated, mode]);

  return null;
}
