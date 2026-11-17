"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toDisplayUsername } from "@square/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";

export function ProfileView({ username }: { username: string }) {
  const clean = username.replace(/^#/, "");
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["profile", clean], queryFn: () => api.getProfile(clean), staleTime: 30_000 }); // PROPOSED
  const msg = useMutation({
    mutationFn: () => api.getOrCreateConversation(clean), // PROPOSED
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ["conversations"] }); router.push(`/dm/${c.id}`); },
  });
  const block = useMutation({ mutationFn: () => api.blockUser(clean), onSuccess: () => qc.invalidateQueries({ queryKey: ["blocked"] }) }); // PROPOSED
  const report = useMutation({ mutationFn: () => api.reportUser(clean, "inappropriate", ""), onSuccess: () => { /* noop */ } }); // PROPOSED
  if (isLoading) return <div className="p-6 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>;
  if (error || !data) return <div className="p-6"><Empty title="Profile not found" hint="Try again later." /></div>;
  const isOwn = clean === "amaka-eze";
  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      <header className="rounded-xl border bg-surface p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="h-16 w-16 rounded-2xl bg-lime-tint text-lime flex items-center justify-center font-heading text-xl font-semibold">{clean.slice(0, 2).toUpperCase()}</div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold">{toDisplayUsername(data.username)}</h1>
            {data.verifiedStudent && <span className="text-xs rounded-full bg-lime-tint text-lime px-2 py-0.5">Verified student</span>}
          </div>
          <p className="text-sm text-muted">{data.schoolName || "FUT Minna"} · Joined {new Date(data.joinedAt).toLocaleDateString()}</p>
          <div className="flex flex-wrap gap-2 mt-2">{(data.skills || []).map(s => <span key={s} className="text-xs rounded-full border px-2 py-0.5 text-muted">{s}</span>)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isOwn ? <Link href="/settings" prefetch={false} className="inline-flex items-center rounded-lg border bg-bg-2 px-4 py-2 text-sm hover:bg-surface-hi">Edit profile</Link> : (
            <>
              <Button onClick={() => msg.mutate()} disabled={msg.isPending}>Message</Button>
              <Button variant="secondary" onClick={() => block.mutate()} disabled={block.isPending}>Block</Button>
              <Button variant="ghost" onClick={() => report.mutate()} disabled={report.isPending}>Report</Button>
            </>
          )}
        </div>
      </header>
      <section className="grid grid-cols-2 gap-3">
        <Stat label="Channels joined" value={data.channelsJoined || 0} />
        {(data.badges || []).length > 0 && <Stat label="Badges" value={(data.badges || []).length} />}
      </section>
      {(data.badges || []).length > 0 && (
        <section className="rounded-xl border bg-surface p-4">
          <h2 className="font-heading font-semibold mb-3">Badges</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(data.badges || []).map(b => (<div key={b.id} className="rounded-lg border bg-bg-2 p-3 text-sm text-center">{b.name}</div>))}
          </div>
        </section>
      )}
      {(data.projects || []).length > 0 && (
        <section className="rounded-xl border bg-surface p-4">
          <h2 className="font-heading font-semibold mb-3">Projects</h2>
          <div className="space-y-2">
            {(data.projects || []).map(p => (
              <div key={p.id} className="rounded-lg border bg-bg-2 p-3">
                <div className="flex items-center justify-between"><span className="font-medium">{p.title}</span><span className="text-xs text-lime capitalize">{p.status}</span></div>
                <p className="text-sm text-muted">{p.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="rounded-xl border bg-surface p-4">
        <h2 className="font-heading font-semibold mb-1">Wallet</h2>
        <p className="text-sm text-muted">Coming later</p>
      </section>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border bg-surface p-4 text-center"><div className="font-heading text-2xl font-semibold">{value}</div><div className="text-xs text-muted">{label}</div></div>;
}
