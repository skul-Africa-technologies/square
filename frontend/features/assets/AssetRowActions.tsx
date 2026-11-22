"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Ellipsis, LockKeyhole, Volume2, VolumeX } from "lucide-react";
import { ADD_ASSET_ROLES, type Asset, type AssetPermissions, type Role } from "@square/shared";
import { api } from "@/lib/api";
import clsx from "clsx";

const mutedStorageKey = "square:muted-assets";

function canManage(role: Role | null): boolean {
  return role !== null && (ADD_ASSET_ROLES as readonly Role[]).includes(role);
}

function readMutedAssets(): string[] {
  try {
    const stored = localStorage.getItem(mutedStorageKey);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) && parsed.every((id) => typeof id === "string") ? parsed : [];
  } catch {
    return [];
  }
}

export function AssetRowActions({ asset, communitySlug, role, className, children }: {
  asset: Asset;
  communitySlug: string;
  role: Role | null;
  className?: string;
  children?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [muted, setMuted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<AssetPermissions>(asset.permissions);
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPress = useRef(false);
  const removable = canManage(role) && !asset.isDefault;
  const canEditPermissions = role === "owner";
  const canManageAsset = canManage(role);

  useEffect(() => {
    setMuted(readMutedAssets().includes(asset.id));
  }, [asset.id]);

  useEffect(() => () => {
    if (touchTimer.current) clearTimeout(touchTimer.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const remove = useMutation({
    mutationFn: () => api.deleteAsset(asset.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["community", communitySlug] }),
        queryClient.invalidateQueries({ queryKey: ["community-assets", communitySlug] }),
      ]);
      setConfirming(false);
      setOpen(false);
    },
  });
  const edit = useMutation({
    mutationFn: () => api.updateAssetPermissions(asset.id, permissions),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["community", communitySlug] });
      setEditing(false);
    },
  });

  const toggleMute = () => {
    try {
      const next = new Set(readMutedAssets());
      if (next.has(asset.id)) next.delete(asset.id);
      else next.add(asset.id);
      localStorage.setItem(mutedStorageKey, JSON.stringify([...next]));
      setMuted(next.has(asset.id));
    } catch {
      setActionError("Could not save this asset's mute setting.");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/c/${communitySlug}/${asset.slug}`);
      setCopied(true);
    } catch {
      setActionError("Could not copy the asset link.");
    }
  };

  const togglePermission = (field: keyof AssetPermissions, targetRole: Role, checked: boolean) => {
    setPermissions((current) => {
      const updated = { ...current, [field]: checked
        ? [...new Set([...current[field], targetRole])]
        : current[field].filter((value) => value !== targetRole) };
      if (field === "canRead" && !checked) {
        updated.canPost = updated.canPost.filter((value) => value !== targetRole);
        updated.canPin = updated.canPin.filter((value) => value !== targetRole);
      }
      return updated;
    });
  };

  return (
    <div
      className={clsx("group relative", className)}
      onContextMenu={(event) => { if (canManageAsset) { event.preventDefault(); setOpen(true); } }}
      onTouchStart={() => {
        if (!canManageAsset) return;
        if (touchTimer.current) clearTimeout(touchTimer.current);
        longPress.current = false;
        touchTimer.current = setTimeout(() => { longPress.current = true; setOpen(true); }, 500);
      }}
      onTouchEnd={(event) => {
        if (touchTimer.current) clearTimeout(touchTimer.current);
        touchTimer.current = null;
        if (longPress.current) event.preventDefault();
      }}
      onTouchMove={() => {
        if (touchTimer.current) clearTimeout(touchTimer.current);
        touchTimer.current = null;
      }}
      onTouchCancel={() => {
        if (touchTimer.current) clearTimeout(touchTimer.current);
        touchTimer.current = null;
      }}
      onClickCapture={(event) => {
        if (longPress.current) {
          event.preventDefault();
          event.stopPropagation();
          longPress.current = false;
        }
      }}
    >
      {children}
      {canManageAsset && (
        <button
          type="button"
          aria-label={`Asset options # ${asset.name}`}
          aria-expanded={open}
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen((value) => !value); }}
          className="absolute right-1 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-surface-hi hover:text-text focus-visible:opacity-100 md:flex md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
        >
          <Ellipsis className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      {open && (
        <div role="menu" aria-label={`Asset actions for # ${asset.name}`} className="absolute right-0 top-full z-30 min-w-44 rounded-lg border border-border bg-bg-2 p-1 shadow-xl">
          <button type="button" role="menuitem" onClick={toggleMute} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted hover:bg-surface hover:text-text">
            {muted ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            {muted ? "Unmute" : "Mute"}
          </button>
          <button type="button" role="menuitem" onClick={() => void copyLink()} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted hover:bg-surface hover:text-text">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Link copied" : "Copy link"}
          </button>
          {canEditPermissions && (
            <button type="button" role="menuitem" onClick={() => { setPermissions(asset.permissions); setEditing(true); setOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted hover:bg-surface hover:text-text">
              <LockKeyhole className="h-3.5 w-3.5" />
              Edit permissions
            </button>
          )}
          {removable && (
            <button type="button" role="menuitem" onClick={() => setConfirming(true)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-red-300 hover:bg-red-400/10">
              Remove asset
            </button>
          )}
          {actionError && <p role="alert" className="px-2 py-1 text-[11px] text-red-300">{actionError}</p>}
        </div>
      )}
      {confirming && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirming(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby={`remove-asset-${asset.id}`} className="w-full max-w-[480px] rounded-t-[var(--sheet-radius)] border border-border bg-bg-2 p-5 sm:rounded-2xl">
            <h2 id={`remove-asset-${asset.id}`} className="font-heading text-base font-semibold">Remove # {asset.name}?</h2>
            <p className="mt-2 text-sm text-muted">Its content will be deleted.</p>
            {remove.isError && <p role="alert" className="mt-3 text-xs text-red-300">Could not remove the asset. Try again.</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:bg-surface">Cancel</button>
              <button type="button" onClick={() => remove.mutate()} disabled={remove.isPending} className="rounded-lg bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50">{remove.isPending ? "Removing…" : "Remove asset"}</button>
            </div>
          </section>
        </div>
      )}
      {editing && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby={`edit-asset-${asset.id}`} className="w-full max-w-[480px] rounded-t-[var(--sheet-radius)] border border-border bg-bg-2 p-5 sm:rounded-2xl">
            <h2 id={`edit-asset-${asset.id}`} className="font-heading text-base font-semibold">Edit permissions for # {asset.name}</h2>
            <div className="mt-4 space-y-3">
              {(["canRead", "canPost", "canPin"] as const).map((field) => (
                <fieldset key={field} className="rounded-lg border border-border p-3">
                  <legend className="px-1 text-xs font-semibold text-muted">{field === "canRead" ? "Can read" : field === "canPost" ? "Can post" : "Can pin"}</legend>
                  <div className="mt-1 flex flex-wrap gap-3">
                    {(["owner", "moderator", "member"] as const).map((targetRole) => (
                      <label key={targetRole} className="flex items-center gap-1.5 text-xs capitalize text-muted">
                        <input
                          type="checkbox"
                          checked={permissions[field].includes(targetRole)}
                          disabled={field !== "canRead" && !permissions.canRead.includes(targetRole)}
                          onChange={(event) => togglePermission(field, targetRole, event.target.checked)}
                        />
                        {targetRole}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            {edit.isError && <p role="alert" className="mt-3 text-xs text-red-300">Could not update permissions.</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:bg-surface">Cancel</button>
              <button type="button" onClick={() => edit.mutate()} disabled={edit.isPending} className="rounded-lg bg-lime px-3 py-2 text-sm font-semibold text-bg hover:bg-lime-hover disabled:opacity-50">{edit.isPending ? "Saving…" : "Save changes"}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
