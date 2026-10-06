/**
 * The browser tab's title on the website, from the route: "Food deals ·
 * YOLO Deals", "Profile · YOLO Deals". A deal page names the deal itself
 * (it sets its own title, which wins because it renders later).
 */

import Head from 'expo-router/head';
import { useGlobalSearchParams, usePathname } from 'expo-router';

const APP = 'YOLO Deals';

const EXACT: Record<string, string> = {
  '/': 'YOLO Deals: offers near you in Bengaluru',
  '/search': 'Search',
  '/my-deals': 'My deals',
  '/profile': 'Profile',
  '/notifications': 'Notifications',
  '/vehicle': 'My vehicle',
  '/sign-in': 'Sign in',
  '/business': 'YOLO for Business',
  '/list-business': 'List your business',
  '/account/edit': 'Edit profile',
  '/account/history': 'Order history',
  '/account/help': 'Help and support',
  '/account/delete': 'Delete account',
  '/legal/privacy': 'Privacy policy',
  '/legal/terms': 'Terms of use',
  '/merchant': 'Merchant dashboard',
  '/merchant/deals': 'Your deals',
  '/merchant/new': 'New deal',
  '/merchant/create': 'New deal',
  '/merchant/redeem': 'Redeem a code',
  '/merchant/insights': 'Insights',
  '/merchant/verify': 'Get YOLO Verified',
  '/merchant/business': 'Business details',
  '/admin': 'Review queue',
  '/admin/businesses': 'Business verification',
  '/admin/reports': 'Reports',
  '/admin/support': 'Support inbox',
};

function titleFor(path: string, q: string | undefined): string {
  if (EXACT[path]) return path === '/' ? EXACT[path] : EXACT[path] + ' · ' + APP;
  const category = path.match(/^\/category\/([a-z]+)/);
  if (category) return category[1].charAt(0).toUpperCase() + category[1].slice(1) + ' deals · ' + APP;
  if (path.startsWith('/results')) return (q ? '“' + q + '”' : 'Deals near you') + ' · ' + APP;
  if (path.startsWith('/merchant/deal/')) return 'Manage deal · ' + APP;
  if (path.startsWith('/deal/')) return 'Deal · ' + APP;
  return APP;
}

export function PageTitle() {
  const path = usePathname();
  const { q } = useGlobalSearchParams<{ q?: string }>();
  return (
    <Head>
      <title>{titleFor(path, typeof q === 'string' ? q : undefined)}</title>
    </Head>
  );
}
