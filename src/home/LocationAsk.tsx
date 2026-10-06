/**
 * The first-open question on Home, the way Swiggy and Zomato open: use my
 * location, or choose an area. Asked once; the area picker offers both ways
 * again at any time.
 */

import { StyleSheet, Text, View } from 'react-native';
import { color, radius, space, type } from '../theme/tokens';
import { Button, Icon, Sheet } from '../components';

export function LocationAsk({
  visible,
  locating,
  error,
  onUseLocation,
  onChooseArea,
  onClose,
}: {
  visible: boolean;
  locating: boolean;
  error: string | null;
  onUseLocation: () => void;
  onChooseArea: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Find deals around you">
      <View style={styles.body}>
        <View style={styles.badge}>
          <Icon name="pin" size={28} color={color.brand} />
        </View>
        <Text style={styles.lead}>
          Allow your location to see what is live around you right now, sorted by distance. Or choose an area
          yourself.
        </Text>
        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <Button variant="cta" full icon="pin" loading={locating} onPress={onUseLocation}>
          Use my location
        </Button>
        <Button variant="secondary" full onPress={onChooseArea} disabled={locating}>
          Choose an area
        </Button>
        <Text style={styles.note}>Your location is only used to sort deals by distance. It is not shared with businesses.</Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.md,
    paddingBottom: space.md,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surfaceSoftAlt,
  },
  lead: {
    ...type.body,
    color: color.textSecondary,
  },
  error: {
    ...type.captionMedium,
    color: color.alert,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
  },
  note: {
    ...type.small,
    color: color.textMuted,
    textAlign: 'center',
  },
});
