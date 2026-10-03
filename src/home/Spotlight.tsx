/**
 * Spotlight: the photo-led carousel at the top of Home, District-style.
 *
 * It advances on its own every few seconds and stops while someone is
 * swiping. The active deal is reported upward so Home can paint a blurred copy
 * of its photo behind the whole hero, which is what makes the top of the page
 * feel alive rather than a flat colour.
 */

import { memo, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import type { DealCardModel } from '../data/types';
import { DealCard } from '../components';
import { color } from '../theme/tokens';

const GAP = 12;
const ADVANCE_MS = 4500;
/** After a manual swipe, wait this long before auto-advancing again. */
const RESUME_MS = 8000;

export const Spotlight = memo(SpotlightCarousel);

function SpotlightCarousel({
  deals,
  width,
  gutter,
  perPage,
  onOpen,
  onActiveChange,
}: {
  deals: DealCardModel[];
  /** Content width inside the gutters. */
  width: number;
  gutter: number;
  /** Cards fully visible at once: 1 on a phone (with a peek), 2 on wide screens. */
  perPage: number;
  onOpen: (d: DealCardModel) => void;
  onActiveChange?: (d: DealCardModel) => void;
}) {
  const scroller = useRef<ScrollView>(null);
  const [active, setActive] = useState(0);
  const pausedUntil = useRef(0);

  // A phone shows one card and a sliver of the next, so it reads as swipeable.
  const cardWidth =
    perPage === 1 ? Math.round(width * 0.9) : Math.floor((width - GAP * (perPage - 1)) / perPage);
  const interval = cardWidth + GAP;
  const pages = Math.max(1, deals.length - (perPage - 1));

  useEffect(() => {
    if (deals.length <= perPage) return;
    const id = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      setActive((i) => {
        const next = (i + 1) % pages;
        scroller.current?.scrollTo({ x: next * interval, animated: true });
        return next;
      });
    }, ADVANCE_MS);
    return () => clearInterval(id);
  }, [deals.length, perPage, pages, interval]);

  useEffect(() => {
    const d = deals[active];
    if (d) onActiveChange?.(d);
  }, [active, deals, onActiveChange]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / interval);
    if (i !== active && i >= 0 && i < pages) setActive(i);
  };

  if (deals.length === 0) return null;

  return (
    <View>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={interval}
        decelerationRate="fast"
        disableIntervalMomentum
        onScroll={onScroll}
        scrollEventThrottle={32}
        onScrollBeginDrag={() => {
          pausedUntil.current = Date.now() + RESUME_MS;
        }}
        contentContainerStyle={{ paddingHorizontal: gutter, gap: GAP }}
      >
        {deals.map((d) => (
          <DealCard
            key={d.id}
            deal={d}
            variant="spotlight"
            style={{ width: cardWidth }}
            onPress={() => onOpen(d)}
          />
        ))}
      </ScrollView>

      {pages > 1 ? (
        <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {Array.from({ length: pages }, (_, i) => (
            <Dot key={i} on={i === active} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Dot({ on }: { on: boolean }) {
  const style = useAnimatedStyle(() => ({
    width: withTiming(on ? 22 : 6, { duration: 260 }),
    backgroundColor: on ? color.brand : color.surfaceSoft,
  }));
  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
