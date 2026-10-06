/**
 * Focus rings on the web build.
 *
 * Browsers draw an outline round whatever has focus. After a mouse click or a
 * tap that box is noise (it showed as an orange rectangle round a tab), but a
 * keyboard user needs it to see where they are. So the page tracks how the
 * person last interacted: pointer input hides the outline, keyboard input
 * shows a gold ring, clear of the element's edge: gold shows on the white
 * pages and on the navy headers alike.
 *
 * :focus-visible alone is not enough here: React Native Web focuses elements
 * from script during navigation, and Chrome then sometimes treats a click as
 * keyboard focus.
 */

import { Platform } from 'react-native';
import { color } from '../theme/tokens';

let installed = false;

export function installFocusRing(): void {
  if (installed || Platform.OS !== 'web' || typeof document === 'undefined') return;
  installed = true;

  const root = document.documentElement;
  root.dataset.input = 'pointer';

  const style = document.createElement('style');
  style.textContent = `
    html[data-input="pointer"] *:focus { outline: none !important; }
    html[data-input="keyboard"] *:focus-visible {
      outline: 3px solid ${color.cta} !important;
      outline-offset: 2px;
      border-radius: 12px;
    }
  `;
  document.head.appendChild(style);

  const pointer = () => {
    root.dataset.input = 'pointer';
  };
  const keyboard = (e: KeyboardEvent) => {
    // Only keys that move focus; typing into a field is not navigation.
    if (e.key === 'Tab' || e.key.startsWith('Arrow') || e.key === 'Enter' || e.key === ' ') {
      root.dataset.input = 'keyboard';
    }
  };
  window.addEventListener('pointerdown', pointer, true);
  window.addEventListener('keydown', keyboard, true);
}
