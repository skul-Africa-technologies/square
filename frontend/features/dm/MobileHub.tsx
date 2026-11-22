"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toDisplayUsername, getInitials } from "@square/shared";
import { relativeTime, useNow } from "@/lib/time";
import { PresenceDot } from "@/components/shell/PresenceDot";
import { CommandPalette } from "@/components/shell/CommandPalette";
import clsx from "clsx";

export function MobileHub() {
  const qc = useQueryClient();
  const now = useNow();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api.me(), staleTime: 30_000 });
  const { data, isLoading } = useQuery({ queryKey: ["conversations"], queryFn: () => api.listConversations(), staleTime: 10_000, refetchInterval: 20_000 }); // PROPOSED
  const items = data || [];
  const recent = items.filter(c => !c.blocked).slice(0, 6);
  const firstUnread = items.findIndex(c => c.unreadCount > 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(true); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function markAllRead() {
    for (const c of items) if (c.unreadCount > 0) await api.markRead(c.id); // PROPOSED
    await qc.invalidateQueries({ queryKey: ["conversations"] });
    await qc.invalidateQueries({ queryKey: ["unread"] });
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-bg-2 px-4 py-2">
        <h1 className="flex-1 font-heading text-base font-semibold">Messages</h1>
        <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Search" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </button>
        <button type="button" onClick={() => setPaletteOpen(true)} className="rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-surface hover:text-text">New message</button>
        <button type="button" onClick={() => setPaletteOpen(true)} aria-label="New message" className="flex h-9 w-9 items-center justify-center rounded-lg bg-lime text-bg hover:bg-lime-hover">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </header>

      <div className="flex-1 px-4 pb-24 pt-3">
        {recent.length > 0 && (
          <section aria-label="Recent conversations" className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Recent</h2>
              {firstUnread >= 0 && <button type="button" onClick={markAllRead} className="text-[11px] text-lime hover:underline">Mark all read</button>}
            </div>
            <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
              {recent.map(c => (
                <Link key={c.id} href={`/dm/${c.id}`} prefetch={false} className="w-[76px] shrink-0 text-center">
                  <span className="relative mx-auto block h-14 w-14">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-hi text-sm font-semibold">{getInitials(c.participant.username)}</span>
                    <PresenceDot status={c.presence} className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5" />
                    {c.unreadCount > 0 && <span className="absolute -right-1 top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-strong px-1 text-[10px] font-semibold text-bg">{c.unreadCount > 99 ? "99+" : c.unreadCount}</span>}
                  </span>
                  <span className="mt-1 block truncate text-[11px] text-muted">{toDisplayUsername(c.participant.username)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section aria-label="Conversations">
          <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Direct Messages</h2>
          {isLoading && <p className="py-3 text-sm text-muted">Loading…</p>}
          <div className="divide-y divide-border/60">
            {items.map((c, i) => {
              const unread = c.unreadCount > 0;
              const highlight = i === firstUnread;
              return (
                <Link key={c.id} href={`/dm/${c.id}`} prefetch={false} className={clsx("flex min-h-[56px] items-center gap-3 py-2", highlight && "rounded-lg bg-surface/60 px-2")}>
                  <span className="relative shrink-0">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-hi text-[11px] font-semibold">{getInitials(c.participant.username)}</span>
                    <PresenceDot status={c.presence} className="absolute -bottom-0.5 -right-0.5" />
                    {unread && <span aria-hidden="true" className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-blue-strong" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={clsx("truncate text-sm", unread ? "font-semibold" : "text-text/90")}>{toDisplayUsername(c.participant.username)}</span>
                      <span className="shrink-0 text-[10px] text-muted">{relativeTime(c.lastMessageAt, now)}</span>
                    </span>
                    <span className={clsx("block truncate text-xs", unread ? "text-text/80" : "text-muted")}>{c.lastMessagePreview || c.lastMessage || "No messages yet"}</span>
                  </span>
                  {unread && <span aria-label={`${c.unreadCount} unread`} className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-blue-strong px-1 text-[10px] font-semibold text-bg">{c.unreadCount > 99 ? "99+" : c.unreadCount}</span>}
                  {Boolean(c.mentionCount) && <span aria-label={`${c.mentionCount} direct mentions`} className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-mention px-1 text-[10px] font-semibold text-bg">{c.mentionCount! > 99 ? "99+" : c.mentionCount}</span>}
                </Link>
              );
            })}
            {!isLoading && items.length === 0 && <p className="py-6 text-center text-sm text-muted">No conversations yet.</p>}
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 z-20 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        {userOpen && (
          <div role="menu" className="mb-2 rounded-xl border bg-surface p-1 shadow-xl">
            <Link href={`/u/${me?.username || "amaka-eze"}`} prefetch={false} role="menuitem" className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-hi">Profile</Link>
            <Link href="/settings" prefetch={false} role="menuitem" className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-hi">Settings</Link>
          </div>
        )}
        <div className="flex items-center gap-2 rounded-full border bg-bg/95 p-1.5 pl-2 shadow-lg backdrop-blur">
          <span className="relative">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-hi text-xs font-semibold">{me ? getInitials(me.username) : "??"}</span>
            <PresenceDot status="online" className="absolute -bottom-0.5 -right-0.5" />
          </span>
          <button type="button" onClick={() => setUserOpen(v => !v)} aria-expanded={userOpen} className="flex min-w-0 flex-1 items-center gap-1 text-left">
            <span className="truncate text-sm text-name-self">{me ? toDisplayUsername(me.username) : "…"}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={clsx("shrink-0 text-muted transition", userOpen && "rotate-180")} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          <button type="button" disabled aria-label="Notifications coming soon" title="Coming soon" className="flex h-8 w-8 items-center justify-center rounded-full text-muted/60">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>
          </button>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
