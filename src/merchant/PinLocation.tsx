/**
 * "Use my current location" for a business: pins the shop where the owner is
 * standing, so distances to it are exact rather than the area's centre. The
 * nearest area is picked with it.
 */

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { locateMe } from '../lib/location';
import type { LatLng } from '../data/types';
import { color, space, type } from '../theme/tokens';
import { Button } from '../components';

export function PinLocation({
  pinned,
  onFound,
}: {
  /** The area name when the shop is pinned to the device's position; null when it is not. */
  pinned: string | null;
  onFound: (point: LatLng, areaName: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const find = async () => {
    setBusy(true);
    setError(null);
    const found = await locateMe();
    setBusy(false);
    if (found.ok) onFound(found.point, found.near.name);
    else setError(found.message);
  };

  return (
    <View style={styles.wrap}>
      <Button small variant="secondary" icon="pin" loading={busy} onPress={() => void find()}>
        Use my current location
      </Button>
      {pinned ? (
        <Text style={styles.ok}>Pinned to where you are now, near {pinned}. Customers see exact distances.</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.xs,
    alignItems: 'flex-start',
    marginBottom: space.sm,
  },
  ok: {
    ...type.caption,
    color: color.textSecondary,
  },
  error: {
    ...type.captionMedium,
    color: color.alert,
  },
});
