/**
 * Merchant tabs: Dashboard, Deals, a raised Create button, Redeem and
 * Insights, drawn by MerchantTabBar. Create is not a tab of its own; it opens
 * the wizard over the tabs.
 */

import { Tabs } from 'expo-router';
import { MerchantTabBar } from '../../../merchant/MerchantTabBar';
import { color } from '../../../theme/tokens';

export default function MerchantTabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <MerchantTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="deals" options={{ title: 'Deals' }} />
      <Tabs.Screen name="create" options={{ title: 'Create' }} />
      <Tabs.Screen name="redeem" options={{ title: 'Redeem' }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
    </Tabs>
  );
}
