import { View } from 'react-native';
import { EmptyState, Header } from '../../components';
import { color } from '../../theme/tokens';

export default function MyDealsScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: color.background }}>
      <Header title="My Deals" />
      <EmptyState
        icon="ticket"
        title="Nothing claimed yet"
        body="Deals you claim, book or enquire about will show up here with their codes."
      />
    </View>
  );
}
