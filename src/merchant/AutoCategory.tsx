/**
 * Shows where typed words were filed ("Listed under Food › Cafe and Coffee")
 * with a Change link that opens the category chips. When the words say
 * nothing we know, the chips open by themselves so the merchant picks.
 */

import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CATEGORIES, TOP_CATEGORIES } from '../data/seed-reference';
import { categoryPath } from './classify';
import { color, radius, space, type } from '../theme/tokens';
import { Chip, Icon, Label } from '../components';
import { reach } from '../lib/a11y';

export function AutoCategory({
  slug,
  typed,
  extra,
  error,
  more,
  onPick,
}: {
  /** The category in use: detected, or picked. */
  slug: string | null;
  /** Whether enough has been typed to have tried detecting one. */
  typed: boolean;
  /** Said after the category, e.g. "as a Bundle". */
  extra?: string;
  error?: string;
  /** More choices shown with the chips, e.g. the kind of deal. */
  more?: ReactNode;
  onPick: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const picked = CATEGORIES.find((c) => c.slug === slug) ?? null;
  const top = picked ? (picked.parent_id ? CATEGORIES.find((c) => c.id === picked.parent_id) : picked) : null;
  const subs = top ? CATEGORIES.filter((c) => c.parent_id === top.id) : [];
  const showChips = open || (typed && !picked);

  return (
    <View style={styles.wrap}>
      {picked ? (
        <View style={styles.found} accessibilityLiveRegion="polite">
          <Icon name="check" size={16} color={color.brand} strokeWidth={2.2} />
          <Text style={styles.foundText}>
            Listed under <Text style={styles.strong}>{categoryPath(picked.slug)}</Text>
            {extra ? ' ' + extra : ''}
          </Text>
          <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" hitSlop={8} style={reach(8)}>
            <Text style={styles.change}>{open ? 'Done' : 'Change'}</Text>
          </Pressable>
        </View>
      ) : typed ? (
        <Text style={styles.ask}>We could not tell the category from that. Pick the closest:</Text>
      ) : null}

      {showChips ? (
        <View style={styles.chooser}>
          <Label>Category</Label>
          <View style={styles.chips}>
            {TOP_CATEGORIES.map((c) => (
              <Chip key={c.id} selected={top?.id === c.id} onPress={() => onPick(c.slug)}>
                {c.name}
              </Chip>
            ))}
          </View>
          {subs.length > 0 ? (
            <>
              <Label>More specifically</Label>
              <View style={styles.chips}>
                {subs.map((c) => (
                  <Chip key={c.id} selected={picked?.slug === c.slug} onPress={() => onPick(c.slug)}>
                    {c.name}
                  </Chip>
                ))}
              </View>
            </>
          ) : null}
          {more}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.sm,
  },
  found: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
  },
  foundText: {
    ...type.caption,
    color: color.textSecondary,
    flex: 1,
  },
  strong: {
    ...type.captionMedium,
    color: color.text,
  },
  change: {
    ...type.captionMedium,
    color: color.brand,
  },
  ask: {
    ...type.captionMedium,
    color: color.textSecondary,
  },
  chooser: {
    gap: space.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  error: {
    ...type.captionMedium,
    color: color.alert,
  },
});
