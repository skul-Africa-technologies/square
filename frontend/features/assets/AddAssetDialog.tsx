"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ASSET_CATEGORY_ORDER, getAssetCatalogEntry, type Asset, type AssetCategory, type AssetCatalogEntry, type CommunityDetail } from "@square/shared";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { AssetKindIcon } from "./AssetKindIcon";
import clsx from "clsx";

type MutationContext = { previous?: CommunityDetail; optimisticId?: string };

export function AddAssetDialog({ communitySlug, existing, initialCategory, onClose }: {
  communitySlug: string;
  existing: Asset[];
  initialCategory?: AssetCategory;
  onClose: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef(new Map<AssetCategory, HTMLElement>());
  const onCloseRef = useRef(onClose);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [optimisticKeys, setOptimisticKeys] = useState<Set<string>>(() => new Set());
  const [lastAdded, setLastAdded] = useState<Asset | null>(null);
  const [highlightedCategory, setHighlightedCategory] = useState<AssetCategory | undefined>(initialCategory);
  const { data: catalog, isLoading } = useQuery({
    queryKey: ["asset-catalog"],
    queryFn: () => api.getAssetCatalog(),
    staleTime: 60_000,
  });

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    searchRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ) ?? []);
      if (event.key === "Tab" && focusable.length > 0) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const focusIsInside = dialogRef.current?.contains(document.activeElement);
        if (!focusIsInside) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const rows = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("[data-add-asset]") ?? [])
          .filter((button) => !button.disabled);
        if (rows.length === 0) return;
        event.preventDefault();
        const current = rows.indexOf(document.activeElement as HTMLButtonElement);
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const next = current < 0
          ? (direction > 0 ? 0 : rows.length - 1)
          : (current + direction + rows.length) % rows.length;
        rows[next]?.focus();
      }

      if (event.key === "Enter" && document.activeElement === searchRef.current) {
        const first = dialogRef.current?.querySelector<HTMLButtonElement>("[data-add-asset]:not([disabled])");
        if (first) {
          event.preventDefault();
          first.click();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    if (!initialCategory || isLoading || !catalog) return;
    const frame = requestAnimationFrame(() => sectionRefs.current.get(initialCategory)?.scrollIntoView({ block: "start", behavior: "smooth" }));
    return () => cancelAnimationFrame(frame);
  }, [catalog, initialCategory, isLoading]);

  const entries = useMemo(() => (catalog || []).filter((entry) => !entry.isDefault), [catalog]);
  const visibleByCategory = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return ASSET_CATEGORY_ORDER.map((category) => ({
      category,
      entries: entries.filter((entry) => {
        const catalogEntry = getAssetCatalogEntry(entry.key);
        if (catalogEntry?.category !== category) return false;
        return !normalizedQuery || `${entry.name} ${entry.key} ${entry.description}`.toLocaleLowerCase().includes(normalizedQuery);
      }),
    })).filter((group) => group.entries.length > 0);
  }, [entries, query]);
  const addedKeys = new Set([
    ...existing.map((asset) => asset.catalogKey).filter((key): key is string => !!key),
    ...optimisticKeys,
  ]);

  const add = useMutation<Asset, Error, string, MutationContext>({
    mutationFn: (key) => api.addAsset(communitySlug, key),
    onMutate: async (key) => {
      setError(null);
      setOptimisticKeys((keys) => new Set(keys).add(key));
      await queryClient.cancelQueries({ queryKey: ["community", communitySlug] });
      const previous = queryClient.getQueryData<CommunityDetail>(["community", communitySlug]);
      const entry = entries.find((candidate) => candidate.key === key);
      const optimisticId = `optimistic-${communitySlug}-${key}`;
      if (previous && entry && !previous.assets.some((asset) => asset.catalogKey === key)) {
        const optimisticAsset: Asset = {
          id: optimisticId,
          communityId: previous.community.id,
          name: entry.name,
          slug: entry.key,
          description: entry.description,
          kind: entry.kind,
          category: entry.category,
          permissions: entry.permissions,
          isDefault: false,
          catalogKey: entry.key,
          order: previous.assets.length,
          hiddenFromMembers: entry.hiddenFromMembers,
          locked: !entry.permissions.canPost.includes(previous.community.role || "member"),
          unreadCount: 0,
          lastReadPostId: null,
        };
        queryClient.setQueryData<CommunityDetail>(["community", communitySlug], {
          ...previous,
          assets: [...previous.assets, optimisticAsset],
        });
      }
      return { previous, optimisticId };
    },
    onError: (_cause, key, context) => {
      setOptimisticKeys((keys) => {
        const next = new Set(keys);
        next.delete(key);
        return next;
      });
      if (context?.previous) queryClient.setQueryData(["community", communitySlug], context.previous);
      setError("Could not add that asset. Try again.");
    },
    onSuccess: async (asset, key, context) => {
      setLastAdded(asset);
      queryClient.setQueryData<CommunityDetail>(["community", communitySlug], (current) => {
        if (!current) return current;
        const withoutOptimistic = current.assets.filter((item) => item.id !== context?.optimisticId);
        return {
          ...current,
          assets: withoutOptimistic.some((item) => item.catalogKey === key) ? withoutOptimistic : [...withoutOptimistic, asset],
        };
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["community", communitySlug] }),
        queryClient.invalidateQueries({ queryKey: ["community-assets", communitySlug] }),
      ]);
    },
  });

  const goToAsset = (asset: Asset) => {
    onCloseRef.current();
    router.push(`/c/${communitySlug}/${asset.slug}`);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-asset-title"
        onMouseDown={(event) => { if (event.target === event.currentTarget) onCloseRef.current(); }}
      >
        <div ref={dialogRef} className="max-h-[90dvh] w-full max-w-[480px] overflow-hidden rounded-t-[var(--sheet-radius)] border border-border bg-bg-2 sm:rounded-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-border p-4">
            <div>
              <h2 id="add-asset-title" className="font-heading text-lg font-semibold">Add an asset</h2>
              <p className="mt-1 text-xs text-muted">Pick from the suggestions. Custom assets are not available yet.</p>
            </div>
            <button type="button" onClick={() => onCloseRef.current()} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-text">×</button>
          </div>
          <div className="border-b border-border px-4 py-3">
            <label htmlFor="asset-catalog-search" className="sr-only">Search suggestions</label>
            <input
              ref={searchRef}
              id="asset-catalog-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search suggestions"
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text outline-none focus:border-lime"
            />
          </div>
          <div className="max-h-[60dvh] overflow-y-auto p-3">
            {isLoading && <p className="p-4 text-sm text-muted">Loading catalog…</p>}
            {!isLoading && visibleByCategory.length === 0 && <p className="p-4 text-center text-sm text-muted">No suggestions match your search.</p>}
            {visibleByCategory.map(({ category, entries: categoryEntries }) => (
              <section
                key={category}
                ref={(element) => { if (element) sectionRefs.current.set(category, element); else sectionRefs.current.delete(category); }}
                aria-label={category}
                className={clsx("scroll-mt-3 rounded-xl p-2 transition-colors", highlightedCategory === category && "bg-lime-tint ring-1 ring-lime/40")}
              >
                <h3 className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">{category}</h3>
                <ul className="space-y-2">
                  {categoryEntries.map((entry: AssetCatalogEntry) => {
                    const added = addedKeys.has(entry.key);
                    return (
                      <li key={entry.key} className={clsx("flex items-center gap-3 rounded-xl border border-border bg-surface p-3", added && "opacity-55")}>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-bg-2 text-muted">
                          <AssetKindIcon asset={{ catalogKey: entry.key, kind: entry.kind }} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium"># {entry.name}</div>
                          <p className="truncate text-xs text-muted">{entry.description}</p>
                          {entry.key === "mods-only" && <p className="mt-0.5 text-[10px] text-muted">Hidden from members</p>}
                        </div>
                        <Button
                          data-add-asset
                          size="sm"
                          variant={added ? "secondary" : "primary"}
                          disabled={added || add.isPending}
                          onClick={() => add.mutate(entry.key)}
                          className="shrink-0"
                        >
                          {added ? "Added" : add.isPending && add.variables === entry.key ? "Adding…" : "Add"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {error && <p className="p-2 text-xs text-red-300" role="alert">{error}</p>}
          </div>
          <div className="flex justify-end border-t border-border p-3">
            <Button variant="ghost" onClick={() => onCloseRef.current()}>Done</Button>
          </div>
        </div>
      </div>
      {lastAdded && (
        <div role="status" className="fixed bottom-20 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm shadow-xl">
          <span># {lastAdded.name} added</span>
          <button type="button" onClick={() => goToAsset(lastAdded)} className="font-semibold text-lime hover:text-lime-hover">Open</button>
        </div>
      )}
    </>
  );
}
