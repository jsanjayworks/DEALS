/**
 * What customers see on the shop page beyond the basics: about, hours, cost
 * for two, amenities, the menu or rate card, and photos. Edited as one
 * draft with the rest of Business details and saved with it.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { AMENITIES } from '../data/amenities';
import type { MenuItem, Vertical } from '../data/types';
import { color, radius, space, type } from '../theme/tokens';
import { Button, Chip, Field, Icon, Label, Sheet } from '../components';
import { DealPhotoPicker } from './DealPhotoPicker';

export interface ShopDraft {
  description: string;
  open_time: string;
  close_time: string;
  cost_for_two: string;
  amenities: string[];
  menu: MenuItem[];
  photos: string[];
}

export function ShopEditor({
  draft,
  onChange,
  businessId,
  businessName,
  vertical,
  categorySlug,
}: {
  draft: ShopDraft;
  onChange: (next: ShopDraft) => void;
  businessId: string;
  businessName: string;
  vertical: Vertical | null;
  categorySlug: string | null;
}) {
  const [adding, setAdding] = useState(false);
  const food = vertical === 'food';
  const set = (patch: Partial<ShopDraft>) => onChange({ ...draft, ...patch });
  const setItem = (i: number, patch: Partial<MenuItem>) =>
    set({ menu: draft.menu.map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Your shop page</Text>
      <Text style={styles.lead}>What customers see when they open your business: like a page on District.</Text>

      <Field
        label="About your business (optional)"
        value={draft.description}
        onChangeText={(description) => set({ description })}
        placeholder="We serve South Indian breakfasts and thalis since 1998…"
        multiline
        style={styles.multi}
      />

      <View style={styles.pair}>
        <View style={styles.flex}>
          <Field
            label="Opens at"
            value={draft.open_time}
            onChangeText={(open_time) => set({ open_time })}
            placeholder="10:00"
            maxLength={5}
          />
        </View>
        <View style={styles.flex}>
          <Field
            label="Closes at"
            value={draft.close_time}
            onChangeText={(close_time) => set({ close_time })}
            placeholder="22:00"
            maxLength={5}
          />
        </View>
      </View>

      {food ? (
        <Field
          label="Cost for two (₹, optional)"
          value={draft.cost_for_two}
          onChangeText={(t) => set({ cost_for_two: t.replace(/[^0-9]/g, '') })}
          placeholder="800"
          keyboardType="number-pad"
          maxLength={5}
        />
      ) : null}

      <Label>Amenities</Label>
      <View style={styles.chips}>
        {AMENITIES.filter((a) => food || !['pure_veg', 'serves_alcohol', 'rooftop', 'live_music'].includes(a.key)).map((a) => {
          const on = draft.amenities.includes(a.key);
          return (
            <Chip
              key={a.key}
              selected={on}
              onPress={() => set({ amenities: on ? draft.amenities.filter((x) => x !== a.key) : [...draft.amenities, a.key] })}
            >
              {a.label}
            </Chip>
          );
        })}
      </View>

      <Label>{food ? 'Menu' : 'Rate card'}</Label>
      <View style={styles.menu}>
        {draft.menu.map((m, i) => (
          <View key={i} style={styles.menuRow}>
            {m.photo ? <Image source={{ uri: m.photo }} style={styles.menuPhoto} contentFit="cover" /> : null}
            <View style={styles.flex}>
              <TextInput
                value={m.name}
                onChangeText={(name) => setItem(i, { name })}
                placeholder="Item name"
                placeholderTextColor={color.textMuted}
                style={styles.menuName}
                accessibilityLabel={'Menu item ' + (i + 1) + ' name'}
              />
              <View style={styles.menuMeta}>
                <Text style={styles.rupee}>₹</Text>
                <TextInput
                  value={m.price != null ? String(m.price) : ''}
                  onChangeText={(t) => {
                    const n = Number(t.replace(/[^0-9]/g, ''));
                    setItem(i, { price: t.trim() && Number.isFinite(n) ? n : null });
                  }}
                  placeholder="Price"
                  placeholderTextColor={color.textMuted}
                  keyboardType="number-pad"
                  style={styles.price}
                  accessibilityLabel={'Menu item ' + (i + 1) + ' price'}
                />
                {food ? (
                  <Chip selected={m.veg === true} onPress={() => setItem(i, { veg: m.veg === true ? false : true })}>
                    {m.veg === true ? 'Veg' : 'Non-veg'}
                  </Chip>
                ) : null}
              </View>
            </View>
            <Pressable
              onPress={() => set({ menu: draft.menu.filter((_, j) => j !== i) })}
              accessibilityRole="button"
              accessibilityLabel={'Remove ' + (m.name || 'item')}
              hitSlop={8}
              style={styles.remove}
            >
              <Icon name="x" size={16} color={color.textSecondary} />
            </Pressable>
          </View>
        ))}
        <Button
          small
          variant="secondary"
          icon="plus"
          onPress={() => set({ menu: [...draft.menu, { name: '', price: null, veg: food ? true : null }] })}
        >
          Add an item
        </Button>
      </View>

      <Label>Photos</Label>
      <View style={styles.photos}>
        {draft.photos.map((p, i) => (
          <View key={p + i}>
            <Image source={{ uri: p }} style={styles.photo} contentFit="cover" />
            <Pressable
              onPress={() => set({ photos: draft.photos.filter((_, j) => j !== i) })}
              accessibilityRole="button"
              accessibilityLabel={'Remove photo ' + (i + 1)}
              style={styles.photoRemove}
            >
              <Icon name="x" size={12} color={color.white} strokeWidth={2.4} />
            </Pressable>
            {i === 0 ? <Text style={styles.coverTag}>Cover</Text> : null}
          </View>
        ))}
        <Pressable
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          accessibilityLabel="Add a photo"
          style={[styles.photo, styles.addPhoto]}
        >
          <Icon name="plus" size={22} color={color.brand} />
          <Text style={styles.addText}>Add photo</Text>
        </Pressable>
      </View>

      <Sheet visible={adding} onClose={() => setAdding(false)} title="Add a photo">
        <DealPhotoPicker
          businessId={businessId}
          title={businessName}
          summary=""
          vertical={vertical}
          categorySlug={categorySlug}
          photo={null}
          onChange={(url) => {
            if (url) set({ photos: [...draft.photos, url] });
            setAdding(false);
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.md,
    marginTop: space.lg,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  heading: {
    ...type.h3,
    color: color.text,
  },
  lead: {
    ...type.caption,
    color: color.textSecondary,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  multi: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: space.md,
  },
  pair: {
    flexDirection: 'row',
    gap: space.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  menu: {
    gap: space.sm,
    alignItems: 'stretch',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  menuPhoto: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
  },
  menuName: {
    ...type.bodySemibold,
    color: color.text,
    paddingVertical: 2,
  },
  menuMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  rupee: {
    ...type.captionMedium,
    color: color.text,
  },
  price: {
    ...type.captionMedium,
    color: color.text,
    width: 72,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
    backgroundColor: color.surfaceSoftAlt,
  },
  remove: {
    padding: 6,
  },
  photos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  photo: {
    width: 96,
    height: 96,
    borderRadius: radius.lg,
    backgroundColor: color.surfaceSoftAlt,
  },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  coverTag: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: color.white,
    fontSize: 11,
  },
  addPhoto: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.border,
  },
  addText: {
    ...type.small,
    color: color.brand,
    marginTop: 2,
  },
});
