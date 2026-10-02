import { View } from 'react-native';
import { router } from 'expo-router';
import { EmptyState, Header } from '../components';
import { color } from '../theme/tokens';

export default function ResultsScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: color.background }}>
      <Header title="Results" onBack={() => router.back()} />
      <EmptyState
        icon="list"
        title="Results list is next"
        body="search_deals is built and tested: filters, ranking, locality re-centring and all four sorts."
      />
    </View>
  );
}
