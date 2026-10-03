/**
 * Placeholder for the centre tab. The tab button opens the wizard directly;
 * this only runs if someone lands on /merchant/create by URL.
 */

import { Redirect } from 'expo-router';

export default function CreateTab() {
  return <Redirect href="/merchant/new" />;
}
