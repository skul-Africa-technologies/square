/**
 * Single source of truth for author name color classes.
 * --name-other (#B6FF3B, lime) vs --name-self (#7DD3FC, sky blue) defined in app/globals.css.
 * Contrast on --surface #202720 (message background context): other ~11.6:1, self ~8.4:1 (>= 4.5:1 WCAG AA).
 */
export function getNameColor(authorId: string | undefined, currentUserId: string | undefined): string {
  if (authorId && currentUserId && authorId === currentUserId) return "text-name-self";
  return "text-name-other";
}

export function isSelf(authorId: string | undefined, currentUserId: string | undefined): boolean {
  return Boolean(authorId && currentUserId && authorId === currentUserId);
}
