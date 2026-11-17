"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { Chip } from "@/components/ui/chip";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty } from "@/components/ui/empty";
import type { Channel, Community } from "@square/shared";

const FILTERS = ["My school", "Web3", "Web2", "Design", "AI"] as const;

export function ExploreView() {
  const [mode, setMode] = useState<"communities" | "channels">("communities");
  const [filter, setFilter] = useState<string | null>(null);
  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Explore</h1>
          <p className="text-sm text-muted">Find communities and channels on your campus.</p>
        </div>
        <div className="flex rounded-lg border bg-surface p-1">
          <button className={`px-3 py-1.5 text-sm rounded-md ${mode === "communities" ? "bg-bg-2 text-text" : "text-muted"}`} onClick={() => setMode("communities")}>Communities</button>
          <button className={`px-3 py-1.5 text-sm rounded-md ${mode === "channels" ? "bg-bg-2 text-text" : "text-muted"}`} onClick={() => setMode("channels")}>Channels</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map(f => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(filter === f ? null : f)}>{f}</Chip>
        ))}
      </div>
      {mode === "communities" ? <Communities filter={filter} /> : <Channels filter={filter} />}
    </div>
  );
}

function Communities({ filter }: { filter: string | null }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["communities", filter],
    queryFn: () => api.listCommunities({ filter: filter || undefined }), // PROPOSED
    staleTime: 30_000,
  });
  const items = data?.items ?? [];
  if (isLoading) return <GridSkeleton />;
  if (error) return <Empty title="Could not load communities" hint="Try again in a moment." />;
  if (items.length === 0) return <Empty title="No communities found" hint="Try a different filter." />;
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {items.map(c => <CommunityCard key={c.id} c={c} />)}
    </div>
  );
}

function CommunityCard({ c }: { c: Community }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-lime-tint text-lime flex items-center justify-center font-semibold">{c.avatar || c.name.slice(0, 2).toUpperCase()}</div>
          <div>
            <h2 className="font-heading font-semibold">{c.name}</h2>
            <p className="text-xs text-muted">{c.memberCount} members</p>
          </div>
        </div>
        <span className="text-xs rounded-full border px-2 py-0.5 text-muted">{c.category}</span>
      </div>
      <p className="text-sm text-muted flex-1">{c.blurb}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{c.schoolName}</span>
        <Link href={`/c/${c.slug}`} prefetch={false} className="inline-flex items-center rounded-lg border bg-bg-2 px-3 py-1.5 text-sm font-medium hover:bg-surface-hi">View</Link>
      </div>
    </Card>
  );
}

function Channels({ filter }: { filter: string | null }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["channels-explore", filter],
    queryFn: () => api.listChannels(undefined, { filter: filter || undefined }), // PROPOSED
    staleTime: 30_000,
  });
  const items = data ?? [];
  if (isLoading) return <GridSkeleton />;
  if (error) return <Empty title="Could not load channels" hint="Try again in a moment." />;
  if (items.length === 0) return <Empty title="No channels found" hint="Try a different filter." />;
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {items.map(ch => <ChannelCard key={ch.id} ch={ch} filter={filter} />)}
    </div>
  );
}

function ChannelCard({ ch, filter }: { ch: Channel; filter: string | null }) {
  const qc = useQueryClient();
  const join = useMutation({
    mutationFn: () => api.joinChannel(ch.id), // PROPOSED
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["channels-explore"] }); qc.invalidateQueries({ queryKey: ["my-channels"] }); qc.invalidateQueries({ queryKey: ["home-feed"] }); },
  });
  const leave = useMutation({
    mutationFn: () => api.leaveChannel(ch.id), // PROPOSED
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["channels-explore"] }); qc.invalidateQueries({ queryKey: ["my-channels"] }); qc.invalidateQueries({ queryKey: ["home-feed"] }); },
  });
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading font-semibold"># {ch.name}</h2>
          <p className="text-xs text-muted">{ch.communityName}</p>
        </div>
        {ch.interest && <span className="text-xs rounded-full border px-2 py-0.5 text-muted">{ch.interest}</span>}
      </div>
      <p className="text-sm text-muted flex-1">{ch.description}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{ch.memberCount ?? 0} members</span>
        <div className="flex items-center gap-2">
          <Link href={`/c/${ch.communitySlug || "web3-club"}/${ch.slug}/general`} prefetch={false} className="text-sm text-muted hover:text-text">View</Link>
          {ch.joined ? (
            <Button size="sm" variant="secondary" onClick={() => leave.mutate()} disabled={leave.isPending}>Joined</Button>
          ) : (
            <Button size="sm" onClick={() => join.mutate()} disabled={join.isPending}>Join</Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function GridSkeleton() {
  return <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>;
}
