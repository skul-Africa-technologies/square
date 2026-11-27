"use client";

import { AtSign } from "lucide-react";
import clsx from "clsx";

export type UnreadBadgeState =
  | { kind: "count"; count: string }
  | { kind: "mentions"; count?: string }
  | { kind: "mixed"; count: string };

function capped(value: number) {
  return value > 99 ? "99+" : String(value);
}

/** Shared mention rule: @ only, @ + number, or a plain count. */
export function getUnreadBadgeState(unread: number, mentions: number): UnreadBadgeState | null {
  const total = Math.max(0, Math.floor(unread));
  const tagged = Math.min(total, Math.max(0, Math.floor(mentions)));
  if (!total) return null;
  if (!tagged) return { kind: "count", count: capped(total) };
  if (tagged === total) return { kind: "mentions", ...(tagged > 1 ? { count: capped(tagged) } : {}) };
  return { kind: "mixed", count: capped(total) };
}

/**
 * One badge for the whole app. Min 18x18, radius 9, blue #38BDF8 with dark text
 * and a 2px surface ring. Grows horizontally for 99+/NEW; never truncated.
 */
export function Badge({
  unread,
  mentions = 0,
  size = "desktop",
  ringClassName = "ring-bg",
  className,
  testId,
}: {
  unread: number;
  mentions?: number;
  size?: "desktop" | "mobile";
  ringClassName?: string;
  className?: string;
  testId?: string;
}) {
  const state = getUnreadBadgeState(unread, mentions);
  if (!state) return null;
  const mobile = size === "mobile";
  const ariaLabel =
    state.kind === "count"
      ? `${unread} unread ${unread === 1 ? "message" : "messages"}`
      : state.kind === "mentions"
        ? `${state.count || "1"} ${state.count ? "mentions" : "mention"}`
        : `${state.count} unread messages, including ${mentions} ${mentions === 1 ? "mention" : "mentions"}`;

  return (
    <span
      aria-label={ariaLabel}
      data-testid={testId}
      data-state={state.kind}
      className={clsx(
        "inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center gap-1 rounded-[9px] bg-[#38BDF8] px-[5px] text-[11px] font-bold leading-none tabular-nums text-[#0B0D0B] ring-2",
        ringClassName,
        className,
      )}
    >
      {state.kind !== "count" && <AtSign aria-hidden="true" className="h-3 w-3 shrink-0" strokeWidth={2.5} />}
      {state.kind === "mentions" ? state.count || null : state.count}
      {mobile && state.kind !== "mentions" && <span className="text-[9px] font-bold">NEW</span>}
    </span>
  );
}

/**
 * Position helper: offsets a badge 2px outside the top-right corner of an avatar.
 * Put it inside a `position: relative` avatar wrapper.
 */
export function BadgeCorner({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={clsx("badge-corner", className)}>{children}</span>;
}