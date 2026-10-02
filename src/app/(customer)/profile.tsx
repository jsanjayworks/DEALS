import { View } from 'react-native';
import { EmptyState, Header } from '../../components';
import { color } from '../../theme/tokens';

export default function ProfileScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: color.background }}>
      <Header title="Profile" />
      <EmptyState icon="user" title="Profile" body="Saved locations, radius, interests and the switch to merchant mode." />
    </View>
  );
}
