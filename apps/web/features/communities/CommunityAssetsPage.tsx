"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatUsername, getInitials, plural } from "@square/shared";
import Image from "next/image";
import { PresenceDot } from "@/components/shell/PresenceDot";
import { Skeleton } from "@/components/ui/skeleton";
import clsx from "clsx";

const CATEGORY_ORDER: { key: string; label: string }[] = [
  { key: "Information", label: "Information" },
  { key: "Community", label: "Community" },
  { key: "Resources", label: "Resources" },
  { key: "Build", label: "Build" },
];

const KIND_ICON: Record<string, string> = {
  chat: "#",
  feed: "📢",
  board: "🗂",
  list: "📋",
  form: "📝",
};

export default function CommunityAssetsPage({ community }: { community: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  const { data: detail, isLoading } = useQuery({
    queryKey: ["community", community],
    queryFn: () => api.getCommunity(community),
    staleTime: 60_000,
  });

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [myRole, setMyRole] = useState<string | null>(null);
  const [isMember, setIsMember] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("square:community-collapsed");
      if (stored) setCollapsed(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    if (detail) {
      setMyRole(detail.community.role ?? null);
      setIsMember(detail.community.joined ?? false);
    }
  }, [detail]);

  if (isLoading) return <AssetsSkeleton />;
  if (!detail) return <div className="p-4 text-center text-muted">Community not found</div>;

  const comm = detail.community;
  const assets = (detail.assets || []).filter((a: any) => a.hiddenFromMembers !== true || myRole === "owner" || myRole === "moderator");
  const byCat = new Map<string, any[]>();
  for (const a of assets) {
    const key = a.category || "Information";
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key)!.push(a);
  }

  const orderedCats = CATEGORY_ORDER.filter(c => byCat.has(c.key));
  const otherCats = Array.from(byCat.keys()).filter(k => !CATEGORY_ORDER.some(c => c.key === k));
  const cats = [...orderedCats.map(c => c.key), ...otherCats];

  const canAdd = myRole === "owner" || myRole === "moderator";

  return (
    <div className="flex flex-col h-full min-h-0 bg-bg-2">
      {/* Header */}
      <header className="shrink-0 border-b border-border/60 bg-bg-2/80 backdrop-blur p-4 z-10">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-heading text-lg font-semibold truncate min-w-0">{comm.name}</span>
          {comm.isPublic !== false && <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border/60 text-[10px] text-muted"><span className="sr-only">Public</span>🌐</span>}
        </div>
        <button type="button" aria-label="Community menu" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
        </button>
      </header>

      {/* Search + invite row */}
      <div className="shrink-0 border-b border-border/60 bg-bg-2/80 backdrop-blur p-4 z-10 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <input type="search" placeholder={`Search ${comm.name}`} className="flex-1 h-10 pl-9 pr-3 rounded-lg border border-border bg-surface text-text outline-none focus:border-blue-strong text-sm" aria-label={`Search ${comm.name}`} />
          <button type="button" aria-label="Share community" className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:bg-surface-hi hover:text-text">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="19" r="3" /><path d="M8.59 13.51 18 4M15.49 10.49 6 20" /></svg>
          </button>
        </div>
        <div className="text-[11px] text-muted flex items-center gap-1">
          <span>{plural(comm.memberCount || 0, "member", "members")}</span>
          <span>·</span>
          <span>{plural(comm.onlineCount || 0, "member", "members")} online</span>
          <span>·</span>
          <span>{comm.schoolName}</span>
        </div>
        {!isMember && (
          <>
            <button type="button" onClick={() => api.joinCommunity(comm.id).then(() => { setIsMember(true); router.refresh(); })} className="shrink-0 flex h-10 items-center justify-center rounded-lg border border-lime bg-lime text-bg px-3 text-sm font-semibold hover:bg-lime-hover">Join {comm.name}</button>
            <p className="text-[11px] text-muted">You are previewing this community</p>
          </>
        )}
      </div>

      {/* About row */}
      <button type="button" className="shrink-0 flex items-center gap-3 border-b border-border/60 bg-bg-2/50 px-4 py-3 text-left hover:bg-surface/50" aria-label="About this community">
        <span className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-surface text-muted">{getInitials(comm.name)}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">About this community</div>
          <div className="text-[11px] text-muted truncate">View description, members, and settings</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {/* Assets list */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-[max(4rem,env(safe-area-inset-bottom))] p-4 space-y-4">
        {cats.map(cat => {
          const items = byCat.get(cat)!;
          const isCollapsed = collapsed[cat];
          return (
            <section key={cat} className="rounded-xl border border-border/60 bg-surface overflow-hidden">
              <button type="button" onClick={() => setCollapsed(c => { const next = { ...c, [cat]: !isCollapsed }; try { localStorage.setItem("square:community-collapsed", JSON.stringify(next)); } catch {}; return next; })} className="flex w-full items-center justify-between border-b border-border/60 bg-bg-2/50 px-4 py-3" aria-expanded={!isCollapsed} aria-label={cat}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{cat}</span>
                  {canAdd && <button type="button" onClick={e => e.stopPropagation()} aria-label={`Add asset to ${cat}`} className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-[10px] text-muted hover:bg-surface-hi hover:text-text">+</button>}
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={clsx("shrink-0 text-muted transition-transform", isCollapsed && "rotate-90")} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              {!isCollapsed && (
                <div className="divide-y divide-border/60">
                  {items.map(a => {
                    const unread = (a as any).unreadCount && (a as any).unreadCount > 0;
                    const locked = (a as any).locked || false;
                    return (
                      <Link key={a.id} href={`/c/${comm.slug}/${a.slug}`} prefetch={false} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-hi transition-colors">
                        <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-lg bg-surface-hi text-[10px] text-muted">{KIND_ICON[a.kind] || "#"}</span>
                        <span className="min-w-0 flex-1">
                          <div className={clsx("text-sm font-semibold truncate", unread ? "text-text font-bold" : "text-text/90")}>{a.name}</div>
                          <div className="flex items-center gap-1 text-[11px] text-muted">
                            {locked && <span className="shrink-0">🔒</span>}
                            {unread && <span className="flex h-5 items-center rounded-full bg-lime text-bg px-1.5 text-[10px] font-semibold">{Math.min((a as any).unreadCount, 99)} NEW</span>}
                          </div>
                        </span>
                        {unread && <span className="shrink-0 w-1 h-full bg-lime rounded-l-sm" />}
                        {(locked && !unread) && <span className="shrink-0 text-muted">🔒</span>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
        {cats.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-muted">No assets yet.</p>
            {canAdd && <button type="button" className="mt-3 inline-flex items-center rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-muted hover:bg-surface-hi">Add an asset</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function AssetsSkeleton() {
  return (
    <div className="flex flex-col h-full bg-bg-2">
      <header className="shrink-0 p-4 space-y-3">
        <div className="h-5 w-32 rounded bg-surface-hi" />
        <div className="h-3 w-1/2 rounded bg-surface-hi" />
        <div className="flex gap-2">
          <div className="h-10 flex-1 rounded bg-surface-hi" />
          <div className="h-10 w-10 rounded bg-surface-hi" />
        </div>
        <div className="h-3 w-1/3 rounded bg-surface-hi" />
      </header>
      <div className="flex-1 p-4 space-y-4">
        {[1, 2, 3].map(i => (
          <section key={i} className="rounded-xl border border-border/60 bg-surface overflow-hidden">
            <div className="border-b border-border/60 bg-bg-2/50 px-4 py-3">
              <div className="h-4 w-1/3 rounded bg-surface-hi" />
              <div className="h-4 w-10 rounded bg-surface-hi ml-auto" />
            </div>
            <div className="divide-y divide-border/60">
              {[1, 2].map(j => (
                <div key={j} className="flex items-center gap-3 px-4 py-3">
                  <div className="h-6 w-6 rounded-full bg-surface-hi" />
                  <div className="flex-1 space-y-1">
                    <div className="h-4 w-3/4 rounded bg-surface-hi" />
                    <div className="h-3 w-1/2 rounded bg-surface-hi" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
