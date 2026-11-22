"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { UserPanel } from "./UserPanel";
import { AddAssetDialog } from "@/features/assets/AddAssetDialog";
import { AssetRowActions } from "@/features/assets/AssetRowActions";
import { ASSET_CATEGORY_ORDER, ADD_ASSET_ROLES, getAssetCatalogEntry, type AssetCategory, type Role } from "@square/shared";
import { plural } from "@square/shared";
import clsx from "clsx";
import { useState } from "react";
import { ChevronDown, LockKeyhole, Plus, Wrench } from "lucide-react";

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
  const canAddAsset = myRole ? (ADD_ASSET_ROLES as readonly Role[]).includes(myRole) : false;
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogCategory, setAddDialogCategory] = useState<AssetCategory | undefined>();
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const assets = communityDetail?.assets || [];
  const assetGroups = ASSET_CATEGORY_ORDER.map((category) => ({
    category,
    assets: assets
      .filter((asset) => getAssetCatalogEntry(asset.catalogKey)?.category === category)
      .sort((a, b) => a.order - b.order),
  })).filter((group) => group.assets.length > 0);

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
          <div className="left-panel-header group flex items-start justify-between gap-2 border-b p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-heading text-sm font-semibold">{communityDetail.community.name}</span>
                <button type="button" aria-label="Community menu" title="Community menu" className="rounded p-0.5 text-muted hover:bg-surface hover:text-text">
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-1 text-xs text-muted">{plural(communityDetail.community.memberCount, "member", "members")} · {communityDetail.community.schoolName || "FUT Minna"}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {canAddAsset && (
                <button
                  type="button"
                  onClick={() => { setAddDialogCategory(undefined); setAddDialogOpen(true); }}
                  title="Add an asset"
                  aria-label="Add an asset"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted opacity-0 transition-opacity hover:bg-surface hover:text-lime focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              {myRole === "owner" && (
                <button type="button" aria-label="Community settings" title="Community settings" className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text">
                  <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
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
            {assetGroups.map(({ category, assets: categoryAssets }) => {
              const isCollapsed = collapsedCategories[category] ?? false;
              return (
                <div key={category} role="group" aria-label={`${category} assets`} data-testid="asset-category">
                  <div className="group mt-4 flex items-center justify-between px-3 pb-1">
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${category}`}
                      onClick={() => setCollapsedCategories((current) => ({ ...current, [category]: !isCollapsed }))}
                      className="flex min-h-8 min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <ChevronDown className={clsx("h-3 w-3 shrink-0 text-muted transition-transform", isCollapsed && "-rotate-90")} aria-hidden="true" />
                      <span className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{category}</span>
                    </button>
                    {canAddAsset && (
                      <button
                        type="button"
                        onClick={() => { setAddDialogCategory(category); setAddDialogOpen(true); }}
                        title={`Add an asset to ${category}`}
                        aria-label={`Add asset to ${category}`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-surface hover:text-lime focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {!isCollapsed && categoryAssets.map(a => {
                      const href = `/c/${currentCommunitySlug}/${getAssetCatalogEntry(a.catalogKey)?.key}`;
                      const active = pathname === href;
                      const unreadCount = Math.max(0, a.unreadCount || 0);
                      const unread = unreadCount > 0;
                      const locked = a.locked || a.hiddenFromMembers;
                      return (
                        <AssetRowActions key={a.id} asset={a} communitySlug={currentCommunitySlug!} role={myRole || null}>
                          <Link
                            data-testid="asset-row"
                            href={href}
                            prefetch={false}
                            aria-current={active ? "page" : undefined}
                            className={clsx(
                              "flex h-9 items-center gap-2 rounded-lg px-3 pr-9 text-[15px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-strong",
                              active ? "bg-blue-soft font-semibold" : "hover:bg-surface",
                              active || unread ? "font-semibold" : "font-medium",
                            )}
                            style={active ? { boxShadow: "inset 3px 0 0 var(--blue-strong)" } : undefined}
                          >
                            {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-strong" aria-hidden="true" />}
                            <span data-testid="asset-hash" className="w-4 shrink-0 text-center text-base leading-none" style={{ color: "var(--blue)", opacity: 0.6 }}>#</span>
                            <span
                              data-testid="asset-name"
                              className={clsx("min-w-0 flex-1 truncate font-medium", (active || unread) && "font-semibold")}
                              style={{ color: active || unread ? "var(--blue-strong)" : "var(--blue)", opacity: active || unread ? 1 : 0.8 }}
                            >
                              {getAssetCatalogEntry(a.catalogKey)?.name}
                            </span>
                            {unread && <span aria-label={`${unreadCount} unread`} className="ml-auto rounded-full bg-blue-strong px-1.5 py-0.5 text-[10px] font-bold leading-none text-bg">{unreadCount > 99 ? "99+" : unreadCount}</span>}
                            {locked && <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="Read-only" />}
                          </Link>
                        </AssetRowActions>
                      );
                    })}
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
          communitySlug={currentCommunitySlug!}
          existing={assets}
          initialCategory={addDialogCategory}
          onClose={() => { setAddDialogOpen(false); setAddDialogCategory(undefined); }}
        />
      )}
    </aside>
  );
}