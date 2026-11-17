import Link from "next/link";
import { projects } from "@/lib/api/seed";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = projects.find(x => x.id === id) || projects[0];
  return (
    <AppShell>
      <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-lime capitalize mb-1">{p.status}</div>
            <h1 className="font-heading text-2xl font-semibold">{p.title}</h1>
            <p className="text-sm text-muted mt-1">{p.description}</p>
          </div>
          <Link href="/c/web3-club/general/projects" prefetch={false} className="text-sm text-muted hover:text-text">Back</Link>
        </div>
        <section className="rounded-xl border bg-surface p-4">
          <h2 className="font-heading font-semibold mb-2">Team</h2>
          <div className="flex items-center gap-2 text-sm text-muted">{p.teamCount} on the team: {p.team.map(t => `#${t.username}`).join(", ")}</div>
        </section>
        <section className="rounded-xl border bg-surface p-4">
          <h2 className="font-heading font-semibold mb-2">Milestones</h2>
          <ul className="space-y-2">{p.milestones.map(m => (<li key={m.id} className="flex items-center gap-2 text-sm"><span className={`h-4 w-4 rounded border flex items-center justify-center ${m.done ? "bg-lime border-lime text-bg" : "border-muted"}`}>{m.done ? "✓" : ""}</span>{m.text}</li>))}</ul>
        </section>
        <section className="rounded-xl border bg-surface p-4">
          <h2 className="font-heading font-semibold mb-2">Roles needed</h2>
          <div className="flex flex-wrap gap-2">{p.rolesNeeded.length ? p.rolesNeeded.map(r => <span key={r} className="text-xs rounded-full border px-2 py-1 text-muted">{r}</span>) : <span className="text-sm text-muted">No open roles</span>}</div>
          <div className="mt-3"><Button>Ask to join the team</Button></div>
        </section>
        <section className="rounded-xl border bg-surface p-4">
          <h2 className="font-heading font-semibold mb-2">Updates</h2>
          <div className="space-y-2">{p.updates.length ? p.updates.map(u => (<div key={u.id} className="rounded-lg bg-bg-2 p-2 text-sm"><div className="text-xs text-muted mb-1">{new Date(u.createdAt).toLocaleDateString()}</div>{u.text}</div>)) : <p className="text-sm text-muted">No updates yet</p>}</div>
        </section>
        {p.shippedRecord && <section className="rounded-xl border bg-surface p-4"><h2 className="font-heading font-semibold mb-1">Shipped record</h2><p className="text-sm text-muted">{p.shippedRecord}</p></section>}
      </div>
    </AppShell>
  );
}
