/**
 * Customer tabs: Home, Search and My Deals, on a floating glass bar.
 *
 * Profile is not a tab any more; it opens from the avatar in the Home header,
 * as a page pushed over the tabs.
 */

import { Tabs } from 'expo-router';
import { FloatingTabBar } from '../../ui/FloatingTabBar';
import { color } from '../../theme/tokens';

export default function CustomerTabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="my-deals" options={{ title: 'My Deals' }} />
    </Tabs>
  );
}
