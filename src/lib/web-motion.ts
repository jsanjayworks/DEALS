/**
 * Small touches on the web build that React Native styles cannot express:
 * anything tappable shows a hand cursor, and its colour, border, shadow and
 * opacity change smoothly instead of snapping. Transforms are left alone
 * here, since cards animate those themselves (useHoverPress). People who ask
 * their device for less motion get no easing at all.
 */

import { Platform } from 'react-native';

let installed = false;

export function installWebMotion(): void {
  if (installed || Platform.OS !== 'web' || typeof document === 'undefined') return;
  installed = true;

  const style = document.createElement('style');
  style.textContent = `
    [role="button"], [role="link"], [role="switch"], [role="tab"], [role="checkbox"], [role="radio"] {
      cursor: pointer;
      transition: background-color .18s ease, border-color .18s ease, box-shadow .22s ease, opacity .18s ease, filter .18s ease;
    }
    [aria-disabled="true"] { cursor: default; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition: none !important; animation-duration: .01ms !important; }
    }
  `;
  document.head.appendChild(style);
}

/** For one element that should also ease its size or lift (web only; ignored elsewhere). */
export const EASE_ALL = Platform.select({
  web: {
    transitionProperty: 'transform, box-shadow, background-color, border-color, opacity',
    transitionDuration: '180ms',
    transitionTimingFunction: 'cubic-bezier(.22,1,.36,1)',
  } as object,
  default: {},
});
