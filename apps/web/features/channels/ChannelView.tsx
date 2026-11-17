"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { campaigns } from "@/lib/api/seed";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { validateUpload } from "@/lib/upload";
import type { Post, Tab } from "@square/shared";
import clsx from "clsx";

export function ChannelView({ community, channel, tab }: { community: string; channel: string; tab: string }) {
  const qc = useQueryClient();
  const { data: channels } = useQuery({ queryKey: ["channels-explore", community], queryFn: () => api.listChannels(community) }); // PROPOSED
  const ch = (channels || []).find(c => c.slug === channel) || (channels || [])[0];
  const { data: tabs } = useQuery({ queryKey: ["tabs", ch?.id || channel], queryFn: () => ch ? api.getChannelTabs(ch.id) : Promise.resolve([]), enabled: !!ch, staleTime: 60_000 });
  const active = (tabs || []).filter(t => t.enabled).find(t => t.slug === tab) || (tabs || []).filter(t => t.enabled)[0];
  const join = useMutation({ mutationFn: () => ch ? api.joinChannel(ch.id) : Promise.resolve({ ok: true as const }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["channels-explore"] }); qc.invalidateQueries({ queryKey: ["my-channels"] }); } }); // PROPOSED
  const leave = useMutation({ mutationFn: () => ch ? api.leaveChannel(ch.id) : Promise.resolve({ ok: true as const }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["channels-explore"] }); qc.invalidateQueries({ queryKey: ["my-channels"] }); } }); // PROPOSED
  const canView = ch?.isPublic !== false || ch?.joined;
  return (
    <div className="flex flex-col min-h-0 h-full">
      <header className="border-b px-4 lg:px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-xl font-semibold"># {ch?.name || channel}</h1>
            <p className="text-sm text-muted">{ch?.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">{ch?.memberCount ?? 0} members</span>
            {ch?.joined ? (
              <Button size="sm" variant="secondary" onClick={() => leave.mutate()} disabled={leave.isPending}>Joined</Button>
            ) : (
              <Button size="sm" onClick={() => join.mutate()} disabled={join.isPending}>Join</Button>
            )}
          </div>
        </div>
        <nav className="mt-3 flex gap-2 overflow-x-auto" aria-label="Channel tabs">
          {(tabs || []).filter(t => t.enabled).map(t => (
            <Link key={t.id} href={`/c/${community}/${channel}/${t.slug}`} prefetch={false} className={clsx("px-3 py-1.5 rounded-lg text-sm whitespace-nowrap border", active?.id === t.id ? "bg-lime-tint border-lime text-lime" : "text-muted hover:text-text bg-surface")}>{t.name}</Link>
          ))}
        </nav>
      </header>
      <div className="flex-1 min-h-0 overflow-auto">
        {!active && <div className="p-6"><Skeleton className="h-40" /></div>}
        {active && canView && <TabRenderer tab={active} channelId={ch?.id || ""} isMember={!!ch?.joined} />}
        {active && !canView && <div className="p-6"><Empty title="Join to view" hint="This channel is private." /></div>}
      </div>
    </div>
  );
}

function TabRenderer({ tab, channelId, isMember }: { tab: Tab; channelId: string; isMember: boolean }) {
  if (tab.kind === "chat" || tab.kind === "feed") return <ChatFeedTab tab={tab} isMember={isMember} />;
  if (tab.kind === "board") return <BoardTab tab={tab} isMember={isMember} />;
  if (tab.kind === "list") return <ListTab tab={tab} channelId={channelId} isMember={isMember} />;
  if (tab.kind === "form") return <FormTab tab={tab} isMember={isMember} />;
  return <Empty title="Unsupported tab" hint="This tab type is not available yet." />;
}

