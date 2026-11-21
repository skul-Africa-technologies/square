"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Asset, AssetCategory, AssetKind } from "@square/shared";
import { Button } from "@/components/ui/button";
import clsx from "clsx";

const CATEGORIES: Array<AssetCategory | "All"> = ["All", "Information", "Community", "Resources", "Build"];

const KIND_ICON: Record<AssetKind, string> = { chat: "💬", feed: "📣", board: "🗂", list: "📋", form: "📝" };

function posterLabel(asset: Asset | { permissions: { canPost: string[] } }): string {
  if (asset.permissions.canPost.includes("member")) return "Everyone can post";
  return "Owners & mods post";
}

export function AddAssetDialog({ communityId, existing, initialCategory, onClose }: { communityId: string; existing: Asset[]; initialCategory?: AssetCategory; onClose: () => void }) {
  const qc = useQueryClient();
  const [category, setCategory] = useState<AssetCategory | "All">(initialCategory || "All");
  const [error, setError] = useState<string | null>(null);
  const { data: catalog, isLoading } = useQuery({ queryKey: ["asset-catalog"], queryFn: () => api.getAssetCatalog(), staleTime: 60_000 }); // PROPOSED

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const addedKeys = new Set(existing.map(a => a.catalogKey).filter(Boolean) as string[]);
  const entries = useMemo(() => (catalog || []).filter(e => !e.isDefault), [catalog]);
  const shown = entries.filter(e => category === "All" || e.category === category);

  const add = useMutation({
    mutationFn: (key: string) => api.addAsset(communityId, key), // PROPOSED
    onMutate: () => setError(null),
    onError: () => setError("Could not add that asset. Try again."),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["community"] }); qc.invalidateQueries({ queryKey: ["members"] }); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="add-asset-title" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[85dvh] w-full max-w-lg overflow-hidden rounded-t-2xl border bg-bg-2 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div>
            <h2 id="add-asset-title" className="font-heading text-lg font-semibold">Add an asset</h2>
            <p className="mt-0.5 text-xs text-muted">Pick from the catalog. One of each per community.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-text">×</button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto border-b px-4 py-2">
          {CATEGORIES.map(c => (
            <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c} className={clsx("shrink-0 rounded-full border px-2.5 py-1 text-[11px]", category === c ? "border-lime bg-lime-tint text-lime" : "bg-surface text-muted hover:text-text")}>{c}</button>
          ))}
        </div>
        <div className="max-h-[55dvh] overflow-auto p-3">
          {isLoading && <p className="p-4 text-sm text-muted">Loading catalog…</p>}
          <ul className="space-y-2">
            {shown.map(entry => {
              const added = addedKeys.has(entry.key);
              return (
                <li key={entry.key} className="flex items-start gap-3 rounded-xl border bg-surface p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-bg-2 text-sm" aria-hidden="true">{KIND_ICON[entry.kind]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium"># {entry.name}</span>
                      <span className="shrink-0 rounded border px-1 py-0.5 text-[9px] text-muted">{posterLabel(entry)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{entry.description}</p>
                  </div>
                  <Button size="sm" variant={added ? "secondary" : "primary"} disabled={added || add.isPending} onClick={() => add.mutate(entry.key)} className="shrink-0">
                    {added ? "Added" : add.isPending && add.variables === entry.key ? "Adding…" : "Add"}
                  </Button>
                </li>
              );
            })}
          </ul>
          {!isLoading && shown.length === 0 && <p className="p-4 text-center text-sm text-muted">Nothing left to add in this category.</p>}
          {error && <p className="p-2 text-xs text-red-400" role="alert">{error}</p>}
        </div>
        <div className="flex justify-end border-t p-3">
          <Button variant="ghost" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}
