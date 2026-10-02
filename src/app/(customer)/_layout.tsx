/**
 * Customer tab bar: Home, Search, My Deals, Profile.
 *
 * Matches the design's 68pt bar with the active pill behind the icon. Merchant
 * mode gets its own group with a centre Create button and the plum header.
 */

import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { color, font, size } from '../../theme/tokens';
import { Icon, type IconName } from '../../components';

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return (
    <View style={[styles.iconPill, focused && styles.iconPillActive]}>
      <Icon name={name} size={22} color={focused ? color.brand : color.textMuted} />
    </View>
  );
}

export default function CustomerTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.brand,
        tabBarInactiveTintColor: color.textMuted,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        sceneStyle: { backgroundColor: color.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ focused }) => <TabIcon name="search" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="my-deals"
        options={{
          title: 'My Deals',
          tabBarIcon: ({ focused }) => <TabIcon name="ticket" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon name="user" focused={focused} />,
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
  item: {
    paddingVertical: 2,
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
    // 10% of the brand plum, written out because React Native has no colour-mix.
    backgroundColor: '#4B1D6B1A',
  },
});
