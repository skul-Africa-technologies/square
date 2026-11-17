"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { copy } from "@/lib/copy";
import { Skeleton } from "@/components/ui/skeleton";
import { campaigns } from "@/lib/api/seed";

export default function MobileHome() {
  const { data: myChannels, isLoading: chLoading } = useQuery({ queryKey: ["my-channels"], queryFn: () => api.myChannels() }); // PROPOSED
  const { data: feed, isLoading: feedLoading } = useQuery({ queryKey: ["home-feed"], queryFn: () => api.homeFeed() }); // PROPOSED
  const { data: suggested } = useQuery({ queryKey: ["channels-explore", null], queryFn: () => api.listChannels() }); // PROPOSED
  const live = campaigns.find(c => c.status === "active");
  const suggestions = (suggested || []).filter(c => !c.joined).slice(0, 6);
  return (
    <div className="p-4 space-y-6 max-w-3xl mx-auto">
      <header>
        <p className="text-muted text-sm">{copy.home.greeting}</p>
        <h1 className="font-heading text-2xl font-semibold">{copy.home.title}</h1>
      </header>
      <section>
        <h2 className="font-heading text-sm mb-2">Your joined channels</h2>
        {chLoading && <Skeleton className="h-20" />}
        <div className="flex gap-3 overflow-x-auto pb-1">
          {(myChannels || []).map(c => (
            <Link key={c.id} href={`/c/${c.communitySlug || "web3-club"}/${c.slug}/general`} prefetch={false} className="min-w-[140px] rounded-xl border bg-surface p-3">
              <div className="text-xs text-muted truncate">{c.communityName}</div>
              <div className="text-sm font-medium truncate"># {c.name}</div>
              <div className="text-xs text-muted mt-1">{c.interest}</div>
            </Link>
          ))}
          {!chLoading && (myChannels || []).length === 0 && <p className="text-sm text-muted">Join channels to see them here.</p>}
        </div>
      </section>
      <section>
        <h2 className="font-heading text-sm mb-2">Latest from your channels</h2>
        {feedLoading && <Skeleton className="h-32" />}
        <div className="space-y-2">
          {(feed?.items || []).map(p => (
            <Link key={p.id} href={`/c/${p.communitySlug || "web3-club"}/${p.channelSlug || "general"}/general`} prefetch={false} className="block rounded-xl border bg-surface p-3">
              <div className="text-xs text-muted mb-1">#{p.channelName || "channel"}</div>
              <p className="text-sm line-clamp-2">{p.content}</p>
            </Link>
          ))}
          {!feedLoading && (feed?.items || []).length === 0 && <p className="text-sm text-muted">No recent posts yet.</p>}
        </div>
      </section>
      <section>
        <h2 className="font-heading text-sm mb-2">Suggested channels</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          {suggestions.map(c => (
            <Link key={c.id} href={`/c/${c.communitySlug || "web3-club"}/${c.slug}/general`} prefetch={false} className="rounded-xl border bg-surface p-3">
              <div className="flex items-center justify-between"><span className="font-medium"># {c.name}</span><span className="text-xs text-muted">{c.interest}</span></div>
              <div className="text-xs text-muted">{c.communityName}</div>
            </Link>
          ))}
        </div>
      </section>
      {live && (
        <section className="rounded-xl border bg-surface p-4">
          <div className="text-xs text-lime mb-1">Campaign in your channels</div>
          <div className="font-heading text-lg">{live.title}</div>
          <div className="text-sm text-muted mt-1">{live.joined} of {live.target} joined</div>
        </section>
      )}
    </div>
  );
}
