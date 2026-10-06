/**
 * The photo on a deal, in the wizard. Three ways to set it:
 *
 *   suggested   a stock photo matched to the title as it is typed (the
 *               default, so no deal ever goes out with an empty card)
 *   library     the merchant searches the same library and picks one
 *   upload      the merchant's own photo, which shows the real thing and
 *               is always the better choice
 */

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { db, RuleViolation } from '../data';
import { isLibraryPhoto, matchPhoto, searchLibrary } from '../data/photo-library';
import type { Vertical } from '../data/types';
import { color, radius, space, type } from '../theme/tokens';
import { Button, Field, Label, Sheet } from '../components';
import { pressedProps } from '../lib/a11y';

export function DealPhotoPicker({
  businessId,
  title,
  summary,
  vertical,
  categorySlug,
  photo,
  onChange,
}: {
  businessId: string | null;
  title: string;
  summary: string;
  vertical: Vertical | null;
  categorySlug: string | null;
  /** The chosen photo's URL, or null to use the suggestion. */
  photo: string | null;
  onChange: (url: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const suggested = useMemo(
    () => matchPhoto({ title: title || categorySlug || '', description: summary, categorySlug, vertical }),
    [title, summary, categorySlug, vertical],
  );
  const shown = photo ?? suggested;
  const caption = !photo
    ? 'Suggested from your title. Change the title and it follows.'
    : isLibraryPhoto(photo)
      ? 'From the photo library'
      : 'Your photo';

  const upload = async () => {
    if (!businessId) return;
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.75,
    });
    if (result.canceled || !result.assets[0]) return;
    setBusy(true);
    try {
      const url = await db.uploadDealPhoto(businessId, {
        uri: result.assets[0].uri,
        mimeType: result.assets[0].mimeType,
      });
      onChange(url);
    } catch (e) {
      setError(e instanceof RuleViolation ? e.message : 'That photo did not upload. Try another one.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Label>Photo</Label>
      <Image source={{ uri: shown }} style={styles.photo} contentFit="cover" transition={150} accessibilityLabel="Deal photo" />
      <Text style={styles.caption}>{caption}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Button small variant="secondary" icon="upload" loading={busy} onPress={() => void upload()}>
          Upload your photo
        </Button>
        <Button small variant="secondary" icon="search" onPress={() => setLibraryOpen(true)}>
          Choose from library
        </Button>
        {photo ? (
          <Button small variant="text" onPress={() => onChange(null)}>
            Use the suggestion
          </Button>
        ) : null}
      </View>
      <Text style={styles.hint}>A photo of the real dish, room or product gets more claims than a stock photo.</Text>

      {libraryOpen ? (
        <LibrarySheet
          initial={title}
          vertical={vertical}
          selected={photo}
          onPick={(url) => {
            onChange(url);
            setLibraryOpen(false);
          }}
          onClose={() => setLibraryOpen(false)}
        />
      ) : null}
    </View>
  );
}

function LibrarySheet({
  initial,
  vertical,
  selected,
  onPick,
  onClose,
}: {
  initial: string;
  vertical: Vertical | null;
  selected: string | null;
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initial);
  const found = useMemo(() => searchLibrary(query, vertical), [query, vertical]);
  // Nothing for those words: say so, and offer the category's photos instead.
  const noMatch = query.trim().length > 0 && found.length === 0;
  const hits = useMemo(() => (noMatch ? searchLibrary('', vertical) : found), [noMatch, found, vertical]);

  return (
    <Sheet visible onClose={onClose} title="Photo library">
      <Field
        label="Search photos"
        value={query}
        onChangeText={setQuery}
        placeholder="e.g. biryani, car wash, haircut"
        autoCapitalize="none"
      />
      {noMatch ? (
        <Text style={styles.hint}>No photos for “{query.trim()}”. Here are photos for this category instead.</Text>
      ) : null}
      <View style={styles.grid}>
        {hits.map((h) => {
          const on = selected === h.url;
          return (
            <Pressable
              key={h.id}
              onPress={() => onPick(h.url)}
              accessibilityRole="button"
              accessibilityLabel={'Use this ' + h.topic.replace(/-/g, ' ') + ' photo'}
              {...pressedProps(on)}
              style={({ pressed }) => [styles.thumbWrap, on && styles.thumbOn, pressed && styles.pressed]}
            >
              <Image
                source={{ uri: h.url.replace('w=800&h=600', 'w=320&h=240') }}
                style={styles.thumb}
                contentFit="cover"
                transition={120}
              />
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>Free photos from Unsplash. Pick one that shows what you offer.</Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.sm,
  },
  photo: {
    width: '100%',
    maxWidth: 480,
    aspectRatio: 4 / 3,
    borderRadius: radius.xl,
    backgroundColor: color.surfaceSoftAlt,
  },
  caption: {
    ...type.caption,
    color: color.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  hint: {
    ...type.small,
    color: color.textMuted,
  },
  error: {
    ...type.caption,
    color: color.alert,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.md,
    marginBottom: space.sm,
  },
  thumbWrap: {
    width: '31.5%',
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  thumbOn: {
    borderColor: color.brand,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  pressed: {
    opacity: 0.7,
  },
});
