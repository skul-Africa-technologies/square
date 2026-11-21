"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getInitials, toDisplayUsername, plural } from "@square/shared";
import type { SearchResult } from "@square/shared";
import clsx from "clsx";

type Mode = "search" | "new-message";

type Chip = { label: string; types: string[] };
const FILTER_CHIPS: Chip[] = [
  { label: "All", types: ["people", "chats", "communities"] },
  { label: "People", types: ["people"] },
  { label: "Chats", types: ["chats"] },
  { label: "Communities", types: ["communities"] },
];

function hrefFor(r: SearchResult): string {
  switch (r.kind) {
    case "person": return `/u/${r.username}`;
    case "dm": return `/dm/${r.id}`;
    case "community": return `/c/${r.slug}/general`;
  }
}

function labelFor(r: SearchResult): string {
  switch (r.kind) {
    case "person": return toDisplayUsername(r.username);
    case "dm": return toDisplayUsername(r.username);
    case "community": return r.name;
  }
}

function metaFor(r: SearchResult): string {
  switch (r.kind) {
    case "person": return r.schoolName || "";
    case "dm": return r.preview || "";
    case "community": return `${plural(r.memberCount ?? 0, "member", "members")} · ${r.category || ""}`;
  }
}

export function CommandPalette({
  open, onClose, mode = "search",
}: { open: boolean; onClose: () => void; mode?: Mode }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [index, setIndex] = useState(0);
  const [chip, setChip] = useState("All");
  const [error, setError] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  // load recent searches
  useEffect(() => {
    try {
      const s = localStorage.getItem("square:recent-searches");
      if (s) setRecent(JSON.parse(s) as string[]);
    } catch {}
  }, []);

  // debounce
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  // open: reset state, focus input, push history on mobile, capture trigger
  useEffect(() => {
    if (!open) return;
    setQ(""); setDebounced(""); setIndex(0); setChip("All"); setError(false);
    setTimeout(() => inputRef.current?.focus(), 20);
    if (isMobile) {
      history.pushState({ search: true }, "", location.href);
    }
    return () => {};
  }, [open, isMobile]);

  // close: restore focus
  useEffect(() => {
    if (open) return;
  }, [open]);

  // Escape / hardware back on mobile
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    const onPop = () => onClose();
    document.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPop);
    return () => { document.removeEventListener("keydown", onKey); window.removeEventListener("popstate", onPop); };
  }, [open, onClose]);

  const types = useMemo(() => FILTER_CHIPS.find(c => c.label === chip)?.types ?? FILTER_CHIPS[0].types, [chip]);

  const { data: suggested, isLoading: suggestedLoading } = useQuery({
    queryKey: ["search-suggested"],
    queryFn: () => api.searchSuggested(),
    enabled: open && debounced.length === 0,
    staleTime: 300_000,
  });

  const { data: results, isFetching } = useQuery({
    queryKey: ["search", debounced, chip],
    queryFn: () => api.search(debounced),
    enabled: open && debounced.length >= 2,
    staleTime: 30_000,
  });

  useEffect(() => { setError(false); }, [debounced]);

  // group results
  const groups = useMemo(() => {
    if (!results) return [];
    const people = (results.people || []).filter(() => types.includes("people"));
    const dms = (results.dms || []).filter(() => types.includes("chats"));
    const comms = (results.communities || []).filter(() => types.includes("communities"));
    const out: { title: string; items: SearchResult[]; count: number }[] = [];
    if (people.length) out.push({ title: "People", items: people.slice(0, 4), count: people.length });
    if (dms.length) out.push({ title: "Chats", items: dms.slice(0, 4), count: dms.length });
    if (comms.length) out.push({ title: "Communities", items: comms.slice(0, 4), count: comms.length });
    return out;
  }, [results, types]);

  const flat = useMemo(() => groups.flatMap(g => g.items), [groups]);
  const total = flat.length;
  const hasResults = debounced.length >= 2 && !isFetching && !error;

  useEffect(() => { setIndex(0); }, [debounced, chip]);

  // keyboard nav
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setIndex(i => total ? (i + 1) % total : 0); scrollIntoView(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setIndex(i => total ? (i - 1 + total) % total : 0); scrollIntoView(); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const target = flat.find((_, i) => i === index);
        if (target) { pick(target); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, flat, index, total]);

  const scrollIntoView = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector(`[data-index="${index}"]`);
    if (active) (active as HTMLElement).scrollIntoView({ block: "nearest" });
  }, [listRef, index]);

  const pick = (r: SearchResult) => {
    try {
      if (r.kind === "person" || r.kind === "dm" || r.kind === "community") {
        const s = localStorage.getItem("square:recent-searches");
        const arr = s ? (JSON.parse(s) as string[]) : [];
        const term = debounced || labelFor(r);
        const next = [term, ...arr.filter(t => t !== term)].slice(0, 8);
        localStorage.setItem("square:recent-searches", JSON.stringify(next));
        setRecent(next);
      }
    } catch {}
    router.push(hrefFor(r));
    onClose();
  };

  const removeRecent = (term: string) => {
    const next = recent.filter(t => t !== term);
    try { localStorage.setItem("square:recent-searches", JSON.stringify(next)); } catch {}
    setRecent(next);
  };

  const clearRecent = () => {
    try { localStorage.removeItem("square:recent-searches"); } catch {}
    setRecent([]);
  };

  if (!open) return null;

  // ─── Mobile: full-screen sheet ───
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-[60] flex flex-col bg-bg-2"
        role="dialog" aria-modal="true" aria-label={mode === "new-message" ? "New message" : "Search"}
      >
        {/* top bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 bg-bg-2/95 px-4 py-3.5 backdrop-blur sticky top-0 z-10">
          <button
            type="button" onClick={onClose} aria-label="Close search"
            className="flex h-12 w-12 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m20 20-6-6m6 6l-6 6" /></svg>
          </button>
          <div className="flex-1 max-w-xl mx-auto min-w-0">
            <div className="relative">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input
                ref={inputRef}
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={mode === "new-message" ? "Search people" : "Search people, chats and communities"}
                className="w-full h-12 pl-10 pr-10 rounded-lg border border-border bg-surface text-text text-base placeholder:text-muted focus:outline-none focus:border-blue-strong"
                style={{ fontSize: 16 }}
              />
              {debounced.length > 0 && (
                <button type="button" onClick={() => { setQ(""); setDebounced(""); setIndex(0); inputRef.current?.focus(); }} aria-label="Clear"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 20L4 4m0 16L16 4" /></svg>
                </button>
              )}
            </div>
          </div>
          <button
            type="button" disabled aria-label="Close search"
            className="flex h-12 w-12 items-center justify-center rounded-lg text-muted/50 cursor-not-allowed"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>
          </button>
        </div>

        {/* filter chips */}
        <div className="flex shrink-0 items-start gap-1 px-4 py-2 overflow-x-auto scrollbar-hide">
          <div className="flex gap-1">
            {FILTER_CHIPS.map(c => (
              <button
                key={c.label} type="button" role="checkbox" aria-checked={chip === c.label}
                onClick={() => setChip(c.label)}
                className={clsx("shrink-0 flex h-8 items-center justify-center rounded-lg border px-2.5 py-1 text-[11px] font-medium transition",
                  chip === c.label ? "border-lime bg-lime-tint text-lime" : "border-border bg-surface text-muted hover:border-lime/60 hover:text-text")}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* content area - scrolls */}
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-2" role="region" aria-label="Search results">
          {/* one char hint */}
          {debounced.length === 1 && !error && (
            <div className="px-4 py-2 text-[12px] text-muted">
              Keep typing, at least 2 characters
            </div>
          )}
          {/* error */}
          {error && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-text">Search is unavailable.</p>
              <button type="button" onClick={() => { setError(false); setDebounced(debounced); }} className="mt-2 inline-flex items-center rounded-lg border bg-surface px-3 py-1.5 text-sm text-lime hover:bg-surface-hi">Retry</button>
            </div>
          )}
          {!error && debounced.length >= 2 && isFetching && (
            <div className="px-4 py-6">
              {[1, 2, 3].map((i, k) => (
                <div key={k} className="h-3 w-3/4 rounded bg-surface-hi animate-pulse mb-2" />
              ))}
            </div>
          )}
          {/* empty state: nothing typed */}
          {debounced.length === 0 && !error && !suggestedLoading && (
            <div className="px-4 space-y-4">
              {recent.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Recent</h3>
                    <button type="button" onClick={clearRecent} className="text-[11px] text-lime hover:underline">Clear all</button>
                  </div>
                  <div className="space-y-1">
                    {recent.map(t => (
                      <div key={t} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border/60 bg-surface hover:bg-surface-hi cursor-pointer" onClick={() => { setQ(t); setDebounced(t); inputRef.current?.focus(); }}>
                        <span className="text-sm truncate flex-1">{t}</span>
                        <button type="button" onClick={(e) => { e.stopPropagation(); removeRecent(t); }} className="text-muted hover:text-text" aria-label={`Remove ${t}`}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">Suggested</h3>
                <div className="space-y-1">
                  {suggestedLoading ? (
                    <div className="h-10 w-1/3 rounded bg-surface-hi animate-pulse" />
                  ) : (
                    <>
                      {(suggested?.people || []).slice(0, 3).map((r: SearchResult) => (
                        <div key={r.id} role="button" onClick={() => pick(r)} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-surface hover:bg-surface-hi cursor-pointer min-h-[56px]">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-hi text-[10px] font-semibold">{getInitials((r as { username: string }).username)}</span>
                          <span className="min-w-0 flex-1 truncate text-sm">{labelFor(r)}</span>
                          <span className="text-[11px] text-muted">{((r as { schoolName?: string }).schoolName) || ""}</span>
                        </div>
                      ))}
                      {(suggested?.communities || []).slice(0, 3).map((c: SearchResult) => (
                        <div key={c.id} role="button" onClick={() => pick(c)} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-surface hover:bg-surface-hi cursor-pointer min-h-[56px]">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-surface text-[11px] text-muted">{getInitials((c as { name: string }).name)}</span>
                          <span className="min-w-0 flex-1 truncate text-sm">{labelFor(c)}</span>
                          <span className="text-[11px] text-muted">{plural(((c as { memberCount?: number }).memberCount) ?? 0, "member", "members")}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* one char: keep showing empty + hint */}
          {(debounced.length === 1 || (debounced.length >= 2 && total === 0 && !isFetching && !error)) && debounced.length > 0 && (
            <div className="px-4 py-6 text-center">
              {debounced.length === 1 ? (
                <>
                  <p className="text-sm text-text">Keep typing, at least 2 characters</p>
                  <p className="mt-1 text-[12px] text-muted">Showing suggestions above.</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-text">No results for “{debounced}”</p>
                  <p className="mt-1 text-[12px] text-muted">Try a different name or browse Explore</p>
                  <button type="button" onClick={() => { router.push("/explore"); onClose(); }} className="mt-3 inline-flex items-center rounded-lg border bg-surface px-3 py-1.5 text-sm text-lime hover:bg-surface-hi">Open Explore</button>
                </>
              )}
            </div>
          )}
          {/* results */}
          {hasResults && total > 0 && (
            <div className="space-y-1">
              {groups.map((g, gi) => (
                <div key={g.title}>
                  <div className="px-4 py-2 flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{g.title}</h3>
                    {g.count > 4 && (
                      <button type="button" onClick={() => pick(g.items[0])} className="text-[11px] text-lime hover:underline">See all {g.count}</button>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {g.items.map((r, ri) => {
                      const cursor = gi * 4 + ri;
                      const active = cursor === index;
                      return (
                        <button
                          key={`${r.kind}-${r.id}`} type="button" role="option"
                          aria-selected={active} data-index={cursor}
                          onClick={() => pick(r)}
                          className={clsx("flex w-full items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition",
                            active ? "bg-surface-hi" : "hover:bg-surface")}
                        >
                          <span className={clsx("shrink-0", r.kind === "community" ? "flex h-7 w-7 items-center justify-center rounded-lg border border-surface text-[11px] text-muted" : "flex h-7 w-7 items-center justify-center rounded-full bg-surface text-[10px] font-semibold")}>
                            {r.kind === "community" ? getInitials(r.name) : getInitials(r.username)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-text">{labelFor(r)}</span>
                            <span className="block text-[11px] text-muted">{metaFor(r)}</span>
                          </span>
                          {r.kind === "person" ? (
                            <span className="text-[11px] rounded-full border border-lime/50 bg-lime-tint/50 text-lime px-2 py-0.5 font-medium">Message</span>
                          ) : r.kind === "community" ? (
                            <button type="button" onClick={(e) => { e.stopPropagation(); pick(r); }} className="shrink-0 text-[11px] rounded-full border border-lime bg-lime text-bg px-2 py-0.5 font-medium hover:bg-lime-hover">Join</button>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="px-4 py-2 text-[11px] text-muted text-center">
                {total > 4 && plural(total, "result") + " total"}
              </div>
            </div>
          )}
          {suggestedLoading && debounced.length === 0 && (
            <div className="px-4 py-6"><p className="text-sm text-muted">Loading suggestions…</p></div>
          )}
        </div>
      </div>
    );
  }

  // ─── Desktop: command palette ───
  const groupsDesktop = groups;
  const totalDesktop = total;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center p-3 pt-[15vh] sm:p-6 bg-black/60 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-label={mode === "new-message" ? "New message" : "Search Square"}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[640px] max-w-[92vw] max-h-[70vh] overflow-hidden rounded-xl border border-border bg-surface shadow-2xl flex flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3.5">
          <div className="relative flex-1 min-w-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input
              ref={inputRef}
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={mode === "new-message" ? "Search people" : "Find people, chats and communities"}
              className="w-full pl-10 pr-10 py-2.5 bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted">Esc</kbd>
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-1 px-4 py-2 overflow-x-auto scrollbar-hide">
          <div className="flex gap-1">
            {FILTER_CHIPS.map(c => (
              <button
                key={c.label} type="button" role="checkbox" aria-checked={chip === c.label}
                onClick={() => setChip(c.label)}
                className={clsx("shrink-0 flex h-8 items-center justify-center rounded-lg border px-2.5 py-1 text-[11px] font-medium transition",
                  chip === c.label ? "border-lime bg-lime-tint text-lime" : "border-border bg-surface text-muted hover:border-lime/60 hover:text-text")}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-2" role="region" aria-label="Search results">
          {debounced.length < 2 && !error && (
            <div className="px-4 space-y-4">
              {recent.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Recent</h3>
                    <button type="button" onClick={clearRecent} className="text-[11px] text-lime hover:underline">Clear all</button>
                  </div>
                  <div className="space-y-1">
                    {recent.map(t => (
                      <div key={t} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border/60 bg-surface hover:bg-surface-hi cursor-pointer" onClick={() => { setQ(t); setDebounced(t); inputRef.current?.focus(); }}>
                        <span className="text-sm truncate flex-1">{t}</span>
                        <button type="button" onClick={(e) => { e.stopPropagation(); removeRecent(t); }} className="text-muted hover:text-text" aria-label={`Remove ${t}`}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">Suggested</h3>
                <div className="space-y-1">
                  {suggestedLoading ? (
                    <div className="h-10 w-1/3 rounded bg-surface-hi animate-pulse" />
                  ) : (
                    <>
                      {(suggested?.people || []).slice(0, 3).map((r: SearchResult) => (
                        <div key={r.id} role="button" onClick={() => pick(r)} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-surface hover:bg-surface-hi cursor-pointer min-h-[52px]">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-hi text-[10px] font-semibold">{getInitials((r as { username: string }).username)}</span>
                          <span className="min-w-0 flex-1 truncate text-sm">{labelFor(r)}</span>
                          <span className="text-[11px] text-muted">{((r as { schoolName?: string }).schoolName) || ""}</span>
                        </div>
                      ))}
                      {(suggested?.communities || []).slice(0, 3).map((c: SearchResult) => (
                        <div key={c.id} role="button" onClick={() => pick(c)} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-surface hover:bg-surface-hi cursor-pointer min-h-[52px]">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-surface text-[11px] text-muted">{getInitials((c as { name: string }).name)}</span>
                          <span className="min-w-0 flex-1 truncate text-sm">{labelFor(c)}</span>
                          <span className="text-[11px] text-muted">{plural(((c as { memberCount?: number }).memberCount) ?? 0, "member", "members")}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          {debounced.length === 1 && !error && (
            <div className="px-4 py-2 text-[12px] text-muted">Keep typing, at least 2 characters</div>
          )}
          {error && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-text">Search is unavailable.</p>
              <button type="button" onClick={() => { setError(false); setDebounced(debounced); }} className="mt-2 inline-flex items-center rounded-lg border bg-surface px-3 py-1.5 text-sm text-lime hover:bg-surface-hi">Retry</button>
            </div>
          )}
          {!error && debounced.length >= 2 && isFetching && (
            <div className="px-4 py-6">
              {[1, 2, 3].map((i, k) => (
                <div key={k} className="h-3 w-1/2 rounded bg-surface-hi animate-pulse mb-2" />
              ))}
            </div>
          )}
          {(debounced.length >= 2 && totalDesktop === 0 && !isFetching && !error) && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-text">No results for “{debounced}”</p>
              <p className="mt-1 text-[12px] text-muted">Try a different name or browse Explore</p>
              <button type="button" onClick={() => { router.push("/explore"); onClose(); }} className="mt-3 inline-flex items-center rounded-lg border bg-surface px-3 py-1.5 text-sm text-lime hover:bg-surface-hi">Open Explore</button>
            </div>
          )}
          {hasResults && totalDesktop > 0 && (
            <div className="space-y-1">
              {groupsDesktop.map((g, gi) => (
                <div key={g.title}>
                  <div className="px-4 py-2 flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{g.title}</h3>
                    {g.count > 4 && (
                      <button type="button" onClick={() => pick(g.items[0])} className="text-[11px] text-lime hover:underline">See all {g.count}</button>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {g.items.map((r, ri) => {
                      const cursor = gi * 4 + ri;
                      const active = cursor === index;
                      return (
                        <button
                          key={`${r.kind}-${r.id}`} type="button" role="option" aria-selected={active} data-index={cursor}
                          onClick={() => pick(r)}
                          className={clsx("flex w-full items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition",
                            active ? "bg-surface-hi" : "hover:bg-surface")}
                        >
                          <span className={clsx("shrink-0", r.kind === "community" ? "flex h-7 w-7 items-center justify-center rounded-lg border border-surface text-[11px] text-muted" : "flex h-7 w-7 items-center justify-center rounded-full bg-surface text-[10px] font-semibold")}>
                            {r.kind === "community" ? getInitials(r.name) : getInitials(r.username)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-text">{labelFor(r)}</span>
                            <span className="block text-[11px] text-muted">{metaFor(r)}</span>
                          </span>
                          {r.kind === "person" ? (
                            <span className="text-[11px] rounded-full border border-lime/50 bg-lime-tint/50 text-lime px-2 py-0.5 font-medium">Message</span>
                          ) : r.kind === "community" ? (
                            <button type="button" onClick={(e) => { e.stopPropagation(); pick(r); }} className="shrink-0 text-[11px] rounded-full border border-lime bg-lime text-bg px-2 py-0.5 font-medium hover:bg-lime-hover">Join</button>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="px-4 py-2 text-[11px] text-muted text-center">
                {totalDesktop > 4 && plural(totalDesktop, "result") + " total"}
              </div>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between border-t border-border/60 px-4 py-2 text-[11px] text-muted">
          <span>↑↓ to navigate · Enter to open</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
