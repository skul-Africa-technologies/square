"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { compactNumber } from "@/lib/format";
import type { ExploreCommunity } from "@square/shared";
import { plural } from "@square/shared";
import { getInitials } from "@square/shared";
import { CreateCommunityModal } from "@/components/shell/CreateCommunityModal";
import { Skeleton } from "@/components/ui/skeleton";
import clsx from "clsx";
import { copy } from "@/lib/copy";

const CATEGORIES = ["All", "My school", "Web3", "Web2", "Design", "AI", "Robotics", "Writing"] as const;
type Sort = "top" | "new";

export function ExploreView() {
  return (
    <Suspense fallback={<div className="p-6"><Skeleton className="h-10 w-48" /></div>}>
      <ExploreInner />
    </Suspense>
  );
}

function ExploreInner() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const category = params.get("category") || "All";
  const sort = (params.get("sort") === "new" ? "new" : "top") as Sort;
  const q = params.get("q") || "";
  const [term, setTerm] = useState(q);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  function setParam(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v || v === "All" || (k === "sort" && v === "top")) sp.delete(k);
      else sp.set(k, v);
    }
    const s = sp.toString();
    router.replace(`/explore${s ? `?${s}` : ""}`, { scroll: false });
  }

  useEffect(() => {
    const t = setTimeout(() => { if (term !== q) setParam({ q: term || null }); }, 300);
    return () => clearTimeout(t);
  }, [term]);

  const communities = useInfiniteQuery({
    queryKey: ["explore-communities", category, sort, q],
    queryFn: ({ pageParam }) => api.exploreCommunities({ sort, category, q, cursor: pageParam || undefined }), // PROPOSED
    initialPageParam: "",
    getNextPageParam: last => last.nextCursor || undefined,
    staleTime: 20_000,
  });

  const join = useMutation({
    mutationFn: (c: ExploreCommunity) => api.joinCommunity(c.id), // PROPOSED
    onMutate: async (c) => {
      await qc.cancelQueries({ queryKey: ["explore-communities"] });
      const key = ["explore-communities", category, sort, q];
      const prev = qc.getQueryData(key);
      qc.setQueryData<typeof communities.data>(key, old => old ? {
        ...old,
        pages: old.pages.map(p => ({ ...p, items: p.items.map(i => i.id === c.id ? { ...i, relation: "member" as const, joined: true } : i) })),
      } : old);
      return { prev, key };
    },
    onError: (_e, _c, ctx) => { if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev); },
    onSuccess: (_d, c) => {
      setToast(`Joined ${c.name}`);
      setTimeout(() => setToast(null), 2600);
      qc.invalidateQueries({ queryKey: ["my-communities"] });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["explore-communities"] }),
  });

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting && communities.hasNextPage && !communities.isFetchingNextPage) communities.fetchNextPage();
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [communities]);

  const items = communities.data?.pages.flatMap(p => p.items) ?? [];
  const noMatch = !communities.isLoading && items.length === 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 pb-24 lg:px-6">
      <header className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-2xl font-semibold">Explore</h1>
          <p className="mt-0.5 text-sm text-muted">Public {copy.unit.plural} across campus.</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className="rounded-lg bg-lime px-3.5 py-2 text-sm font-medium text-bg hover:bg-lime-hover max-lg:w-full">Create a {copy.unit.name}</button>
      </header>

      <label className="mb-3 block">
        <span className="sr-only">Search public {copy.unit.plural}</span>
        <span className="flex items-center gap-2 rounded-lg border bg-bg-2 px-3 focus-within:border-blue-strong">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-muted" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={term} onChange={e => setTerm(e.target.value)} placeholder={`Search public ${copy.unit.plural}`} className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-muted" />
          {term && <button type="button" onClick={() => setTerm("")} aria-label="Clear search" className="text-muted hover:text-text">×</button>}
        </span>
      </label>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Categories">
          {CATEGORIES.map(c => (
            <button key={c} type="button" onClick={() => setParam({ category: c })} aria-pressed={category === c} className={clsx("rounded-full border px-3 py-1.5 text-xs transition", category === c ? (c === "Web3" ? "border-lime bg-lime-tint text-lime" : "border-blue-strong bg-blue-soft text-blue") : "bg-surface text-muted hover:text-text hover:border-blue-strong/40")}>{c}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-lg border bg-surface p-1" role="group" aria-label="Sort">
          {(["top", "new"] as Sort[]).map(s => (
            <button key={s} type="button" onClick={() => setParam({ sort: s })} aria-pressed={sort === s} className={clsx("rounded-md px-2.5 py-1 text-xs", sort === s ? "bg-bg-2 text-text" : "text-muted hover:text-text")}>{s === "top" ? "Top this week" : "New"}</button>
          ))}
        </div>
      </div>

      <section aria-labelledby="communities-heading">
        <h2 id="communities-heading" className="mb-2 font-heading text-sm font-semibold">Top {copy.unit.plural}</h2>
        {communities.isLoading ? (
          <div className="grid gap-2 sm:grid-cols-2">{[0,1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>
        ) : communities.isError ? (
          <div className="rounded-xl border bg-surface p-6 text-center">
            <p className="text-sm text-muted">Could not load {copy.unit.plural}.</p>
            <button type="button" onClick={() => communities.refetch()} className="mt-3 rounded-lg border px-3 py-1.5 text-sm hover:border-lime hover:text-lime">Retry</button>
          </div>
        ) : noMatch ? (
          <div className="rounded-xl border bg-surface p-8 text-center">
            <p className="text-sm text-muted">No {copy.unit.plural} match{q ? ` “${q}”` : " this filter"}.</p>
            <button type="button" onClick={() => { setTerm(""); setParam({ q: null, category: null }); }} className="mt-3 text-sm text-lime hover:underline">Clear filters</button>
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map(c => <CommunityCard key={c.id} c={c} onJoin={() => join.mutate(c)} joining={join.isPending && join.variables?.id === c.id} />)}
            </div>
            <div ref={sentinel} className="h-1" />
            {communities.isFetchingNextPage && <div className="mt-3 grid gap-2 sm:grid-cols-2">{[0,1,2].map(i => <Skeleton key={i} className="h-16" />)}</div>}
            {!communities.hasNextPage && items.length > 6 && <p className="mt-4 text-center text-xs text-muted">You're all caught up.</p>}
          </>
        )}
      </section>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-lime/40 bg-surface px-4 py-2 text-sm text-text shadow-xl">
          {toast}
        </div>
      )}

      <CreateCommunityModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function CommunityCard({ c, onJoin, joining }: { c: ExploreCommunity; onJoin: () => void; joining: boolean }) {
  const [menu, setMenu] = useState(false);
  const joined = c.relation === "member" || c.joined;
  const href = `/c/${c.slug}/general`;
  return (
    <article className="group relative overflow-hidden rounded-xl border bg-surface transition hover:border-lime/40">
      <Link href={href} prefetch={false} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-strong" aria-label={`Preview ${c.name}`}>
        <div className="aspect-[16/6] w-full overflow-hidden bg-[linear-gradient(135deg,#1f2b12,#0b0d0b)]" aria-hidden="true">
          <span className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-lime/10" />
          <span className="absolute left-6 top-4 text-[11px] uppercase tracking-[0.2em] text-lime/40">{c.schoolName || "FUT Minna"}</span>
        </div>
        <div className="p-3">
          <div className="flex items-start gap-2">
            <span className="-mt-8 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-surface bg-bg-2 text-xs font-semibold text-lime">{c.avatar || getInitials(c.name)}</span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold">{c.name}</h3>
              <p className="truncate text-[11px] text-muted">{c.schoolName || "FUT Minna"}</p>
            </div>
          </div>
          <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-xs text-muted">{c.blurb}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
            <span>{plural(c.memberCount || 0, "member", "members")}</span>
            <span aria-hidden="true">·</span>
            <span className="text-lime/80">{compactNumber(c.onlineCount || 0)} online</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {(c.categories || [c.category]).filter(Boolean).slice(0, 2).map(tag => <span key={tag} className={clsx("rounded border px-1.5 py-0.5 text-[10px]", tag === "Web3" ? "bg-lime-tint border-lime text-lime" : "bg-blue-soft border-blue-border text-blue")}>{tag}</span>)}
          </div>
        </div>
      </Link>
      <div className="flex items-center gap-2 px-3 pb-3">
        {joined ? (
          <Link href={href} prefetch={false} className="rounded-lg border px-3 py-1.5 text-xs text-muted hover:border-lime hover:text-lime">{c.joined && c.relation !== "member" ? "Open" : <><span className="group-hover:hidden">Joined</span><span className="hidden group-hover:inline">Open</span></>}</Link>
        ) : (
          <button type="button" onClick={onJoin} disabled={joining} className="rounded-lg bg-lime px-3 py-1.5 text-xs font-medium text-bg hover:bg-lime-hover disabled:opacity-60">{joining ? "Joining…" : `Join ${copy.unit.name}`}</button>
        )}
        <div className="relative ml-auto">
          <button type="button" onClick={() => setMenu(v => !v)} aria-label={`More options for ${c.name}`} className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-hi hover:text-text">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
          </button>
          {menu && (
            <div role="menu" className="absolute bottom-9 right-0 z-30 w-36 rounded-xl border bg-bg-2 p-1 shadow-xl">
              <button type="button" role="menuitem" onClick={() => { setMenu(false); void navigator.clipboard?.writeText(`${location.origin}${href}`); }} className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface">Share</button>
              <button type="button" role="menuitem" onClick={() => setMenu(false)} className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-red-400 hover:bg-surface">Report</button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}