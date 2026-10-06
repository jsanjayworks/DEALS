/**
 * Any address that is not a page: a short branded message and a way home,
 * instead of the framework's default page and its list of every route.
 */

import { View } from 'react-native';
import { router, Stack } from 'expo-router';
import { color } from '../theme/tokens';
import { Button, EmptyState, Header } from '../components';

export default function NotFoundScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: color.background }}>
      <Stack.Screen options={{ title: 'Page not found' }} />
      <Header title="Not found" onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <EmptyState
        icon="search"
        title="This page does not exist"
        body="The link may be old or mistyped. Deals near you are one tap away."
        action={<Button onPress={() => router.replace('/')}>Go to Home</Button>}
      />
    </View>
  );
}
