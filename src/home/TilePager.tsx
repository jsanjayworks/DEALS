/**
 * A swipeable stack of pages inside one bento tile: the spotlight photos, the
 * deals ending soonest. Swipe (or tap a dot) to pick one, tap the page to
 * open it.
 *
 * It turns over on its own every few seconds so the tile feels live, but
 * stops for a while after someone swipes or taps a dot: nobody wants the
 * deal they were reading to slide away.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

const TURN_MS = 4500;
/** After someone swipes or taps a dot, leave the tile alone this long. */
const HOLD_MS = 10_000;

export function TilePager<T>({
  items,
  keyOf,
  renderPage,
  dotTone = 'light',
  label,
}: {
  items: T[];
  keyOf: (item: T) => string;
  renderPage: (item: T, index: number) => ReactNode;
  /** Dots over a photo are light; over a white tile they are dark. */
  dotTone?: 'light' | 'dark';
  /** What the pages are, for screen readers ("Spotlight deals"). */
  label: string;
}) {
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const heldUntil = useRef(0);
  const count = items.length;

  const goTo = (i: number, animated = true) => {
    scroller.current?.scrollTo({ x: i * width, animated });
    setIndex(i);
  };

  useEffect(() => {
    if (count <= 1 || width === 0) return;
    const id = setInterval(() => {
      if (Date.now() < heldUntil.current) return;
      setIndex((i) => {
        const next = (i + 1) % count;
        scroller.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, TURN_MS);
    return () => clearInterval(id);
  }, [count, width]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width === 0) return;
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };
  const hold = () => {
    heldUntil.current = Date.now() + HOLD_MS;
  };

  return (
    <View
      style={styles.fill}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      accessibilityLabel={label + ', ' + (index + 1) + ' of ' + count}
    >
      {width > 0 ? (
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={hold}
          onMomentumScrollEnd={settle}
          // Web has no momentum events; settle on every scroll there instead.
          onScroll={settle}
          scrollEventThrottle={64}
          style={styles.fill}
        >
          {items.map((item, i) => (
            <View key={keyOf(item)} style={{ width, height: '100%' }}>
              {renderPage(item, i)}
            </View>
          ))}
        </ScrollView>
      ) : null}

      {count > 1 ? (
        <View style={styles.dots}>
          {items.map((item, i) => (
            <Pressable
              key={keyOf(item)}
              onPress={() => {
                hold();
                goTo(i);
              }}
              accessibilityRole="button"
              accessibilityLabel={'Show ' + (i + 1) + ' of ' + count}
              hitSlop={6}
            >
              <View
                style={[
                  styles.dot,
                  dotTone === 'light' ? styles.dotLight : styles.dotDark,
                  i === index && styles.dotOn,
                  i === index && (dotTone === 'light' ? styles.dotOnLight : styles.dotOnDark),
                ]}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  dots: {
    position: 'absolute',
    left: 14,
    bottom: 10,
    flexDirection: 'row',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotLight: {
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  dotDark: {
    backgroundColor: 'rgba(15,27,45,0.18)',
  },
  dotOn: {
    width: 16,
  },
  dotOnLight: {
    backgroundColor: '#FFFFFF',
  },
  dotOnDark: {
    backgroundColor: 'rgba(15,27,45,0.7)',
  },
});
