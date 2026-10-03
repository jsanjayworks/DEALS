/**
 * Merchant tab bar: Dashboard, Deals, a raised Create button, Redeem and
 * Insights. Create is not a tab of its own; it opens the wizard over the tabs.
 */

import { Pressable, StyleSheet, View } from 'react-native';
import { router, Tabs } from 'expo-router';
import { Icon, type IconName } from '../../../components';
import { alpha, color, font, shadow, size } from '../../../theme/tokens';

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return (
    <View style={[styles.iconPill, focused && styles.iconPillActive]}>
      <Icon name={name} size={22} color={focused ? color.brand : color.textMuted} />
    </View>
  );
}

function CreateButton() {
  return (
    <View style={styles.createSlot}>
      <Pressable
        onPress={() => router.push('/merchant/new')}
        accessibilityRole="button"
        accessibilityLabel="Create a deal"
        style={({ pressed }) => [styles.create, pressed && { transform: [{ scale: 0.96 }] }]}
      >
        <Icon name="plus" size={26} color={color.onCta} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

export default function MerchantTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.brand,
        tabBarInactiveTintColor: color.textMuted,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: styles.label,
        sceneStyle: { backgroundColor: color.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ focused }) => <TabIcon name="grid" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="deals"
        options={{
          title: 'Deals',
          tabBarIcon: ({ focused }) => <TabIcon name="list" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarButton: () => <CreateButton />,
        }}
      />
      <Tabs.Screen
        name="redeem"
        options={{
          title: 'Redeem',
          tabBarIcon: ({ focused }) => <TabIcon name="qr" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ focused }) => <TabIcon name="chart" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: size.tabBar,
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.border,
    paddingTop: 6,
  },
  label: {
    fontFamily: font.medium,
    fontSize: 11,
  },
  iconPill: {
    width: 56,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: {
    backgroundColor: alpha(color.brand, 0.1),
  },
  createSlot: {
    flex: 1,
    alignItems: 'center',
  },
  create: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginTop: -18,
    backgroundColor: color.cta,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: color.surface,
    ...shadow.fab,
  },
});
