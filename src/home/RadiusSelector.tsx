/**
 * The "Within" distance selector on the Home hero.
 *
 * One thumb glides between options instead of each pill switching on and off.
 * Its leading edge moves first and the trailing edge follows a beat later, so
 * it stretches toward the new choice and then settles into it.
 *
 * Two details make it feel immediate:
 *
 *   - The glide starts in the press handler, on the shared values, before the
 *     parent hears about the change. The new radius is handed up a couple of
 *     frames later, so the feed reloads in the background while the thumb is
 *     still travelling, and the counts roll as the thumb lands.
 *   - Every label stays readable while the thumb passes over it. The thumb
 *     carries its own copy of the labels in the on-thumb colour, shifted to
 *     line up with the ones underneath, so a label reads light on the track
 *     and dark inside the thumb, even halfway across it.
 */

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { hapticTap } from '../lib/device';
import { font, radius, space, theme, type } from '../theme/tokens';

const LEAD = { duration: 420, easing: Easing.out(Easing.cubic) };
const FOLLOW = { duration: 560, easing: Easing.inOut(Easing.cubic) };
const FOLLOW_DELAY = 110;
/** Long enough for the first frames of the glide to paint before the feed re-renders. */
const HAND_OFF_MS = 32;

interface Option {
  label: string;
  m: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function RadiusSelector({
  options,
  value,
  onChange,
}: {
  options: readonly Option[];
  value: number;
  onChange: (m: number) => void;
}) {
  const [boxes, setBoxes] = useState<Record<number, Box>>({});
  const [track, setTrack] = useState({ w: 0, h: 0 });
  const [pending, setPending] = useState<number | null>(null);
  const left = useSharedValue(0);
  const right = useSharedValue(0);
  const placed = useSharedValue(0);
  const lastIndex = useRef<number | null>(null);
  const settleAt = useRef(0);
  const index = options.findIndex((o) => o.m === value);

  // The parent caught up with the tap: the prop is the truth again.
  if (pending !== null && options[pending]?.m === value) setPending(null);
  const selected = pending ?? index;

  const glide = (from: number, to: number, box: Box) => {
    const toL = box.x;
    const toR = box.x + box.w;
    if (to > from) {
      right.set(withTiming(toR, LEAD));
      left.set(withDelay(FOLLOW_DELAY, withTiming(toL, FOLLOW)));
    } else {
      left.set(withTiming(toL, LEAD));
      right.set(withDelay(FOLLOW_DELAY, withTiming(toR, FOLLOW)));
    }
    settleAt.current = Date.now() + FOLLOW_DELAY + FOLLOW.duration + 20;
  };

  // Changes that did not come from a tap here (e.g. "Show 10km" on an empty
  // feed), first placement, and relayout.
  useEffect(() => {
    const box = boxes[index];
    if (!box) return;
    const from = lastIndex.current;
    if (from === null) {
      left.set(box.x);
      right.set(box.x + box.w);
      placed.set(withTiming(1, { duration: 200 }));
    } else if (from !== index) {
      glide(from, index, box);
    } else if (Date.now() >= settleAt.current) {
      // Same choice, new layout (rotation, resize): no travel to show. Never
      // snap while a glide started by a tap is still running.
      left.set(box.x);
      right.set(box.x + box.w);
    }
    lastIndex.current = index;
    // glide only touches shared values and a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, boxes, left, right, placed]);

  const choose = (i: number) => {
    const box = boxes[i];
    if (i === selected || !box) return;
    hapticTap();
    glide(lastIndex.current ?? i, i, box);
    lastIndex.current = i;
    setPending(i);
    const m = options[i].m;
    setTimeout(() => onChange(m), HAND_OFF_MS);
  };

  const thumb = useAnimatedStyle(() => ({
    opacity: placed.get(),
    left: left.get(),
    width: Math.max(0, right.get() - left.get()),
  }));
  // The labels inside the thumb move against it, so they stay put on screen.
  const inThumb = useAnimatedStyle(() => ({
    transform: [{ translateX: -left.get() }],
  }));

  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Distance">
      <Text style={styles.label}>Within</Text>
      <View style={styles.trackOuter}>
        <View
          style={styles.track}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setTrack((t) => (t.w === width && t.h === height ? t : { w: width, h: height }));
          }}
        >
          {options.map((o, i) => (
            <Pressable
              key={o.m}
              onLayout={(e) => {
                const { x, y, width, height } = e.nativeEvent.layout;
                setBoxes((b) =>
                  b[i]?.x === x && b[i]?.w === width && b[i]?.y === y && b[i]?.h === height
                    ? b
                    : { ...b, [i]: { x, y, w: width, h: height } },
                );
              }}
              onPress={() => choose(i)}
              accessibilityRole="radio"
              aria-checked={i === selected}
              accessibilityLabel={o.label}
              style={styles.pill}
            >
              <Text style={styles.text}>{o.label}</Text>
            </Pressable>
          ))}

          {/* Above the labels so its own copy covers them; touches pass through. */}
          <Animated.View style={[styles.thumb, thumb]} pointerEvents="none">
            <Animated.View style={[styles.thumbLabels, { width: track.w, height: track.h }, inThumb]}>
              {options.map((o, i) => {
                const b = boxes[i];
                if (!b) return null;
                return (
                  <View key={o.m} style={[styles.thumbCell, { left: b.x, top: b.y, width: b.w, height: b.h }]}>
                    <Text style={[styles.text, styles.textOn]}>{o.label}</Text>
                  </View>
                );
              })}
            </Animated.View>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const PAD = 3;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.md,
  },
  label: {
    ...type.captionMedium,
    color: theme.hero.muted,
  },
  // The border sits on an outer shell so the inner track's coordinates are the
  // same ones onLayout reports on every platform (web measures inside borders).
  trackOuter: {
    flex: 1,
    maxWidth: 520,
    borderRadius: radius.pill,
    backgroundColor: theme.heroChip.track,
    borderWidth: 1,
    borderColor: theme.heroChip.border,
  },
  track: {
    flexDirection: 'row',
    padding: PAD,
  },
  thumb: {
    position: 'absolute',
    top: PAD,
    bottom: PAD,
    borderRadius: radius.pill,
    backgroundColor: theme.heroChip.thumb,
    overflow: 'hidden',
  },
  thumbLabels: {
    position: 'absolute',
    top: -PAD,
    left: 0,
  },
  thumbCell: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flex: 1,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: font.medium,
    fontSize: 13,
    color: theme.heroChip.text,
  },
  textOn: {
    fontFamily: font.semibold,
    color: theme.heroChip.onThumb,
  },
});
