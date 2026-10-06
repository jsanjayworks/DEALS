/**
 * Where a page was opened from, so it can grow out of the tile that was
 * tapped. The tile measures itself on press and leaves its rectangle here;
 * the page it opens takes it once on mount. A rectangle older than a second
 * belongs to some other tap and is ignored.
 */

export interface LaunchRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

let pending: { rect: LaunchRect; at: number } | null = null;

export function setLaunchRect(rect: LaunchRect | null): void {
  pending = rect ? { rect, at: Date.now() } : null;
}

export function takeLaunchRect(): LaunchRect | null {
  const p = pending;
  pending = null;
  return p && Date.now() - p.at < 1000 ? p.rect : null;
}
