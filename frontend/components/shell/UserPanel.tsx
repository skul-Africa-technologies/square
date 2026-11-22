"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toDisplayUsername, getInitials } from "@square/shared";
import { PresenceDot } from "./PresenceDot";
import clsx from "clsx";
import { clearSession } from "@/lib/session";
import { useRouter } from "next/navigation";

export function UserPanel({ onOpenProfile, className }: { onOpenProfile?: () => void; className?: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api.me(), staleTime: 30_000 });
  const [open, setOpen] = useState(false);
  const [appearOffline, setAppearOffline] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const status = appearOffline ? "hidden" : "online";
  async function choose(mode: "online" | "offline") {
    setOpen(false);
    setAppearOffline(mode === "offline");
    await api.setPresence(mode); // PROPOSED
    await qc.invalidateQueries({ queryKey: ["presence"] });
  }

  return (
    <div ref={ref} className={clsx("relative border-t bg-bg-2 p-2", className)}>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setOpen(v => !v)} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-2 text-left hover:bg-surface" aria-haspopup="menu" aria-expanded={open}>
          <span className="relative">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-hi text-xs font-semibold">{me ? getInitials(me.username) : "??"}</span>
            <PresenceDot status={status} className="absolute -bottom-0.5 -right-0.5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm text-name-self">{me ? toDisplayUsername(me.username) : "…"}</span>
          </span>
        </button>
        <Link href="/settings" prefetch={false} title="Settings" aria-label="Settings" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a7.6 7.6 0 0 0 .1-1 7.6 7.6 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7.7 7.7 0 0 0-1.7-1L15 4h-4l-.3 2.6a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 13a7.6 7.6 0 0 0-.1 1 7.6 7.6 0 0 0 .1 1l-2 1.6 2 3.4 2.4-1a7.7 7.7 0 0 0 1.7 1L11 20h4l.3-2.6a7.7 7.7 0 0 0 1.7-1l2.4 1 2-3.4Z" /></svg>
        </Link>
      </div>
      {open && (
        <div role="menu" className="absolute bottom-full left-2 right-2 mb-2 rounded-xl border bg-surface p-1 shadow-xl">
          <div className="px-2 py-1.5 text-[11px] uppercase tracking-wide text-muted">Presence</div>
          <button type="button" role="menuitemradio" aria-checked={!appearOffline} onClick={() => choose("online")} className={clsx("flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm", !appearOffline ? "bg-surface-hi" : "hover:bg-surface-hi")}>
            <PresenceDot status="online" /> Online
          </button>
          <button type="button" role="menuitemradio" aria-checked={appearOffline} onClick={() => choose("offline")} className={clsx("flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm", appearOffline ? "bg-surface-hi" : "hover:bg-surface-hi")}>
            <PresenceDot status="offline" /> Appear offline
          </button>
          <div className="my-1 h-px bg-border" />
          <Link href="/settings" prefetch={false} role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-surface-hi">Settings</Link>
          {onOpenProfile && <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpenProfile(); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-surface-hi">Profile</button>}
          <button type="button" role="menuitem" onClick={async () => { setOpen(false); await clearSession(); router.replace("/login"); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-surface-hi">Log out</button>
        </div>
      )}
    </div>
  );
}
