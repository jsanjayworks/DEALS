import { View } from 'react-native';
import { EmptyState, Header } from '../../components';
import { color } from '../../theme/tokens';

export default function SearchScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: color.surface }}>
      <Header title="Search" />
      <EmptyState
        icon="spark"
        title="Search is next"
        body="The natural-language parser and ranked results are built and tested. This screen is where they land."
      />
    </View>
  );
}
