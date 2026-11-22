"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ADD_ASSET_ROLES, ASSET_CATEGORY_ORDER, getAssetCatalogEntry, getInitials, plural, type AssetCategory, type Role } from "@square/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { AddAssetDialog } from "@/features/assets/AddAssetDialog";
import { AssetRowActions } from "@/features/assets/AssetRowActions";
import clsx from "clsx";
import { ChevronDown, Globe2, LockKeyhole, Plus, Share2 } from "lucide-react";

export default function CommunityAssetsPage({ community }: { community: string }) {
  const router = useRouter();

  const { data: detail, isLoading } = useQuery({
    queryKey: ["community", community],
    queryFn: () => api.getCommunity(community),
    staleTime: 60_000,
  });

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [joinedOverride, setJoinedOverride] = useState<boolean>();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogCategory, setAddDialogCategory] = useState<AssetCategory | undefined>();

  useEffect(() => {
    try {
      const stored = localStorage.getItem("square:community-collapsed");
      if (stored) setCollapsed(JSON.parse(stored));
    } catch {}
  }, []);

  if (isLoading) return <AssetsSkeleton />;
  if (!detail) return <div className="p-4 text-center text-muted">Community not found</div>;

  const comm = detail.community;
  const myRole = comm.role ?? null;
  const isMember = joinedOverride ?? comm.joined ?? false;
  const assets = detail.assets;
  const assetGroups = ASSET_CATEGORY_ORDER.map((category) => ({
    category,
    assets: assets
      .filter((asset) => getAssetCatalogEntry(asset.catalogKey)?.category === category)
      .sort((a, b) => a.order - b.order),
  })).filter((group) => group.assets.length > 0);
  const canAdd = myRole !== null && (ADD_ASSET_ROLES as readonly Role[]).includes(myRole);

  return (
    <div className="flex flex-col h-full min-h-0 bg-bg-2">
      {/* Header */}
      <header className="shrink-0 border-b border-border/60 bg-bg-2 p-4 z-10">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-heading text-lg font-semibold">{comm.name}</span>
            {comm.isPublic !== false && <Globe2 className="h-4 w-4 shrink-0 text-muted" aria-label="Public community" />}
          </div>
          <button type="button" aria-label="Community menu" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text">
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted">
          <span>{plural(comm.memberCount || 0, "member", "members")}</span>
          <span>·</span>
          <span>{comm.onlineCount || 0} online</span>
          <span>·</span>
          <span>{comm.schoolName}</span>
        </div>
      </header>

      {/* Search + invite row */}
      <div className="shrink-0 border-b border-border/60 bg-bg-2 p-4 z-10 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <input type="search" placeholder={`Search ${comm.name}`} className="min-w-0 flex-1 h-10 pl-9 pr-3 rounded-lg border border-border bg-surface text-text outline-none focus:border-blue-strong text-sm" aria-label={`Search ${comm.name}`} />
          <button type="button" aria-label="Share community" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:bg-surface-hi hover:text-text">
            <Share2 className="h-4 w-4" aria-hidden="true" />
          </button>
          {canAdd && (
            <button type="button" aria-label="Add an asset" title="Add an asset" onClick={() => { setAddDialogCategory(undefined); setAddDialogOpen(true); }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-lime text-bg hover:bg-lime-hover">
              <Plus className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
        {!isMember && (
          <>
            <button type="button" onClick={() => api.joinCommunity(comm.id).then(() => { setJoinedOverride(true); router.refresh(); })} className="shrink-0 flex h-10 items-center justify-center rounded-lg border border-lime bg-lime text-bg px-3 text-sm font-semibold hover:bg-lime-hover">Join {comm.name}</button>
            <p className="text-[11px] text-muted">You are previewing this community</p>
          </>
        )}
      </div>

      {/* About row */}
      <button type="button" className="shrink-0 flex items-center gap-3 px-4 py-3 text-left" aria-label="About this community">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-xs text-muted">{getInitials(comm.name)}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">About this community</div>
          <div className="text-[11px] text-muted truncate">View description, members, and settings</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {/* Assets list */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pb-[max(4rem,env(safe-area-inset-bottom))]">
        {assetGroups.map(({ category, assets: categoryAssets }) => {
          const isCollapsed = collapsed[category];
          return (
            <section key={category} aria-label={`${category} assets`} data-testid="asset-category" className="mt-4">
              <div className="mb-1 flex items-center gap-2 px-3">
                <button
                  type="button"
                  onClick={() => setCollapsed((current) => {
                    const next = { ...current, [category]: !isCollapsed };
                    try { localStorage.setItem("square:community-collapsed", JSON.stringify(next)); } catch {}
                    return next;
                  })}
                  className="flex min-h-8 min-w-0 flex-1 items-center gap-2 text-left"
                  aria-expanded={!isCollapsed}
                  aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${category}`}
                >
                  <ChevronDown className={clsx("h-3.5 w-3.5 shrink-0 text-muted transition-transform", isCollapsed && "-rotate-90")} aria-hidden="true" />
                  <span className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{category}</span>
                </button>
                {canAdd && (
                  <button type="button" onClick={() => { setAddDialogCategory(category); setAddDialogOpen(true); }} aria-label={`Add asset to ${category}`} title={`Add an asset to ${category}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-lime focus-visible:text-lime">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              {!isCollapsed && (
                categoryAssets.map((asset) => {
                  const unreadCount = Math.max(0, asset.unreadCount || 0);
                  const unread = unreadCount > 0;
                  const locked = asset.locked || asset.hiddenFromMembers;
                  return (
                    <AssetRowActions key={asset.id} asset={asset} communitySlug={comm.slug} role={myRole}>
                      <Link
                        data-testid="asset-row"
                        href={`/c/${comm.slug}/${getAssetCatalogEntry(asset.catalogKey)?.key}`}
                        prefetch={false}
                        className="group flex h-11 w-full items-center gap-2 rounded-lg px-3 text-left transition-colors hover:bg-surface-hi active:bg-surface-hi focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-strong"
                      >
                        {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-strong" aria-hidden="true" />}
                        <span data-testid="asset-hash" className="w-4 shrink-0 text-center text-base leading-none" style={{ color: "var(--blue)", opacity: 0.6 }}>#</span>
                        <span
                          data-testid="asset-name"
                          className={clsx("min-w-0 flex-1 truncate font-medium", unread && "font-semibold")}
                          style={{ color: unread ? "var(--blue-strong)" : "var(--blue)", opacity: unread ? 1 : 0.8, fontSize: 16 }}
                        >
                          {getAssetCatalogEntry(asset.catalogKey)?.name}
                        </span>
                        {unread && <span aria-label={`${unreadCount} new`} className="shrink-0 rounded-full bg-blue-strong px-2 py-1 text-[10px] font-bold leading-none text-bg">{unreadCount > 99 ? "99+ NEW" : `${unreadCount} NEW`}</span>}
                        {locked && <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="Read-only" />}
                      </Link>
                    </AssetRowActions>
                  );
                })
              )}
            </section>
          );
        })}
      </div>
      {addDialogOpen && <AddAssetDialog
        communitySlug={comm.slug}
        existing={assets}
        initialCategory={addDialogCategory}
        onClose={() => { setAddDialogOpen(false); setAddDialogCategory(undefined); }}
      />}
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
