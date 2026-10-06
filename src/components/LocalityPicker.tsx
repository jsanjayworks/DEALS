/**
 * The "Deals around" picker: the device's own location at the top, then the
 * areas. Choosing an area re-centres every feed and search on its centroid,
 * the same re-centring search_deals does when a query names a place.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Locality } from '../data/types';
import { color, space, type } from '../theme/tokens';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

export interface LocalityPickerProps {
  visible: boolean;
  localities: readonly Locality[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  /** Deals are measured from the device's position, not an area. */
  usingLocation?: boolean;
  /** "Use my current location"; resolves true when it worked. */
  onUseLocation?: () => Promise<boolean>;
  locating?: boolean;
  locationError?: string | null;
}

export function LocalityPicker({
  visible,
  localities,
  selectedId,
  onSelect,
  onClose,
  usingLocation = false,
  onUseLocation,
  locating = false,
  locationError = null,
}: LocalityPickerProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Deals around">
      {onUseLocation ? (
        <>
          <Pressable
            onPress={() => {
              void onUseLocation().then((ok) => ok && onClose());
            }}
            disabled={locating}
            accessibilityRole="radio"
            aria-checked={usingLocation}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={[styles.pin, usingLocation && styles.pinOn]}>
              <Icon name="map" size={18} color={usingLocation ? color.white : color.brand} />
            </View>
            <View style={styles.text}>
              <Text style={styles.name}>{locating ? 'Finding you…' : 'Use my current location'}</Text>
              <Text style={styles.city}>Deals sorted by distance from where you are</Text>
            </View>
            {usingLocation ? <Icon name="check" size={20} color={color.brand} strokeWidth={2.2} /> : null}
          </Pressable>
          {locationError ? <Text style={styles.error}>{locationError}</Text> : null}
          <Text style={styles.or}>Or choose an area</Text>
        </>
      ) : null}
      {localities.map((l) => {
        const selected = !usingLocation && l.id === selectedId;
        return (
          <Pressable
            key={l.id}
            onPress={() => {
              onSelect(l.id);
              onClose();
            }}
            accessibilityRole="radio"
            aria-checked={selected}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={[styles.pin, selected && styles.pinOn]}>
              <Icon name="pin" size={18} color={selected ? color.white : color.brand} />
            </View>
            <View style={styles.text}>
              <Text style={styles.name}>{l.name}</Text>
              <Text style={styles.city}>{l.city}</Text>
            </View>
            {selected ? <Icon name="check" size={20} color={color.brand} strokeWidth={2.2} /> : null}
          </Pressable>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    minHeight: 56,
  },
  pressed: {
    opacity: 0.6,
  },
  pin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.surfaceSoftAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinOn: {
    backgroundColor: color.brand,
  },
  text: {
    flex: 1,
  },
  name: {
    ...type.bodySemibold,
    color: color.text,
  },
  city: {
    ...type.small,
    color: color.textSecondary,
  },
  error: {
    ...type.captionMedium,
    color: color.alert,
    marginBottom: space.sm,
  },
  or: {
    ...type.overline,
    color: color.textMuted,
    marginTop: space.md,
    marginBottom: space.xs,
  },
});
