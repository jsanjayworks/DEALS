/**
 * One layout system for phone, tablet and desktop web, so there is no
 * separate website to build. Screens ask how wide they are and adapt: rails
 * become grids, content stops growing past a readable width, sheets become
 * centred dialogs.
 *
 *   compact   under 640    phones, the design's native size
 *   medium    under 1024   large phones in landscape, tablets, narrow windows
 *   expanded  1024 and up  laptops and desktops
 */

import type { ReactNode } from 'react';
import { useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

export type Breakpoint = 'compact' | 'medium' | 'expanded';

/** Past this, lines get too long to read and cards too far apart to compare. */
export const MAX_CONTENT_WIDTH = 1200;

export interface Layout {
  width: number;
  height: number;
  bp: Breakpoint;
  isCompact: boolean;
  isExpanded: boolean;
  /** Horizontal padding at the content edge. */
  gutter: number;
  /** Usable width inside the gutters, capped at MAX_CONTENT_WIDTH. */
  contentWidth: number;
  /** Columns for full-width list cards. */
  listColumns: number;
  /** Columns for image cards in a grid. */
  gridColumns: number;
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  const bp: Breakpoint = width >= 1024 ? 'expanded' : width >= 640 ? 'medium' : 'compact';
  const gutter = bp === 'compact' ? 20 : bp === 'medium' ? 28 : 40;
  const contentWidth = Math.min(width, MAX_CONTENT_WIDTH) - gutter * 2;
  return {
    width,
    height,
    bp,
    isCompact: bp === 'compact',
    isExpanded: bp === 'expanded',
    gutter,
    contentWidth,
    listColumns: bp === 'compact' ? 1 : bp === 'medium' ? 2 : 3,
    gridColumns: bp === 'compact' ? 2 : bp === 'medium' ? 3 : 4,
  };
}

/** Width of one cell when `columns` cells and their gaps share `total`. */
export function cellWidth(total: number, columns: number, gap: number): number {
  return Math.floor((total - gap * (columns - 1)) / columns);
}

/** Centres content and caps its width; adds the gutter on both sides. */
export function Container({
  children,
  style,
  flush,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Skip the gutter, for rails that scroll edge to edge. */
  flush?: boolean;
}) {
  const { gutter } = useLayout();
  return (
    <View
      style={[
        { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
        !flush && { paddingHorizontal: gutter },
        style,
      ]}
    >
      {children}
    </View>
  );
}