function ChatFeedTab({ tab, isMember }: { tab: Tab; isMember: boolean }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const canPost = isMember && tab.permissions.canPost.includes("member");
  const listRef = useRef<HTMLDivElement | null>(null);
  const [range, setRange] = useState({ start: 0, end: 60 });

  const { data, isLoading } = useQuery({ queryKey: ["posts", tab.id], queryFn: () => api.listPosts(tab.id), staleTime: 10_000 });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let interval = 4000;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "hidden") { interval = Math.min(interval * 2, 30000); timer = setTimeout(tick, interval); return; }
      interval = 4000;
      const current = qc.getQueryData<{ items: Post[] }>(["posts", tab.id]);
      const last = current?.items?.[current.items.length - 1];
      const after = last ? `${last.createdAt}|${last.id}` : undefined;
      try {
        const res = await api.listPosts(tab.id, { after });
        if (res.items.length) {
          qc.setQueryData<{ items: Post[]; nextCursor?: string | null }>(["posts", tab.id], (old) => {
            const prev = old?.items || [];
            const seen = new Set(prev.map(p => p.id));
            return { items: [...prev, ...res.items.filter(p => !seen.has(p.id))], nextCursor: old?.nextCursor ?? null };
          });
        }
      } catch { interval = Math.min(interval * 2, 30000); }
      timer = setTimeout(tick, interval);
    };
    timer = setTimeout(tick, interval);
    const onVis = () => { if (document.visibilityState === "visible") interval = 4000; };
    document.addEventListener("visibilitychange", onVis);
    return () => { stopped = true; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
  }, [qc, tab.id]);

  const mut = useMutation({
    mutationFn: (content: string) => api.createPost(tab.id, { content }),
    onMutate: async (content: string) => {
      await qc.cancelQueries({ queryKey: ["posts", tab.id] });
      const prev = qc.getQueryData<{ items: Post[] }>(["posts", tab.id]);
      const optimistic: Post = { id: `tmp_${Date.now()}`, tabId: tab.id, authorId: "u1", content, createdAt: new Date().toISOString() };
      qc.setQueryData(["posts", tab.id], { items: [...(prev?.items || []), optimistic], nextCursor: null });
      setText("");
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["posts", tab.id], ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["posts", tab.id] }); qc.invalidateQueries({ queryKey: ["home-feed"] }); },
  });

  const items = data?.items || [];
  const ROW = 92;
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      const top = el.scrollTop; const h = el.clientHeight;
      const start = Math.max(0, Math.floor(top / ROW) - 10);
      const end = Math.min(items.length, Math.ceil((top + h) / ROW) + 10);
      setRange(r => (r.start === start && r.end === end ? r : { start, end }));
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [items.length]);

  const visible = items.slice(range.start, range.end);
  const topPad = range.start * ROW;
  const bottomPad = Math.max(0, (items.length - range.end) * ROW);

  return (
    <div className="flex flex-col h-full min-h-[60vh]">
      <div ref={listRef} className="flex-1 p-4 overflow-auto">
        {isLoading && <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>}
        {!isLoading && items.length === 0 && <Empty title="No messages yet" hint={canPost ? "Start the conversation." : "Join to take part in the conversation."} />}
        {items.length > 0 && (
          <div style={{ paddingTop: topPad, paddingBottom: bottomPad }} className="space-y-3">
            {visible.map(p => (
              <div key={p.id} className={clsx("rounded-xl border p-3", p.pinned ? "bg-lime-tint/30 border-lime/40" : "bg-surface")}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-7 w-7 rounded-full bg-surface-hi flex items-center justify-center text-xs">{(p.authorId || "u").slice(0, 2).toUpperCase()}</div>
                  <span className="text-xs text-muted">{new Date(p.createdAt).toLocaleString()}</span>
                  {p.pinned && <span className="text-xs text-lime">Pinned</span>}
                </div>
                <p className="text-sm text-text/95 whitespace-pre-wrap">{p.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="border-t p-3 bg-bg-2">
        <div className="flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)} disabled={!canPost} placeholder={canPost ? `Message ${tab.name}` : "Join to post"} className="flex-1 rounded-lg border bg-bg px-3 py-2 text-sm outline-none focus:border-lime disabled:opacity-50" aria-label="Message composer" />
          {canPost && <UploadButton />}
          <Button onClick={() => text.trim() && mut.mutate(text.trim())} disabled={!canPost || !text.trim() || mut.isPending}>Send</Button>
        </div>
      </div>
    </div>
  );
}

function UploadButton() {
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const onPick = async (f: File | null) => {
    if (!f) return;
    const err = validateUpload("post-media", f);
    if (err) { setState("error"); return; }
    setState("uploading"); setProgress(10);
    try {
      await api.signUpload({ kind: "post-media" });
      for (const p of [30, 60, 90, 100]) { await new Promise(r => setTimeout(r, 120)); setProgress(p); }
      setState("done"); setTimeout(() => setState("idle"), 1200);
    } catch { setState("error"); }
  };
  return (
    <label className="inline-flex items-center justify-center rounded-lg border bg-surface px-3 text-sm text-muted hover:text-text cursor-pointer relative overflow-hidden">
      <input type="file" className="sr-only" accept="image/*,video/*" onChange={e => onPick(e.target.files?.[0] || null)} aria-label="Upload media" />
      {state === "uploading" ? `${progress}%` : state === "error" ? "Retry" : state === "done" ? "Added" : "Upload"}
    </label>
  );
}

function BoardTab({ tab, isMember }: { tab: Tab; isMember: boolean }) {
  const { data, isLoading } = useQuery({ queryKey: ["projects", tab.id], queryFn: () => api.listProjects(tab.id), staleTime: 30_000 }); // PROPOSED
  const cols: Array<{ key: "idea" | "building" | "launched"; label: string }> = [{ key: "idea", label: "Idea" }, { key: "building", label: "Building" }, { key: "launched", label: "Launched" }];
  const items = data || [];
  return (
    <div className="p-4 overflow-x-auto">
      {!isMember && <p className="text-sm text-muted mb-3">Join to post</p>}
      {isLoading && <Skeleton className="h-40" />}
      <div className="grid md:grid-cols-3 gap-4 min-w-[720px]">
        {cols.map(col => (
          <div key={col.key} className="rounded-xl border bg-bg-2 p-3">
            <div className="flex items-center justify-between mb-3"><h3 className="font-heading text-sm font-semibold">{col.label}</h3><span className="text-xs text-muted">{items.filter(i => i.status === col.key).length}</span></div>
            <div className="space-y-3">
              {items.filter(i => i.status === col.key).map(p => (
                <Link key={p.id} href={`/project/${p.id}`} prefetch={false} className="block rounded-xl border bg-surface p-3 hover:border-lime/40">
                  <div className="font-medium mb-1">{p.title}</div>
                  <p className="text-xs text-muted mb-2">{p.description}</p>
                </Link>
              ))}
              {items.filter(i => i.status === col.key).length === 0 && <div className="text-xs text-muted p-2">No projects</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListTab({ tab, channelId, isMember }: { tab: Tab; channelId: string; isMember: boolean }) {
  const { data, isLoading } = useQuery({ queryKey: ["campaigns", channelId], queryFn: () => api.listCampaigns(channelId), staleTime: 30_000 }); // PROPOSED
  const items = data || campaigns.filter(c => c.channelId === channelId);
  if (isLoading) return <div className="p-6"><Skeleton className="h-40" /></div>;
  if (items.length === 0) return <div className="p-6"><Empty title="No campaigns yet" hint="Campaigns will appear here." /></div>;
  return <div className="p-4 space-y-4 max-w-4xl">{items.map(c => <CampaignCard key={c.id} campaign={c} isMember={isMember} />)}</div>;
}

export function CampaignCard({ campaign: c, isMember }: { campaign: { id: string; title: string; goal: string; endsAt: string; target: number; joined: number; tasks: { id: string; title: string; points?: number; badgeReward?: string; done?: boolean }[]; leaderboard: { rank: number; username: string; points: number }[]; status: string; resultsSummary?: string }; isMember?: boolean }) {
  const qc = useQueryClient();
  const join = useMutation({ mutationFn: () => api.joinCampaign(c.id), onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }) }); // PROPOSED
  const complete = useMutation({ mutationFn: (taskId: string) => api.completeCampaignTask(c.id, taskId), onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }) }); // PROPOSED
  const days = Math.max(0, Math.ceil((new Date(c.endsAt).getTime() - Date.now()) / 86400000));
  return (
    <div className="rounded-xl border bg-surface p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-lime mb-1">{c.status === "ended" ? "Ended" : `Ends in ${days} days`}</div>
          <h2 className="font-heading text-xl font-semibold">{c.title}</h2>
          <p className="text-sm text-muted">{c.goal}</p>
        </div>
        <Button onClick={() => join.mutate()} disabled={join.isPending || !isMember}>Join campaign</Button>
      </div>
      <div>
        <div className="flex justify-between text-sm mb-1"><span>{c.joined} of {c.target} joined</span><span className="text-muted">{Math.round((c.joined / Math.max(c.target, 1)) * 100)}%</span></div>
        <Progress value={c.joined} max={c.target} />
      </div>
      <div>
        <h3 className="font-heading text-sm mb-2">Tasks</h3>
        <div className="space-y-2">
          {c.tasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border bg-bg-2 p-2">
              <div><div className="text-sm">{t.title}</div><div className="text-xs text-lime">{t.points ? `+${t.points} pts` : t.badgeReward ? `Badge: ${t.badgeReward}` : ""}</div></div>
              <Button size="sm" variant={t.done ? "secondary" : "primary"} onClick={() => !t.done && complete.mutate(t.id)} disabled={t.done || complete.isPending || !isMember}>{t.done ? "Done" : "Mark task done"}</Button>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="font-heading text-sm mb-2">Leaderboard</h3>
        <div className="space-y-1 max-h-72 overflow-auto">
          {c.leaderboard.slice(0, 20).map((r) => (<div key={r.rank} className="flex items-center justify-between text-sm rounded-lg px-2 py-1.5 bg-bg-2"><span className="text-muted w-8">#{r.rank}</span><span className="flex-1">#{r.username}</span><span className="text-lime">{r.points} pts</span></div>))}
        </div>
      </div>
      {c.status === "ended" && <div className="rounded-lg border bg-bg-2 p-3"><h3 className="font-heading text-sm mb-1">Results</h3><p className="text-sm text-muted">{c.resultsSummary || "Campaign completed. Thanks to all participants."}</p></div>}
    </div>
  );
}

function FormTab({ tab, isMember }: { tab: Tab; isMember: boolean }) {
  return <div className="p-6 max-w-xl"><div className="rounded-xl border bg-surface p-4 space-y-3"><h3 className="font-heading font-semibold">{tab.name} form</h3><p className="text-sm text-muted">This custom form tab collects responses from members.</p><input className="w-full rounded-lg border bg-bg-2 px-3 py-2 text-sm" placeholder={isMember ? "Your response" : "Join to respond"} disabled={!isMember} aria-label="Form response" /><Button disabled={!isMember}>Submit</Button></div></div>;
}
