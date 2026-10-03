/**
 * The filters sheet on Results.
 *
 * It edits a draft copy and only hands it back on "Show deals", so closing the
 * sheet throws the changes away instead of re-querying on every tap. Every
 * control maps to one SearchFilters field, the same fields the parser fills,
 * which is why a typed "under ₹500" and a tapped "Under ₹500" are identical.
 */

import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { TOP_CATEGORIES } from '../data/seed-reference';
import type { DealTypeCode, SearchFilters, SortKey } from '../data/types';
import { color, space, type } from '../theme/tokens';
import { Button, Chip, Label, Sheet } from '../components';
import { EMPTY_FILTERS } from './parser';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'distance', label: 'Nearest' },
  { key: 'ending_soon', label: 'Ending soon' },
  { key: 'best_value', label: 'Best value' },
];

const PRICE_OPTIONS: { label: string; max: number | null }[] = [
  { label: 'Any', max: null },
  { label: 'Under ₹200', max: 200 },
  { label: 'Under ₹500', max: 500 },
  { label: 'Under ₹1,000', max: 1000 },
  { label: 'Under ₹2,000', max: 2000 },
];

const DISTANCE_OPTIONS: { label: string; km: number | null }[] = [
  { label: '500m', km: 0.5 },
  { label: '1km', km: 1 },
  { label: '3km', km: 3 },
  { label: '5km', km: 5 },
  { label: '10km', km: 10 },
];

const TIME_OPTIONS: { label: string; value: SearchFilters['time_of_day'] }[] = [
  { label: 'Any time', value: null },
  { label: 'Morning', value: 'morning' },
  { label: 'Lunch', value: 'lunch' },
  { label: 'Evening', value: 'evening' },
  { label: 'Night', value: 'night' },
];

const RATING_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Any', value: null },
  { label: '4.0+', value: 4 },
  { label: '4.5+', value: 4.5 },
];

const DEAL_TYPE_OPTIONS: { label: string; code: DealTypeCode }[] = [
  { label: 'Free', code: 'free' },
  { label: 'Flash Deal', code: 'flash' },
  { label: 'Buy X Get Y', code: 'bxgy' },
  { label: 'Bundle', code: 'bundle' },
  { label: 'Booking', code: 'booking' },
  { label: 'Experience', code: 'experience' },
];

export interface FilterSheetProps {
  visible: boolean;
  filters: SearchFilters;
  onApply: (next: SearchFilters) => void;
  onClose: () => void;
  /** On a category page the category is fixed, so its row is left out. */
  hideCategory?: boolean;
}

/** Mounted only while open, so each opening drafts from the live filters. */
export function FilterSheet(props: FilterSheetProps) {
  return props.visible ? <FilterSheetOpen {...props} /> : null;
}

function FilterSheetOpen({ visible, filters, onApply, onClose, hideCategory }: FilterSheetProps) {
  const [draft, setDraft] = useState(filters);

  const patch = (p: Partial<SearchFilters>) => setDraft((d) => ({ ...d, ...p }));

  const toggleType = (code: DealTypeCode) =>
    setDraft((d) => ({
      ...d,
      deal_types: d.deal_types.includes(code)
        ? d.deal_types.filter((t) => t !== code)
        : [...d.deal_types, code],
    }));

  const reset = () =>
    setDraft({
      ...EMPTY_FILTERS,
      // The query's own words stay; only the refinements are cleared.
      keywords: draft.keywords,
      radius_km: draft.radius_km,
    });

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filters"
      footer={
        <View style={styles.footer}>
          <Button variant="secondary" onPress={reset}>
            Reset
          </Button>
          <View style={styles.footerMain}>
            <Button full onPress={() => onApply(draft)}>
              Show deals
            </Button>
          </View>
        </View>
      }
    >
      <Group label="Sort by">
        {SORT_OPTIONS.map((o) => (
          <Chip key={o.key} selected={draft.sort === o.key} onPress={() => patch({ sort: o.key })}>
            {o.label}
          </Chip>
        ))}
      </Group>

      {hideCategory ? null : (
        <Group label="Category">
          <Chip
            selected={draft.vertical === null}
            onPress={() => patch({ vertical: null, category_slug: null })}
          >
            All
          </Chip>
          {TOP_CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              selected={draft.vertical === c.vertical}
              onPress={() => patch({ vertical: c.vertical, category_slug: null })}
            >
              {c.name}
            </Chip>
          ))}
        </Group>
      )}

      <Group label="Distance">
        {DISTANCE_OPTIONS.map((o) => (
          <Chip
            key={o.label}
            selected={(draft.radius_km ?? 5) === o.km}
            onPress={() => patch({ radius_km: o.km })}
          >
            {o.label}
          </Chip>
        ))}
      </Group>

      <Group label="Price">
        {PRICE_OPTIONS.map((o) => (
          <Chip
            key={o.label}
            selected={draft.price_max === o.max}
            onPress={() => patch({ price_max: o.max, price_min: null })}
          >
            {o.label}
          </Chip>
        ))}
      </Group>

      <Group label="When">
        {TIME_OPTIONS.map((o) => (
          <Chip
            key={o.label}
            selected={draft.time_of_day === o.value}
            onPress={() => patch({ time_of_day: o.value })}
          >
            {o.label}
          </Chip>
        ))}
      </Group>

      <Group label="Deal type">
        {DEAL_TYPE_OPTIONS.map((o) => (
          <Chip
            key={o.code}
            selected={draft.deal_types.includes(o.code)}
            onPress={() => toggleType(o.code)}
          >
            {o.label}
          </Chip>
        ))}
      </Group>

      <Group label="Rating">
        {RATING_OPTIONS.map((o) => (
          <Chip
            key={o.label}
            selected={draft.min_rating === o.value}
            onPress={() => patch({ min_rating: o.value })}
          >
            {o.label}
          </Chip>
        ))}
      </Group>

      <Toggle
        label="YOLO Verified businesses only"
        value={draft.verified_only}
        onChange={(v) => patch({ verified_only: v })}
      />
      <Toggle
        label="Ending soon"
        value={draft.ending_soon}
        onChange={(v) => patch({ ending_soon: v })}
      />
    </Sheet>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Label>{label}</Label>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      aria-checked={value}
      style={styles.toggle}
    >
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: color.brand, false: color.border }}
        thumbColor={color.white}
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: {
    marginBottom: space.xl,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  toggleLabel: {
    ...type.bodyMedium,
    color: color.text,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: space.md,
  },
  footerMain: {
    flex: 1,
  },
});
