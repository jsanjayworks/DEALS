/**
 * Things to ask the assistant, one tap each, under the search bar. They show
 * what the assistant can do without anyone having to guess what to say;
 * signed out, they stick to what works without an account.
 */

import { ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';
import { color, radius, space, type } from '../theme/tokens';
import { Icon } from '../components';
import { useLayout } from '../ui/layout';
import { openVoice } from '../voice/VoiceHost';

const SIGNED_IN = ["What's the best deal for me today?", 'Order my usual', 'How much have I saved?', "What's my code?"];
const SIGNED_OUT = ["What's the best deal near me today?", 'What should I eat tonight?', 'Is Rangoli Kitchen open now?'];

export function AskChips({ signedIn }: { signedIn: boolean }) {
  const layout = useLayout();
  const asks = signedIn ? SIGNED_IN : SIGNED_OUT;
  return (
    <View style={[styles.wrap, { marginHorizontal: -layout.gutter }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.row, { paddingHorizontal: layout.gutter }]}
      >
        <View style={styles.lead} accessibilityElementsHidden importantForAccessibility="no">
          <Icon name="sparkles" size={14} color={color.brand} strokeWidth={2} />
          <Text style={styles.leadText}>Ask YOLO</Text>
        </View>
        {asks.map((a) => (
          <Pressable
            key={a}
            onPress={() => openVoice(a)}
            accessibilityRole="button"
            accessibilityLabel={'Ask YOLO: ' + a}
            style={({ pressed }) => [styles.chip, pressed && { opacity: 0.75 }]}
          >
            <Text style={styles.chipText} numberOfLines={1}>
              {a}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: space.md,
  },
  row: {
    alignItems: 'center',
    gap: space.sm,
  },
  lead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 2,
  },
  leadText: {
    ...type.overline,
    color: color.brand,
  },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  chipText: {
    ...type.captionMedium,
    color: color.text,
  },
});
