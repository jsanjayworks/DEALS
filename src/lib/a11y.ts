/**
 * Accessibility state that reaches screen readers on every platform.
 *
 * React Native Web no longer reads `accessibilityState`; it reads the ARIA
 * props, which React Native also understands on phones. Tabs, radios,
 * switches and checkboxes use `aria-selected` / `aria-checked` directly.
 *
 * A toggle button (a filter chip, Save) is the one gap: ARIA spells it
 * `aria-pressed`, which React Native Web supports but React Native's types do
 * not list. This helper gives web the right attribute and phones the
 * equivalent state.
 */

import { Platform } from 'react-native';

export function pressedProps(on: boolean): object {
  return Platform.OS === 'web' ? { 'aria-pressed': on } : { accessibilityState: { selected: on } };
}
