/**
 * Bottom sheet: the claim flow, filters and the locality picker.
 *
 * Built on React Native's Modal rather than a formSheet route because every
 * use here shares live state with the screen underneath (filters being edited,
 * a quantity being chosen), and Modal behaves the same on iOS, Android and web.
 * The backdrop fades while the panel slides, as the design's 320ms sheet does.
 */

import type { ReactNode } from 'react';
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
import Animated, { FadeIn, SlideInDown, ZoomIn } from 'react-native-reanimated';
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

export function Sheet({ visible, onClose, title, children, footer }: SheetProps) {
  const insets = useSafeAreaInsets();
  // On a phone it rises from the bottom edge; on a wide screen a full-width
  // sheet is a long way to reach, so it becomes a centred dialog.
  const { isCompact } = useLayout();

  return (
    <Modal
      visible={visible}
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
        <Animated.View entering={FadeIn.duration(motion.fade)} style={StyleSheet.absoluteFill}>
          <Pressable
            style={styles.backdrop}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>

        <Animated.View
          entering={
            isCompact ? SlideInDown.duration(motion.sheet) : ZoomIn.duration(motion.sheet).springify().damping(20)
          }
          style={[
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

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
