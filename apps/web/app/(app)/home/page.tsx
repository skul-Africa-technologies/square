import Link from "next/link";
import { communities, campaigns, projects } from "@/lib/api/seed";

export default function MobileHome() {
  const live = campaigns[0];
  const needing = projects.filter(p => p.rolesNeeded.length > 0);
  return (
    <div className="p-4 space-y-6">
      <header>
        <p className="text-muted text-sm">Good evening</p>
        <h1 className="font-heading text-2xl font-semibold">Build something today</h1>
      </header>
      <section>
        <h2 className="font-heading text-sm mb-2">Your communities</h2>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {communities.slice(0,4).map(c => (
            <Link key={c.id} href={`/c/${c.slug}`} className="min-w-[120px] rounded-xl border bg-surface p-3">
              <div className="h-8 w-8 rounded-lg bg-lime-tint text-lime flex items-center justify-center text-xs font-semibold mb-2">{c.avatar}</div>
              <div className="text-sm font-medium truncate">{c.name}</div>
            </Link>
          ))}
        </div>
      </section>
      <section className="rounded-xl border bg-surface p-4">
        <div className="text-xs text-lime mb-1">Live campaign</div>
        <div className="font-heading text-lg">{live.title}</div>
        <div className="text-sm text-muted mt-1">{live.joined} of {live.target} testers joined</div>
        <div className="mt-3 h-2 w-full rounded-full bg-bg-2"><div className="h-full bg-lime rounded-full" style={{width:`${(live.joined/live.target)*100}%`}}/></div>
      </section>
      <section>
        <h2 className="font-heading text-sm mb-2">Projects needing you</h2>
        <div className="space-y-2">
          {needing.map(p => (
            <div key={p.id} className="rounded-xl border bg-surface p-3">
              <div className="font-medium">{p.title}</div>
              <div className="text-xs text-muted">Needs: {p.rolesNeeded.join(", ")}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
