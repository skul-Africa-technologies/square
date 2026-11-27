"use client";

import { Badge, getUnreadBadgeState } from "@/components/ui/badge";

export type { UnreadBadgeState } from "@/components/ui/badge";
export { getUnreadBadgeState };

/** Back-compat wrapper around the shared <Badge> (keeps data-testid/state). */
export function UnreadBadge({
  unread,
  mentions,
  size = "desktop",
  className,
  ringClassName = "ring-bg",
}: {
  unread: number;
  mentions: number;
  size?: "desktop" | "mobile";
  className?: string;
  ringClassName?: string;
}) {
  return (
    <Badge
      unread={unread}
      mentions={mentions}
      size={size}
      ringClassName={ringClassName}
      className={className}
      testId="unread-badge"
    />
  );
}