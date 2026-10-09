/**
 * Bottom sheet: the claim flow, filters and the locality picker.
 *
 * Built on React Native's Modal rather than a formSheet route because every
 * use here shares live state with the screen underneath (filters being edited,
 * a quantity being chosen), and Modal behaves the same on iOS, Android and web.
 * The backdrop fades while the panel slides, as the design's 320ms sheet does,
 * and both play backwards on the way out: the Modal stays up until the panel
 * has gone, so closing is as smooth as opening. One progress value drives
 * both (layout exit animations do not run inside a web Modal).
 */

import { useEffect, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, color, motion, radius, shadow, space, type } from '../theme/tokens';
import { Icon } from './Icon';
import { useLayout } from '../ui/layout';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Pinned under the scrolling body, above the home indicator. */
  footer?: ReactNode;
}

/** How long a sheet takes to leave once closed. */
export const SHEET_CLOSE_MS = motion.sheet - 60;

/**
 * For a sheet whose body is mounted only while open, so every opening starts
 * afresh: keeps it mounted while it slides away, and gives each opening its
 * own key.
 */
export function useSheetPresence(visible: boolean): { shown: boolean; opening: number } {
  const [shown, setShown] = useState(visible);
  const [opening, setOpening] = useState(0);
  const [was, setWas] = useState(visible);
  if (visible !== was) {
    setWas(visible);
    if (visible) {
      setShown(true);
      setOpening((n) => n + 1);
    }
  }
  useEffect(() => {
    if (visible || !shown) return;
    const timer = setTimeout(() => setShown(false), SHEET_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [visible, shown]);
  return { shown, opening };
}

export function Sheet({ visible, onClose, title, children, footer }: SheetProps) {
  const insets = useSafeAreaInsets();
  // On a phone it rises from the bottom edge; on a wide screen a full-width
  // sheet is a long way to reach, so it becomes a centred dialog.
  const { isCompact } = useLayout();
  const reduced = useReducedMotion();
  // Up while open, and for the length of the closing animation after.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  // 0 is away, 1 is in place; the panel's height says how far "away" is.
  const progress = useSharedValue(0);
  const height = useSharedValue(800);

  useEffect(() => {
    if (visible) {
      progress.set(reduced ? 1 : withTiming(1, { duration: motion.sheet, easing: EASE_OUT }));
      return;
    }
    if (!mounted) return;
    progress.set(reduced ? 0 : withTiming(0, { duration: CLOSE_MS, easing: EASE_IN }));
    const timer = setTimeout(() => setMounted(false), reduced ? 0 : SHEET_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [visible, mounted, reduced, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const panelStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return isCompact
      ? { transform: [{ translateY: interpolate(p, [0, 1], [height.get(), 0]) }] }
      : { opacity: interpolate(p, [0, 0.5, 1], [0, 1, 1]), transform: [{ scale: interpolate(p, [0, 1], [0.94, 1]) }] };
  });

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <KeyboardAvoidingView
        style={[styles.root, !isCompact && styles.rootCentred]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {mounted ? (
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <Pressable
              style={[styles.backdrop, Platform.OS === 'web' && (WEB_BLUR as object)]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
            />
          </Animated.View>
        ) : null}

        {mounted ? (
          <Animated.View
            onLayout={(e) => height.set(e.nativeEvent.layout.height + 40)}
            style={[
              panelStyle,
              styles.panel,
              isCompact
                ? { paddingBottom: Math.max(insets.bottom, space.lg) }
                : [styles.dialog, { paddingBottom: space.lg }],
            ]}
            accessibilityViewIsModal
          >
            {isCompact ? <View style={styles.grabber} /> : <View style={{ height: space.sm }} />}
            {title ? (
              <View style={styles.head}>
                <Text style={styles.title} accessibilityRole="header">
                  {title}
                </Text>
                <Pressable
                  onPress={onClose}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  style={styles.close}
                >
                  <Icon name="x" size={20} color={color.textSecondary} />
                </Pressable>
              </View>
            ) : null}

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>

            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Animated.View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
const EASE_IN = Easing.bezier(0.4, 0, 1, 1);
/** Leaving is a little quicker than arriving, as it feels in native sheets. */
const CLOSE_MS = SHEET_CLOSE_MS - 20;

/** A soft frost behind the panel, where the browser can do it. */
const WEB_BLUR = { backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' };

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  rootCentred: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.xxl,
  },
  dialog: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '85%',
    borderRadius: radius.xxl,
  },
  backdrop: {
    flex: 1,
    backgroundColor: alpha(color.text, 0.45),
  },
  panel: {
    maxHeight: '90%',
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    ...shadow.sheet,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    marginTop: space.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  title: {
    ...type.h2,
    color: color.text,
    flex: 1,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surfaceSoftAlt,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  footer: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
});
