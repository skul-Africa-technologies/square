export const STRIP_WIDTH_FULL = 72;
export const STRIP_EXPAND_GESTURE = true;
export const STRIP_ANIMATION_MS = 220;

/**
 * Room screens hide the community strip (content uses full width) and open it
 * on demand. Hub/list screens keep the strip visible. Decided from the route so
 * no page has to opt in.
 */
export function isRoomRoute(pathname: string): boolean {
  // DM thread: /dm/[conversationId] (but not the /dm list)
  if (/^\/dm\/[^/]+/.test(pathname)) return true;
  // Asset page and its item/detail pages: /c/[community]/[asset](/[itemId])
  if (/^\/c\/[^/]+\/[^/]+/.test(pathname)) return true;
  return false;
}