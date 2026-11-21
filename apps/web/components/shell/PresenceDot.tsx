"use client";

import clsx from "clsx";
import type { PresenceStatus } from "@square/shared";

export function PresenceDot({ status, className, label = true }: { status?: PresenceStatus; className?: string; label?: boolean }) {
  const online = status === "online";
  return (
    <span
      title={online ? "Online" : "Offline"}
      className={clsx("block h-3 w-3 rounded-full border-2 border-bg-2", online ? "bg-blue-strong" : "bg-muted", className)}
      aria-hidden={label ? undefined : true}
    >
      {label && <span className="sr-only">{online ? "Online" : "Offline"}</span>}
    </span>
  );
}
