/**
 * The category grid on Home: every top-level category visible at once, four to
 * a row on a phone and one row on a wide screen, with no sideways scrolling to
 * discover the rest. Each tile shows how many deals are live nearby, and draws
 * the icon its category names in data.
 */

import { memo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { Category } from '../data/types';

import { Icon, RollingNumber, categoryIcon, useHoverPress } from '../components';
import { cellWidth } from '../ui/layout';
import type { LaunchRect } from '../ui/launch';
import { font, theme } from '../theme/tokens';

const GAP = 10;

export const CategoryGrid = memo(CategoryGridView);

function CategoryGridView({
  categories,
  counts,
  width,
  columns,
  onPress,
}: {
  categories: readonly Category[];
  counts: Record<string, number>;
  /** The width the grid fills, inside the gutters. */
  width: number;
  columns: number;
  /** `from` is where the tile sits on screen, so the page can grow out of it. */
  onPress: (c: Category, from: LaunchRect | null) => void;
}) {
  const w = cellWidth(width, columns, GAP);
  return (
    <View style={styles.grid}>
      {categories.map((c) => (
        <Tile
          key={c.id}
          category={c}
          count={counts[c.vertical] ?? 0}
          width={w}
          onPress={(from) => onPress(c, from)}
        />
      ))}
    </View>
  );
}

function Tile({
  category,
  count,
  width,
  onPress,
}: {
  category: Category;
  count: number;
  width: number;
  onPress: (from: LaunchRect | null) => void;
}) {
  const { handlers, liftStyle } = useHoverPress({ lift: 3, pressScale: 0.94 });
  const box = useRef<View>(null);
  const press = () => {
    const node = box.current;
    if (!node) return onPress(null);
    node.measureInWindow((x, y, w, h) => onPress(w > 0 ? { x, y, width: w, height: h } : null));
  };
  return (
    <Pressable
      onPress={press}
      {...handlers}
      accessibilityRole="button"
      accessibilityLabel={category.name + ', ' + count + ' deals nearby'}
      style={{ width }}
    >
      <Animated.View style={[styles.lift, liftStyle]}>
        <View ref={box} style={styles.tile}>
          <Icon name={categoryIcon(category.icon)} size={26} color={theme.tile.icon} strokeWidth={1.7} />
          <Text style={styles.label} numberOfLines={1}>
            {category.name}
          </Text>
          {count > 0 ? (
            <View style={styles.count}>
              <RollingNumber value={count} style={styles.countText} />
            </View>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Rounded to match the tile, or the hover shadow draws square corners on web.
  lift: {
    borderRadius: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  tile: {
    height: 80,
    borderRadius: 18,
    backgroundColor: theme.tile.bg,
    borderWidth: 1,
    borderColor: theme.tile.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  label: {
    fontFamily: font.medium,
    fontSize: 12,
    color: theme.tile.label,
  },
  count: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 20,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: theme.tile.count,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontFamily: font.bold,
    fontSize: 10,
    lineHeight: 14,
    color: theme.tile.onCount,
    fontVariant: ['tabular-nums'],
  },
});
