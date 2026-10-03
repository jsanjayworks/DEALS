/**
 * A number that rolls to its new value digit by digit, like the wheels of a
 * combination lock, instead of swapping in place.
 *
 * Each digit is a column of 0-9 clipped to one character's height and slid to
 * its value. Digits roll in a light stagger from the right, so 9 → 14 reads as
 * the wheels turning rather than a flash. A digit that appears or disappears
 * (9 → 10) fades in or out with its column.
 */

import { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const DURATION = 680;
const STAGGER = 70;

export interface RollingNumberProps {
  value: number;
  /** Text style for the digits. fontSize and lineHeight set the wheel size. */
  style: StyleProp<TextStyle>;
  /** Shown after the number, not animated, e.g. " deals". */
  suffix?: string;
}

export function RollingNumber({ value, style, suffix }: RollingNumberProps) {
  const flat = StyleSheet.flatten(style) ?? {};
  const fontSize = flat.fontSize ?? 14;
  const lineHeight = flat.lineHeight ?? Math.round(fontSize * 1.25);
  const digits = String(Math.max(0, Math.round(value))).split('');

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="text"
      accessibilityLabel={String(value) + (suffix ?? '')}
    >
      {digits.map((d, i) => (
        // Keyed from the right, so the ones column stays the ones column as
        // the number grows or shrinks.
        <Wheel
          key={digits.length - i}
          digit={Number(d)}
          height={lineHeight}
          delay={(digits.length - 1 - i) * STAGGER}
          style={[style, { lineHeight, height: lineHeight }]}
        />
      ))}
      {suffix ? <Text style={[style, { lineHeight }]}>{suffix}</Text> : null}
    </View>
  );
}

function Wheel({
  digit,
  height,
  delay,
  style,
}: {
  digit: number;
  height: number;
  delay: number;
  style: StyleProp<TextStyle>;
}) {
  const y = useSharedValue(-digit * height);

  useEffect(() => {
    y.set(withDelay(delay, withTiming(-digit * height, { duration: DURATION, easing: Easing.out(Easing.cubic) })));
  }, [digit, height, delay, y]);

  const roll = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(160)}
      style={[styles.window, { height }]}
    >
      <Animated.View style={roll}>
        {DIGITS.map((n) => (
          <Text key={n} style={style}>
            {n}
          </Text>
        ))}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  window: {
    overflow: 'hidden',
  },
});
