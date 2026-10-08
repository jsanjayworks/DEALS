/**
 * Search, focused.
 *
 * The rule-based parser runs on every keystroke — it takes under a
 * millisecond — so the "Understood as" chips show how the query will be read
 * before anything is submitted, and a quarter-second after typing stops the
 * best few matches appear underneath, so "chicken under 200" answers itself
 * without a submit. Submitting hands the raw text to Results, which
 * parses it again; the text, not the parsed filters, is what goes in the URL,
 * so a shared link re-parses with whatever parser is current.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { TOP_CATEGORIES } from '../../data/seed-reference';
import { parseQuery, SUGGESTED_QUERIES } from '../../search/parser';

import { useOrigin, useSession } from '../../state/session';
import { db } from '../../data';
import type { DealCardModel } from '../../data/types';
import { color, font, radius, size, space, type } from '../../theme/tokens';
import { Button, DealCard, Icon, Label, categoryIcon } from '../../components';
import { useHideOnScroll } from '../../ui/chrome';
import { useTabBarSpace } from '../../ui/FloatingTabBar';
import { MAX_CONTENT_WIDTH } from '../../ui/layout';
import { reach } from '../../lib/a11y';
import { openVoice } from '../../voice/VoiceHost';

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { onScroll } = useHideOnScroll();
  const tabSpace = useTabBarSpace();
  const params = useLocalSearchParams<{ q?: string }>();
  const [text, setText] = useState(params.q ?? '');
  const input = useRef<TextInput>(null);
  const recent = useSession((s) => s.recentSearches);
  const addRecent = useSession((s) => s.addRecentSearch);
  const clearRecent = useSession((s) => s.clearRecentSearches);
  const radiusM = useSession((s) => s.radiusM);
  const origin = useOrigin();
  const [preview, setPreview] = useState<{ text: string; deals: DealCardModel[]; total: number } | null>(
    null,
  );

  // A search tab is opened to type into, so take focus whenever it is shown.
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => input.current?.focus(), 250);
      return () => clearTimeout(t);
    }, []),
  );

  const parsed = useMemo(() => parseQuery(text), [text]);
  // "lunch" is both a category chip and a ranking keyword; show it once.
  const extraKeywords = useMemo(() => {
    const labels = new Set(parsed.chips.map((c) => c.label.toLowerCase()));
    return parsed.filters.keywords.filter((k) => !labels.has(k.toLowerCase()));
  }, [parsed]);

  // The best few matches for what is typed so far, once typing pauses.
  useEffect(() => {
    const q = text.trim();
    if (!q) return;
    let active = true;
    const t = setTimeout(() => {
      const f = parsed.filters;
      db.searchDeals({
        q,
        filters: { ...f, radius_km: f.radius_km ?? radiusM / 1000 },
        origin,
        limit: 4,
      })
        .then((r) => {
          if (active) setPreview({ text: q, deals: r.deals, total: r.total });
        })
        .catch(() => {
          // The preview is a convenience; Show deals still works.
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [text, parsed, radiusM, origin]);
  const shown = preview && preview.text === text.trim() ? preview : null;

  const openDeal = (deal: DealCardModel) => {
    addRecent(text.trim());
    router.push({ pathname: '/deal/[id]', params: { id: deal.id, from: 'search.suggest' } });
  };

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    addRecent(trimmed);
    input.current?.blur();
    router.push({ pathname: '/results', params: { q: trimmed, radius: String(radiusM) } });
  };

  const typing = text.trim().length > 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <View style={styles.inputWrap}>
          <Icon name="search" size={20} color={color.text} strokeWidth={2} />
          <TextInput
            ref={input}
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => submit(text)}
            placeholder="Lunch under ₹300 near me"
            placeholderTextColor={color.textMuted}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search deals"
            style={[styles.input, WEB_NO_FOCUS_RING]}
          />
          {typing ? (
            <Pressable
              onPress={() => setText('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              style={reach(10)}
            >
              <Icon name="x" size={18} color={color.textSecondary} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={openVoice}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Search by voice"
            style={reach(10)}
          >
            <Icon name="mic" size={20} color={color.brand} />
          </Pressable>
        </View>
      </View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingBottom: tabSpace }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {typing ? (
          <View>
            <Label>Understood as</Label>
            {parsed.chips.length > 0 || extraKeywords.length > 0 ? (
              <View style={styles.chipWrap}>
                {parsed.chips.map((c, i) => (
                  <View key={c.key + i} style={styles.parsedChip}>
                    <Text style={styles.parsedChipText}>{c.label}</Text>
                  </View>
                ))}
                {extraKeywords.map((k) => (
                  <View key={'kw-' + k} style={[styles.parsedChip, styles.keywordChip]}>
                    <Text style={styles.keywordChipText}>“{k}”</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.hint}>Keep typing — try a dish, a place or a price.</Text>
            )}
            {shown ? (
              <View style={styles.preview}>
                <Label>
                  {shown.total > 0
                    ? 'Top matches · ' + shown.total + (shown.total === 1 ? ' deal' : ' deals')
                    : 'No exact matches yet'}
                </Label>
                {shown.total === 0 ? (
                  <Text style={styles.hint}>Show deals finds the closest ones nearby.</Text>
                ) : (
                  <View style={styles.previewList}>
                    {shown.deals.map((d) => (
                      <DealCard key={d.id} deal={d} variant="list" onPress={() => openDeal(d)} />
                    ))}
                  </View>
                )}
              </View>
            ) : null}
            <View style={styles.submit}>
              <Button full icon="search" onPress={() => submit(text)}>
                {shown && shown.total > shown.deals.length ? 'Show all ' + shown.total + ' deals' : 'Show deals'}
              </Button>
            </View>
          </View>
        ) : (
          <>
            {recent.length > 0 ? (
              <View style={styles.block}>
                <View style={styles.blockHead}>
                  <Label>Recent</Label>
                  <Pressable onPress={clearRecent} hitSlop={8} accessibilityRole="button" style={reach(8)}>
                    <Text style={styles.clear}>Clear</Text>
                  </Pressable>
                </View>
                {recent.map((q) => (
                  // Two buttons side by side: a button inside a button is not
                  // valid on the web, and screen readers announce it oddly.
                  <View key={q} style={styles.recentRow}>
                    <Pressable
                      onPress={() => submit(q)}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.row, styles.flex, pressed && styles.pressed]}
                    >
                      <Icon name="clock" size={18} color={color.textMuted} />
                      <Text style={styles.rowText} numberOfLines={1}>
                        {q}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setText(q)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={'Edit ' + q}
                      style={styles.recentEdit}
                    >
                      <Icon name="chev" size={16} color={color.textMuted} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.block}>
              <Label>Try asking</Label>
              {SUGGESTED_QUERIES.map((q) => (
                <Pressable
                  key={q}
                  onPress={() => submit(q)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <Icon name="spark" size={18} color={color.textSecondary} />
                  <Text style={styles.rowText}>{q}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.block}>
              <Label>Browse</Label>
              <View style={styles.grid}>
                {TOP_CATEGORIES.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() =>
                      router.push({ pathname: '/category/[vertical]', params: { vertical: c.vertical } })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={c.name + ' deals'}
                    style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
                  >
                    <Icon name={categoryIcon(c.icon)} size={26} color={color.text} strokeWidth={1.6} />
                    <Text style={styles.tileLabel}>{c.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        )}
      </Animated.ScrollView>
    </View>
  );
}

// The bordered wrapper is the focus indicator, so drop the browser's own ring.
// Chrome's outline-style:auto ignores outline-width, and React Native's types
// do not list 'none', hence the cast.
const WEB_NO_FOCUS_RING =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.surface,
  },
  bar: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  inputWrap: {
    height: size.button,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: color.text,
    backgroundColor: color.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  input: {
    flex: 1,
    height: '100%',
    ...type.body,
    color: color.text,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    padding: space.xl,
    paddingBottom: space.xxxl,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  parsedChip: {
    height: 32,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceSoftAlt,
    justifyContent: 'center',
  },
  parsedChipText: {
    ...type.captionMedium,
    color: color.text,
  },
  keywordChip: {
    backgroundColor: color.surfaceSoftAlt,
  },
  keywordChipText: {
    ...type.captionMedium,
    color: color.textSecondary,
  },
  hint: {
    ...type.body,
    color: color.textSecondary,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recentEdit: {
    paddingLeft: space.md,
    paddingVertical: space.sm,
  },
  flex: {
    flex: 1,
  },
  preview: {
    marginTop: space.xl,
  },
  previewList: {
    gap: space.md,
    marginTop: space.sm,
  },
  submit: {
    marginTop: space.xxl,
  },
  block: {
    marginBottom: space.xxl,
  },
  blockHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  clear: {
    ...type.captionMedium,
    fontFamily: font.semibold,
    color: color.brand,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: size.touchTarget,
    paddingVertical: space.sm,
  },
  rowText: {
    ...type.body,
    color: color.text,
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  tile: {
    width: '23%',
    flexGrow: 1,
    aspectRatio: 1,
    // Square on a phone; on a wide screen a square is a 280 px empty box.
    maxHeight: 96,
    borderRadius: radius.xl,
    backgroundColor: color.surfaceSoftAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tileLabel: {
    ...type.smallMedium,
    color: color.text,
  },
});
