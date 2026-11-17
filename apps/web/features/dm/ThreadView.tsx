"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { appConfig } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { DirectMessage } from "@square/shared";

export function ThreadView({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const { data: conv } = useQuery({ queryKey: ["conversation", conversationId], queryFn: () => api.getConversation(conversationId) }); // PROPOSED
  const { data, isLoading } = useQuery({ queryKey: ["messages", conversationId], queryFn: () => api.listMessages(conversationId), staleTime: 5_000 }); // PROPOSED
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { void api.markRead(conversationId).then(() => qc.invalidateQueries({ queryKey: ["conversations"] })).catch(() => {}); }, [conversationId, qc, data?.items?.length]); // PROPOSED

  // SSE -> fallback polling with after cursor, backoff on hidden
  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let interval = 5000;
    const poll = async () => {
      if (stopped) return;
      if (document.visibilityState === "hidden") { interval = Math.min(interval * 2, 30000); timer = setTimeout(poll, interval); return; }
      interval = 5000;
      const cur = qc.getQueryData<{ items: DirectMessage[] }>(["messages", conversationId]);
      const last = cur?.items?.[cur.items.length - 1];
      const after = last ? `${last.createdAt}|${last.id}` : undefined;
      try {
        const res = await api.listMessages(conversationId, { after }); // PROPOSED
        if (res.items.length) {
          qc.setQueryData<{ items: DirectMessage[] }>(["messages", conversationId], (old) => {
            const prev = old?.items || []; const seen = new Set(prev.map(m => m.id));
            return { items: [...prev, ...res.items.filter(m => !seen.has(m.id))] };
          });
          qc.invalidateQueries({ queryKey: ["conversations"] });
        }
      } catch { interval = Math.min(interval * 2, 30000); }
      timer = setTimeout(poll, interval);
    };

    const startPolling = () => { if (!timer) timer = setTimeout(poll, interval); };
    if (typeof EventSource !== "undefined" && !appConfig.useMock) {
      try {
        es = new EventSource("/me/stream", { withCredentials: true } as EventSourceInit); // PROPOSED
        es.onmessage = () => { qc.invalidateQueries({ queryKey: ["messages", conversationId] }); qc.invalidateQueries({ queryKey: ["conversations"] }); qc.invalidateQueries({ queryKey: ["unread"] }); };
        es.onerror = () => { es?.close(); es = null; startPolling(); };
      } catch { startPolling(); }
    } else {
      // mock: simulate incoming via polling (mock stream endpoint not wired to client state)
      startPolling();
    }
    const onVis = () => { if (document.visibilityState === "visible") interval = 5000; };
    document.addEventListener("visibilitychange", onVis);
    return () => { stopped = true; es?.close(); if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
  }, [conversationId, qc]);

  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [data?.items?.length]);

  const send = useMutation({
    mutationFn: async (value: string) => api.sendMessage(conversationId, value), // PROPOSED
    onMutate: async (value: string) => {
      await qc.cancelQueries({ queryKey: ["messages", conversationId] });
      const prev = qc.getQueryData<{ items: DirectMessage[] }>(["messages", conversationId]);
      const optimistic: DirectMessage = { id: `tmp_${Date.now()}`, conversationId, senderId: "u1", text: value, createdAt: new Date().toISOString(), status: "sending" };
      qc.setQueryData(["messages", conversationId], { items: [...(prev?.items || []), optimistic] });
      setText("");
      return { prev, tmpId: optimistic.id };
    },
    onError: (_e, _v, ctx) => {
      if (!ctx) return;
      qc.setQueryData<{ items: DirectMessage[] }>(["messages", conversationId], (old) => ({ items: (old?.items || []).map(m => m.id === ctx.tmpId ? { ...m, status: "failed" } : m) }));
    },
    onSuccess: (m, _v, ctx) => {
      qc.setQueryData<{ items: DirectMessage[] }>(["messages", conversationId], (old) => ({ items: (old?.items || []).map(x => x.id === ctx?.tmpId ? m : x) }));
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => api.deleteMessage(conversationId, id), // PROPOSED
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages", conversationId] }),
  });

  const blocked = conv?.blocked;
  const items = data?.items || [];
  return (
    <div className="flex flex-col h-full min-h-[70vh]">
      <header className="border-b px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <div className="font-heading font-semibold">#{conv?.participant.username || "conversation"}</div>
          <Link href={`/u/${conv?.participant.username || ""}`} prefetch={false} className="text-xs text-muted hover:text-text">View profile</Link>
        </div>
      </header>
      <div ref={listRef} className="flex-1 overflow-auto p-4 space-y-2">
        {isLoading && <Skeleton className="h-24" />}
        {!isLoading && items.length === 0 && <p className="text-sm text-muted">No messages yet.</p>}
        {items.map(m => {
          const mine = m.senderId === "u1";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-xl border px-3 py-2 text-sm ${mine ? "bg-lime-tint border-lime/40" : "bg-surface"}`}>
                {!m.deleted && <p className="whitespace-pre-wrap">{m.text}</p>}
                {m.deleted && <p className="text-muted italic">Message deleted</p>}
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                  <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  {mine && m.status && <span>{m.status === "failed" ? "Failed" : m.status === "sending" ? "Sending" : m.status === "seen" ? "Seen" : "Sent"}</span>}
                  {mine && m.status === "failed" && <button className="text-lime hover:underline" onClick={() => send.mutate(m.text)}>Retry</button>}
                  {mine && !m.deleted && m.status !== "failed" && <button className="hover:text-text" onClick={() => del.mutate(m.id)}>Delete</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t p-3 bg-bg-2">
        {blocked ? (
          <div className="rounded-lg border bg-surface p-3 text-sm text-muted">You can't message this user</div>
        ) : (
          <div className="flex gap-2">
            <input value={text} onChange={e => setText(e.target.value)} placeholder="Message" className="flex-1 rounded-lg border bg-bg px-3 py-2 text-sm outline-none focus:border-lime" aria-label="Message" />
            <Button onClick={() => text.trim() && send.mutate(text.trim())} disabled={!text.trim() || send.isPending}>Send</Button>
          </div>
        )}
      </div>
    </div>
  );
}
