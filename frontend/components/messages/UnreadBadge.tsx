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

export function getUnreadBadgeState(unread: number, mentions: number): UnreadBadgeState | null {
  const total = Math.max(0, Math.floor(unread));
  const tagged = Math.min(total, Math.max(0, Math.floor(mentions)));
  if (!total) return null;
  if (!tagged) return { kind: "count", count: capped(total) };
  if (tagged === total) return { kind: "mentions", ...(tagged > 1 ? { count: capped(tagged) } : {}) };
  return { kind: "mixed", count: capped(total) };
}

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
  const state = getUnreadBadgeState(unread, mentions);
  if (!state) return null;

  const mobile = size === "mobile";
  const ariaLabel = state.kind === "count"
    ? `${unread} unread ${unread === 1 ? "message" : "messages"}`
    : state.kind === "mentions"
      ? `${state.count || "1"} ${state.count ? "mentions" : "mention"}`
      : `${state.count} unread messages, including ${mentions} ${mentions === 1 ? "mention" : "mentions"}`;

  return (
    <span
      aria-label={ariaLabel}
      data-testid="unread-badge"
      data-state={state.kind}
      className={clsx(
        "inline-flex min-w-5 shrink-0 items-center justify-center gap-1 rounded-full bg-blue-strong px-[7px] text-[12px] font-bold leading-none text-[#0B0D0B] ring-1",
        mobile ? "h-[22px]" : "h-5",
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
