"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { validateUpload } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CATEGORIES = ["Web3", "Web2", "Design", "AI", "Robotics", "Writing", "Other"];

export function CreateCommunityModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [blurb, setBlurb] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [banner, setBanner] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => first.current?.focus(), 20);
    return () => { document.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [open, onClose]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Give your community a name."); return; }
    if (banner) {
      const bad = validateUpload("banner", banner);
      if (bad) { setError(bad); return; }
      await api.signUpload({ kind: "banner" }); // PROPOSED
    }
    setSaving(true);
    try {
      const c = await api.createCommunity({ name: name.trim(), blurb: blurb.trim(), category });
      await qc.invalidateQueries({ queryKey: ["my-communities"] });
      onClose();
      router.push(`/c/${c.slug}`);
    } catch {
      setError("Could not create the community. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="create-community-title" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Sheet dropdown — mobile full-width bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        <form onSubmit={submit} className="rounded-t-[28px] border-t border-b border-border bg-bg-2 shadow-2xl p-6 sm:p-8 animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center justify-between gap-3 mb-5">
            <h2 id="create-community-title" className="font-heading text-lg font-semibold">Create a community</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="h-9 w-9 rounded-full bg-surface flex items-center justify-center text-muted hover:bg-surface-hi hover:text-text">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <div className="space-y-5">
            <label className="block text-[11px] font-medium text-muted uppercase tracking-wider mb-1">
              Community name
            </label>
            <Input ref={first} value={name} onChange={e => { setName(e.target.value); setError(null); }} placeholder="e.g. Robotics Club" className="mt-1 w-full rounded-lg border bg-bg-2 px-3.5 py-3 text-sm text-text placeholder:text-muted focus:border-blue-strong focus:outline-none" maxLength={60} />
            <label className="block text-[11px] font-medium text-muted uppercase tracking-wider mb-1">
              Description <span className="text-muted/60 font-normal ml-1">(optional)</span>
            </label>
            <textarea value={blurb} onChange={e => setBlurb(e.target.value)} rows={3} maxLength={200} placeholder="What is this community about?" className="mt-1 w-full rounded-lg border bg-bg-2 px-3.5 py-3 text-sm text-text placeholder:text-muted focus:border-blue-strong focus:outline-none resize-none" />
            <label className="block text-[11px] font-medium text-muted uppercase tracking-wider mb-1">
              Interest category
            </label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="mt-1 w-full rounded-lg border bg-bg-2 px-3.5 py-3 text-sm text-text focus:border-blue-strong focus:outline-none appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22><path d=%22M19 9l-5 5-5-5%22/></svg>')] bg-no-repeat bg-right-[10px] bg-center-y">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="block text-[11px] font-medium text-muted uppercase tracking-wider mb-1">
              Banner <span className="text-muted/60 font-normal ml-1">(optional, 5 MB max)</span>
            </label>
            <input type="file" accept="image/*" onChange={e => setBanner(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-xs text-muted file:mr-2 file:rounded-lg file:border file:bg-surface file:px-2.5 file:py-1.5 file:text-xs file:text-text" />
            {error && <p className="text-[11px] text-red-400" role="alert">{error}</p>}
          </div>
          <div className="mt-7 flex flex-col gap-3">
            <button type="submit" disabled={saving} className="w-full h-11 rounded-lg bg-lime text-bg font-semibold text-sm flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-strong focus:ring-offset-1 disabled:opacity-60">
              {saving ? "Creating…" : "Create community"}
            </button>
            <button type="button" onClick={onClose} className="w-full h-10 rounded-lg border border-border/60 bg-transparent text-text font-medium text-sm hover:bg-surface-hi focus:outline-none focus:ring-2 focus:ring-blue-strong focus:ring-offset-1">
              Cancel
            </button>
          </div>
          <p className="mt-5 text-[10px] text-muted/80 text-center">A home for a club, class, or idea on campus.</p>
        </form>
      </div>
      {/* Desktop modal */}
      <div className="hidden md:flex items-center justify-center p-6 fixed inset-0 z-50">
        <form onSubmit={submit} className="w-full max-w-md rounded-[20px] border border-border bg-bg-2 p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 id="create-community-title" className="font-heading text-lg font-semibold">Create a community</h2>
              <p className="mt-1 text-xs text-muted">A home for a club, class, or idea on campus.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-text">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <div className="space-y-4">
            <label className="block text-xs text-muted">
              Community name
              <Input ref={first} value={name} onChange={e => { setName(e.target.value); setError(null); }} placeholder="e.g. Robotics Club" className="mt-1" maxLength={60} />
            </label>
            <label className="block text-xs text-muted">
              Description <span className="text-muted/70">(optional)</span>
              <textarea value={blurb} onChange={e => setBlurb(e.target.value)} rows={3} maxLength={200} placeholder="What is this community about?" className="mt-1 w-full resize-none rounded-lg border bg-bg-2 px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-blue-strong focus:outline-none" />
            </label>
            <label className="block text-xs text-muted">
              Interest category
              <select value={category} onChange={e => setCategory(e.target.value)} className="mt-1 w-full rounded-lg border bg-bg-2 px-3 py-2.5 text-sm text-text focus:border-blue-strong focus:outline-none">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block text-xs text-muted">
              Banner <span className="text-muted/70">(optional, 5 MB max)</span>
              <input type="file" accept="image/*" onChange={e => setBanner(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border file:bg-surface file:px-3 file:py-1.5 file:text-xs file:text-text" />
            </label>
            {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create community"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
