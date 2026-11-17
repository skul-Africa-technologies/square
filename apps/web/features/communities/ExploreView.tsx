"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { Chip } from "@/components/ui/chip";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty } from "@/components/ui/empty";

const FILTERS = ["My school", "Web3", "Web2", "Design", "AI"] as const;

export function ExploreView() {
  const [filter, setFilter] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["communities", filter],
    queryFn: () => api.listCommunities({ filter: filter || undefined }), // PROPOSED endpoint usage
    staleTime: 30_000,
  });
  const items = data?.items ?? [];
  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Explore</h1>
          <p className="text-sm text-muted">Find communities building on your campus.</p>
        </div>
        <Button variant="secondary">Create community</Button>
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map(f => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(filter === f ? null : f)}>{f}</Chip>
        ))}
      </div>
      {isLoading && <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>}
      {error && <Empty title="Could not load communities" hint="Try again in a moment." />}
      {!isLoading && !error && items.length === 0 && <Empty title="No communities found" hint="Try a different filter." />}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map(c => (
          <Card key={c.id} className="flex flex-col gap-3">
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
              <Link href={`/c/${c.slug}`} prefetch={false} className="inline-flex items-center rounded-lg bg-lime text-bg px-3 py-1.5 text-sm font-medium hover:bg-lime-hover">Join</Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
