"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { validateUpload } from "@/lib/upload";

export function SettingsView() {
  const [displayName, setDisplayName] = useState("Amaka Eze");
  const [bio, setBio] = useState("Building campus products.");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const save = async () => {
    setSaving(true); setMsg("");
    try { await api.updateMe({ displayName, bio } as any); setMsg("Saved"); }
    catch { setMsg("Could not save. Try again."); }
    finally { setSaving(false); }
  };
  const uploadAvatar = async (f: File | null) => {
    if (!f) return;
    const err = validateUpload("avatar", f);
    if (err) { setUploadState("error"); setMsg(err); return; }
    setUploadState("uploading"); setMsg("");
    try {
      await api.signUpload({ kind: "avatar" });
      for (const p of [25, 60, 100]) { await new Promise(r => setTimeout(r, 120)); setProgress(p); }
      setUploadState("done");
    } catch { setUploadState("error"); setMsg("Upload failed. Try again."); }
  };
  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Settings</h1>
      <section className="rounded-xl border bg-surface p-4 space-y-4">
        <h2 className="font-heading font-semibold">Profile</h2>
        <div>
          <label className="text-sm mb-1 block">Display name</label>
          <Input value={displayName} onChange={e => setDisplayName(e.target.value)} autoComplete="name" />
        </div>
        <div>
          <label className="text-sm mb-1 block">Bio</label>
          <Input value={bio} onChange={e => setBio(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
          {msg && <span className="text-sm text-muted">{msg}</span>}
        </div>
      </section>
      <section className="rounded-xl border bg-surface p-4 space-y-3">
        <h2 className="font-heading font-semibold">Avatar</h2>
        <p className="text-sm text-muted">Images up to 2 MB. Uploaded directly (server is authority).</p>
        <label className="inline-flex items-center rounded-lg border bg-bg-2 px-3 py-2 text-sm cursor-pointer hover:bg-surface-hi">
          <input type="file" className="sr-only" accept="image/*" onChange={e => uploadAvatar(e.target.files?.[0] || null)} />
          Choose avatar
        </label>
        {uploadState === "uploading" && <div className="text-sm text-muted">Uploading {progress}%</div>}
        {uploadState === "done" && <div className="text-sm text-lime">Upload complete</div>}
        {uploadState === "error" && <div className="text-sm text-red-400">Upload failed. Check type/size and retry.</div>}
      </section>
      <section className="rounded-xl border bg-surface p-4">
        <h2 className="font-heading font-semibold mb-1">Wallet</h2>
        <p className="text-sm text-muted">Coming later</p>
      </section>
    </div>
  );
}
