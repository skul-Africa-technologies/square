"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toDisplayUsername, getInitials } from "@square/shared";
import { relativeTime, useNow } from "@/lib/time";
import { PresenceDot } from "@/components/shell/PresenceDot";
import { UserPanel } from "@/components/shell/UserPanel";
import { CommandPalette } from "@/components/shell/CommandPalette";
import clsx from "clsx";

export function MessagesPanel() {
  const pathname = usePathname();
  const qc = useQueryClient();
  const now = useNow();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useQuery({ queryKey: ["conversations"], queryFn: () => api.listConversations(), staleTime: 10_000, refetchInterval: 20_000 }); // PROPOSED
  const items = data || [];
  const selectedId = pathname.startsWith("/dm/") ? pathname.split("/")[2] : undefined;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(true); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function markRead(id: string) {
    setMenuFor(null);
    await api.markRead(id); // PROPOSED
    await qc.invalidateQueries({ queryKey: ["conversations"] });
    await qc.invalidateQueries({ queryKey: ["unread"] });
  }
  async function mute(id: string, muted: boolean) {
    setMenuFor(null);
    await api.setConversationMuted(id, muted); // PROPOSED
    await qc.invalidateQueries({ queryKey: ["conversations"] });
  }
  async function close(id: string) {
    setMenuFor(null);
    await api.hideConversation(id); // PROPOSED
    await qc.invalidateQueries({ queryKey: ["conversations"] });
    await qc.invalidateQueries({ queryKey: ["unread"] });
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-r bg-bg-2">
      <div className="space-y-3 p-3">
        <button type="button" onClick={() => setPaletteOpen(true)} className="flex w-full items-center gap-2 rounded-lg border bg-bg px-2.5 py-2 text-left text-sm text-muted hover:border-lime/60 hover:text-text" aria-label="Search or start a chat">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <span className="flex-1 truncate">Search or start a chat</span>
          <kbd className="hidden rounded border px-1.5 py-0.5 text-[10px] text-muted xl:block">Ctrl K</kbd>
        </button>
        <nav className="space-y-0.5" aria-label="Home">
          <Link href="/home" prefetch={false} className={clsx("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm", pathname === "/home" ? "bg-surface text-text" : "text-muted hover:bg-surface hover:text-text")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
            Discover
          </Link>
          <Link href="/explore" prefetch={false} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-surface hover:text-text">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m15 9-2 6-6 2 2-6 6-2Z" /></svg>
            Explore
          </Link>
        </nav>
      </div>

      <div className="flex items-center justify-between px-4 pb-1 pt-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Direct Messages</h2>
        <button type="button" onClick={() => setPaletteOpen(true)} aria-label="New message" className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-text">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {isLoading && <div className="px-2 py-2 text-sm text-muted">Loading…</div>}
        {!isLoading && items.length === 0 && <div className="px-2 py-2 text-sm text-muted">No conversations yet.</div>}
        <div className="space-y-0.5">
          {items.map(c => {
            const unread = c.unreadCount > 0;
            return (
              <div key={c.id} className="relative">
                <Link href={`/dm/${c.id}`} prefetch={false} aria-current={selectedId === c.id ? "page" : undefined} className={clsx("group flex min-h-[52px] items-center gap-2.5 rounded-lg px-2 py-1.5", selectedId === c.id ? "bg-surface" : "hover:bg-surface/70")}>
                  <span className="relative shrink-0">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-hi text-[11px] font-semibold">{getInitials(c.participant.username)}</span>
                    <PresenceDot status={c.presence} className="absolute -bottom-0.5 -right-0.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={clsx("truncate text-sm", unread ? "font-semibold text-text" : "text-text/90", c.muted && "text-muted")}>{toDisplayUsername(c.participant.username)}</span>
                      <span className="shrink-0 text-[10px] text-muted" title={c.lastMessageAt}>{relativeTime(c.lastMessageAt, now)}</span>
                    </span>
                    <span className={clsx("flex items-center gap-1.5 text-xs", unread ? "text-text/80" : "text-muted")}>
                      <span className="truncate">{c.blocked ? "You can't message this user" : c.lastMessagePreview || c.lastMessage || "No messages yet"}</span>
                    </span>
                  </span>
                  {unread && !c.muted && <span className="ml-1 flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-lime px-1 text-[10px] font-semibold text-bg">{c.unreadCount > 99 ? "99+" : c.unreadCount}</span>}
                </Link>
                <button type="button" onClick={e => { e.preventDefault(); setMenuFor(m => m === c.id ? null : c.id); }} aria-label={`Options for ${c.participant.username}`} className={clsx("absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface-hi hover:text-text", menuFor === c.id ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                </button>
                {menuFor === c.id && (
                  <div ref={menuRef} role="menu" className="absolute right-1 top-8 z-30 w-44 rounded-xl border bg-surface p-1 shadow-xl">
                    <button type="button" role="menuitem" onClick={() => markRead(c.id)} className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-hi">Mark as read</button>
                    <button type="button" role="menuitem" onClick={() => mute(c.id, !c.muted)} className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-hi">{c.muted ? "Unmute" : "Mute"}</button>
                    <button type="button" role="menuitem" onClick={() => close(c.id)} className="block w-full rounded-lg px-2 py-2 text-left text-sm text-red-400 hover:bg-surface-hi">Close</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <UserPanel />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </aside>
  );
}
