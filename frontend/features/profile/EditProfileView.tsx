"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatUsername, getInitials, plural } from "@square/shared";
import Image from "next/image";
import clsx from "clsx";

function isImageUrl(v?: string | null): v is string {
  return !!v && (v.startsWith("/") || v.startsWith("http") || v.startsWith("data:") || v.startsWith("blob:"));
}

export function EditProfileView() {
  "use client";
  const router = useRouter();
  const qc = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const [bio, setBio] = useState("");
  const [status, setStatus] = useState("");
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [showBirthday, setShowBirthday] = useState(true);
  const [appearOffline, setAppearOffline] = useState(false);
  const [showCommunities, setShowCommunities] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({ queryKey: ["me"], queryFn: () => api.me(), staleTime: 30_000 });

  useEffect(() => {
    if (!data) return;
    setBio(data.bio || "");
    setStatus(data.status || "");
    setDepartment(data.department || "");
    setLevel(data.level || "");
    setInterests(data.skills || []);
    setLinks(data.links || []);
    setShowBirthday(data.showBirthday !== false);
  }, [data]);

  const fields = [bio, status, department, level, interests, links];
  useEffect(() => { if (data) setDirty(false); }, [data, ...fields]);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateMe({ bio, status, department, level, skills: interests, links, showBirthday });
      await qc.invalidateQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["profile", data?.username] });
      router.push(`/u/${data?.username}`);
    } catch {
      // noop
    } finally {
      setSaving(false);
      setDirty(false);
    }
  };

  if (!data) return <div className="p-6">Loading…</div>;

  return (
    <div className="min-h-[100dvh] flex flex-col p-4 lg:p-6 gap-6">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
        </Link>
        <h1 className="font-heading text-lg font-semibold">Edit profile</h1>
      </div>

      <section className="rounded-xl border bg-surface p-6 flex flex-col gap-4 lg:flex-row">
        <div className="flex-1 min-w-0">
          <div className="relative h-32 overflow-hidden bg-surface-hi rounded-xl mb-4">
            {isImageUrl(data.bannerUrl) ? (
              <Image src={data.bannerUrl} alt="" fill className="object-cover" sizes="100vw" />
            ) : (
              <div className="h-full w-full bg-surface-hi" />
            )}
            {bannerFile && (
              <Image src={URL.createObjectURL(bannerFile)} alt="" fill className="object-cover" sizes="100vw" />
            )}
            <label className="absolute right-3 bottom-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-lime text-bg cursor-pointer hover:bg-lime-hover">
              <input type="file" className="sr-only" accept="image/*" onChange={e => setBannerFile(e.target.files?.[0] || null)} />
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 16c1.1 0 2-.9 2-2h14c1.1 0 2-.9 2-2v0c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v0c0 1.1.9 2 2 2z" /><path d="M20 4v6" /><path d="M14 2h6v6" /></svg>
            </label>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative h-20 w-20 rounded-full border-4 border-[var(--surface)] bg-surface-hi flex items-center justify-center">
              {isImageUrl(data.avatarUrl) ? (
                <Image src={data.avatarUrl} alt={`Avatar of ${formatUsername(data.username)}`} width={80} height={80} className="rounded-full object-cover" sizes="80px" />
              ) : (
                <div className="h-20 w-20 rounded-full bg-surface-hi flex items-center justify-center font-heading text-xl font-bold text-lime">{getInitials(data.username)}</div>
              )}
              {avatarFile && (
                <Image src={URL.createObjectURL(avatarFile)} alt="" width={80} height={80} className="rounded-full object-cover" sizes="80px" />
              )}
              <label className="absolute right-0 bottom-0 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-lime text-bg cursor-pointer hover:bg-lime-hover">
                <input type="file" className="sr-only" accept="image/*" onChange={e => setAvatarFile(e.target.files?.[0] || null)} />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 16c1.1 0 2-.9 2-2h14c1.1 0 2-.9 2-2v0c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v0c0 1.1.9 2 2 2z" /><path d="M20 4v6" /><path d="M14 2h6v6" /></svg>
              </label>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Username</label>
              <input className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" value={formatUsername(data.username)} readOnly />
              <p className="text-[10px] text-muted mt-1">Username is read-only.</p>
            </div>
          </div>
        </div>
        <div className="hidden lg:flex lg:flex-col lg:w-80 gap-4">
          <PreviewCard data={data} />
        </div>
      </section>

      <section className="rounded-xl border bg-surface p-6 flex-1">
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">Bio</label>
            <textarea
              value={bio} onChange={e => { setBio(e.target.value); setDirty(true); }}
              rows={4} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:border-blue-strong"
              placeholder="Tell people about yourself…" maxLength={160}
            />
            <div className="flex justify-end mt-1">
              <span className="text-[10px] text-muted">{bio.length}/160</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">Status line</label>
            <input value={status} onChange={e => { setStatus(e.target.value); setDirty(true); }} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:border-blue-strong" placeholder="e.g. Building campus products…" maxLength={80} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">Department</label>
              <input value={department} onChange={e => { setDepartment(e.target.value); setDirty(true); }} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:border-blue-strong" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">Level / year</label>
              <input value={level} onChange={e => { setLevel(e.target.value); setDirty(true); }} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:border-blue-strong" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">Interests (max 8)</label>
            <div className="flex flex-wrap gap-2">
              {interests.map((s, i) => (
                <span key={i} className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs">
                  {s}
                  <button type="button" onClick={() => { setInterests(interests.filter((_, k) => k !== i)); setDirty(true); }} className="text-muted hover:text-text">✕</button>
                </span>
              ))}
              <button type="button" onClick={() => {
                const v = window.prompt("Add interest");
                if (v && interests.length < 8) { setInterests([...interests, v]); setDirty(true); }
              }} disabled={interests.length >= 8} className="text-[11px] rounded-full border border-border bg-surface px-2 py-1 text-muted hover:border-lime/60 disabled:opacity-40">+</button>
              {interests.length >= 8 && <span className="text-[10px] text-muted mt-1">Maximum 8 interests reached</span>}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">Links</label>
            <div className="space-y-2">
              {links.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <input value={l.label} onChange={e => { const n = [...links]; n[i] = { ...n[i], label: e.target.value }; setLinks(n); setDirty(true); }} className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none" placeholder="Label" />
                  <input value={l.url} onChange={e => { const n = [...links]; n[i] = { ...n[i], url: e.target.value }; setLinks(n); setDirty(true); }} className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none" placeholder="https://" />
                  <button type="button" onClick={() => { setLinks(links.filter((_, k) => k !== i)); setDirty(true); }} className="text-muted hover:text-text">✕</button>
                </div>
              ))}
              <button type="button" onClick={() => { setLinks([...links, { label: "", url: "" }]); setDirty(true); }} className="text-[11px] text-lime hover:underline">Add link</button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-surface p-6">
        <h2 className="font-heading font-semibold mb-4">Privacy</h2>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={showBirthday} onChange={e => { setShowBirthday(e.target.checked); setDirty(true); }} className="rounded border border-border bg-surface text-lime focus:ring-blue-strong" />
            <span><span className="font-medium">Let people in my communities celebrate my birthday</span><br /><span className="text-[11px] text-muted">Day and month only</span></span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={appearOffline} onChange={e => { setAppearOffline(e.target.checked); setDirty(true); }} className="rounded border border-border bg-surface text-lime focus:ring-blue-strong" />
            <span className="font-medium">Appear offline</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={showCommunities} onChange={e => { setShowCommunities(e.target.checked); setDirty(true); }} className="rounded border border-border bg-surface text-lime focus:ring-blue-strong" />
            <span><span className="font-medium">Show my communities on my profile</span><br /><span className="text-[11px] text-muted">Default on</span></span>
          </label>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
        <Link href={`/u/${data.username}`} className="inline-flex items-center rounded-lg border bg-surface px-3 py-1.5 text-sm text-muted hover:bg-surface-hi">Cancel</Link>
        <span className="text-[11px] text-muted">{dirty ? "Unsaved changes" : ""}</span>
        <button type="button" onClick={save} disabled={!dirty || saving} className="inline-flex items-center rounded-lg border border-lime bg-lime text-bg px-4 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-lime-hover">{saving ? "Saving…" : "Save changes"}</button>
      </div>
    </div>
  );
}

function PreviewCard({ data }: { data: any }) {
  return (
    <div className="rounded-xl border bg-surface p-4 space-y-4">
      <h2 className="font-heading font-semibold text-xs uppercase tracking-wide text-muted mb-2">Preview</h2>
      <div className="h-24 w-full rounded-lg bg-surface-hi mb-2" />
      <div className="h-12 w-12 rounded-full bg-surface-hi mb-2" />
      <div className="h-4 w-1/3 bg-surface-hi" />
      <div className="h-3 w-1/2 bg-surface-hi" />
      <div className="flex gap-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-6 w-1/3 rounded-full bg-surface-hi" />
        ))}
      </div>
    </div>
  );
}
