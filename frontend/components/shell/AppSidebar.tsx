"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { UserPanel } from "./UserPanel";
import { AddAssetDialog } from "@/features/assets/AddAssetDialog";
import { ASSET_CATEGORY_ORDER, ADD_ASSET_ROLES, type AssetCategory } from "@square/shared";
import { plural } from "@square/shared";
import clsx from "clsx";
import { useState } from "react";

export function AppSidebar() {
  const pathname = usePathname();
  const isHome = pathname === "/home";
  const isExplore = pathname === "/explore";
  const communityMatch = pathname.match(/^\/c\/([^/]+)/);
  const currentCommunitySlug = communityMatch?.[1];
  const isInCommunity = !!currentCommunitySlug;

  const { data: myCommunities } = useQuery({ queryKey: ["my-communities"], queryFn: () => api.myCommunities(), staleTime: 30_000 });
  const { data: communityDetail } = useQuery({
    queryKey: ["community", currentCommunitySlug],
    queryFn: () => api.getCommunity(currentCommunitySlug!),
    staleTime: 60_000,
    enabled: isInCommunity,
  });

  const myRole = communityDetail?.community?.role;
  const canAddAsset = myRole ? (ADD_ASSET_ROLES as readonly string[]).includes(myRole) : false;
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogCategory, setAddDialogCategory] = useState<AssetCategory | undefined>();

  const assets = communityDetail?.assets || [];
  const assetsByCategory = new Map<string, typeof assets>();
  for (const a of assets) {
    if (!assetsByCategory.has(a.category)) assetsByCategory.set(a.category, []);
    assetsByCategory.get(a.category)!.push(a);
  }

  return (
    <aside className="left-panel-fixed">
      {isHome ? (
        <>
          {/* Fixed nav - Discover/Explore */}
          <nav className="left-panel-nav p-2 space-y-1" aria-label="Home navigation">
            <Link href="/home" prefetch={false} aria-current={isHome ? "page" : undefined} className={clsx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors", isHome ? "bg-surface text-lime" : "text-muted hover:bg-surface hover:text-text")}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
              <span>Discover</span>
            </Link>
            <Link href="/explore" prefetch={false} aria-current={isExplore ? "page" : undefined} className={clsx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors", isExplore ? "bg-surface text-lime" : "text-muted hover:bg-surface hover:text-text")}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m15 9-2 6-6 2 2-6 6-2Z" /></svg>
              <span>Explore</span>
            </Link>
          </nav>
          <div className="border-y my-2 left-panel-nav" />
        </>
      ) : isInCommunity && communityDetail ? (
        <>
          {/* Fixed community header */}
          <div className="left-panel-header flex items-start justify-between gap-2 border-b p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-heading text-sm font-semibold">{communityDetail.community.name}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </div>
              <div className="mt-1 text-xs text-muted">{plural(communityDetail.community.memberCount, "member", "members")} · {communityDetail.community.schoolName || "FUT Minna"}</div>
            </div>
            <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text" title="Share community">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="19" r="3" /><path d="M8.59 13.51 18 4M15.49 10.49 6 20" /></svg>
            </button>
          </div>

          {/* Fixed join button */}
          {!myRole && communityDetail.community.isPublic !== false && (
            <div className="left-panel-header px-4">
              <button type="button" className="mx-4 mb-3 rounded-lg bg-lime px-3 py-2 text-sm font-medium text-bg hover:bg-lime-hover w-full">
                Join {communityDetail.community.name}
              </button>
            </div>
          )}

          {/* Scrollable assets list */}
          <div className="left-panel-content min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Assets</span>
              {canAddAsset && (
                <button
                  type="button"
                  onClick={() => { setAddDialogCategory(undefined); setAddDialogOpen(true); }}
                  title="Add an asset"
                  aria-label="Add an asset"
                  className="flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-[11px] font-medium text-muted hover:border-lime/60 hover:bg-surface hover:text-lime transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                  Add
                </button>
              )}
            </div>

            {ASSET_CATEGORY_ORDER.map(category => {
              const categoryAssets = assetsByCategory.get(category) || [];
              if (categoryAssets.length === 0) return null;
              return (
                <div key={category} className="mb-3">
                  <div className="flex items-center justify-between px-2 pb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{category}</span>
                  </div>
                  <div className="space-y-0.5">
                    {categoryAssets.map(a => {
                      const href = `/c/${currentCommunitySlug}/${a.slug}`;
                      const active = pathname === href;
                      const unread = a.unreadCount && a.unreadCount > 0;
                      return (
                        <Link key={a.id} href={href} prefetch={false} aria-current={active ? "page" : undefined} className={clsx("flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm", active ? "bg-surface text-lime" : unread ? "text-text font-semibold" : "text-muted hover:bg-surface hover:text-text")}>
                          <span className="text-muted">#</span>
                          <span className="truncate flex-1">{a.name}</span>
                          {unread && <span className="flex h-1.5 w-1.5 rounded-full bg-lime" aria-hidden="true" />}
                          {a.hiddenFromMembers && <span className="text-[10px]" aria-label="Private">🔒</span>}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {/* Fixed header */}
          <div className="left-panel-header flex items-center justify-between gap-2 border-b p-4">
            <div>
              <div className="font-heading text-sm font-semibold">Your communities</div>
              <div className="text-[11px] text-muted">Click a community on the strip to view its assets</div>
            </div>
            <Link href="/explore" prefetch={false} aria-label="Explore communities" className="flex h-8 w-8 items-center justify-center rounded-lg border text-muted hover:border-lime hover:text-lime">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m15 9-2 6-6 2 2-6 6-2Z" /></svg>
            </Link>
          </div>
          {/* Scrollable content */}
          <div className="left-panel-content min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
            {(!myCommunities || myCommunities.length === 0) && (
              <div className="p-2 text-sm text-muted">
                No communities yet. <Link href="/explore" prefetch={false} className="text-lime hover:underline">Explore communities</Link> to join one.
              </div>
            )}
          </div>
        </>
      )}
      {/* Fixed user panel at bottom */}
      <UserPanel className="left-panel-user-panel" />
      {isInCommunity && addDialogOpen && (
        <AddAssetDialog
          communityId={communityDetail?.community?.id || currentCommunitySlug!}
          existing={assets}
          initialCategory={addDialogCategory}
          onClose={() => { setAddDialogOpen(false); setAddDialogCategory(undefined); }}
        />
      )}
    </aside>
  );
}