/**
 * Icon set, ported path-for-path from the `I` component in
 * docs/design/figma-make/ui.tsx.
 *
 * Same 24x24 viewBox, same 1.6 stroke, same round caps and joins, so the icons
 * are identical to the design rather than approximated from a library. Adding
 * one means adding a path here, not a dependency.
 */

import Svg, { Path } from 'react-native-svg';
import { color } from '../theme/tokens';

export const ICON_PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4-4',
  ticket:
    'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4zm10-2v12',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zm4 4h4',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 1 1 14 0C19 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  spark: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  back: 'M15 5l-7 7 7 7',
  chev: 'M9 6l6 6-6 6',
  down: 'M6 9l6 6 6-6',
  x: 'M6 6l12 12M18 6 6 18',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z',
  share: 'M12 4v11m-4-7 4-4 4 4M5 14v5h14v-5',
  phone:
    'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z',
  chat: 'M4 5h16v11H9l-5 4z',
  check: 'M5 12.5 10 17 19 7',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z',
  filter: 'M4 6h16M7 12h10M10 18h4',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zm0 0v14m6-12v14',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  clock: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  shield: 'M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6z',
  plus: 'M12 5v14M5 12h14',
  grid: 'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H3',
  store: 'M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6',
  upload: 'M12 16V4m-4 4 4-4 4 4M5 20h14',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  wifi: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4-2.3M19 12.5a10 10 0 0 0-2.5-1.8M12 20h.01',
  qr: 'M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h2v2h-2zm4 0h2v2h-2zm-4 4h2v2h-2zm4 0h2v2h-2z',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  /** Fills the shape instead of stroking it. Used for the rating star. */
  filled?: boolean;
  strokeWidth?: number;
}

export function Icon({
  name,
  size = 20,
  color: tint = color.text,
  filled = false,
  strokeWidth = 1.6,
}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={ICON_PATHS[name]}
        fill={filled ? tint : 'none'}
        stroke={tint}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
