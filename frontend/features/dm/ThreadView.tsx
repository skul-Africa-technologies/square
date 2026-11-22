"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { appConfig } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DaySeparator, MessageRow, canGroup, dayLabel, type MessageItem } from "@/components/messages/MessageRow";
import { addReactionSummary, applyReactionCount, config, removeReactionSummary, type DirectMessage, type ReactionStreamEvent, type ReplyPreview } from "@square/shared";

export function ThreadView({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const { data: currentUser } = useQuery({ queryKey: ["me"], queryFn: () => api.me(), staleTime: 60_000 });
  const { data: conv } = useQuery({ queryKey: ["conversation", conversationId], queryFn: () => api.getConversation(conversationId) }); // PROPOSED
  const { data, isLoading } = useQuery({ queryKey: ["messages", conversationId], queryFn: () => api.listMessages(conversationId), staleTime: 5_000 }); // PROPOSED
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<MessageItem | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [showJumpLatest, setShowJumpLatest] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { void api.markRead(conversationId).then(() => { qc.invalidateQueries({ queryKey: ["conversations"] }); qc.invalidateQueries({ queryKey: ["unread"] }); }).catch(() => {}); }, [conversationId, qc, data?.items?.length]); // PROPOSED

  useEffect(() => api.subscribeReactionEvents("dm", conversationId, (event: ReactionStreamEvent) => {
    if (event.type === "reaction.resync") {
      const byMessage = new Map(event.messages.map(message => [message.messageId, message.reactions]));
      qc.setQueryData<{ items: DirectMessage[] }>(["messages", conversationId], old => ({
        items: (old?.items || []).map(message => ({
          ...message,
          reactions: byMessage.get(message.id) || [],
        })),
      }));
      return;
    }
    if (event.userId === (currentUser?.id || "u1")) return;
    qc.setQueryData<{ items: DirectMessage[] }>(["messages", conversationId], old => ({
      items: (old?.items || []).map(message => message.id === event.messageId
        ? { ...message, reactions: applyReactionCount(message.reactions || [], event.emoji, event.count) }
        : message),
    }));
  }), [conversationId, currentUser?.id, qc]);

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
          qc.invalidateQueries({ queryKey: ["unread"] });
        }
      } catch { interval = Math.min(interval * 2, 30000); }
      timer = setTimeout(poll, interval);
    };
    const startPolling = () => { if (!timer) timer = setTimeout(poll, interval); };
    if (typeof EventSource !== "undefined" && !appConfig.useMock) {
      try {
        es = new EventSource("/api/me/stream", { withCredentials: true } as EventSourceInit); // PROPOSED
        es.onmessage = () => { qc.invalidateQueries({ queryKey: ["messages", conversationId] }); qc.invalidateQueries({ queryKey: ["conversations"] }); qc.invalidateQueries({ queryKey: ["unread"] }); };
        es.onerror = () => { es?.close(); es = null; startPolling(); };
      } catch { startPolling(); }
    } else {
      startPolling();
    }
    const onVis = () => { if (document.visibilityState === "visible") interval = 5000; };
    document.addEventListener("visibilitychange", onVis);
    return () => { stopped = true; es?.close(); if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
  }, [conversationId, qc]);

  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [data?.items?.length]);

  const send = useMutation({
    mutationFn: async (payload: { value: string; reply?: MessageItem | null }) => api.sendMessage(conversationId, payload.value, { replyToId: payload.reply?.id, replyPreview: payload.reply ? { id: payload.reply.id, authorUsername: payload.reply.authorUsername || payload.reply.authorId, snippet: payload.reply.deleted ? "" : payload.reply.content.slice(0, 80), deleted: payload.reply.deleted } as ReplyPreview : undefined }), // PROPOSED
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ["messages", conversationId] });
      const prev = qc.getQueryData<{ items: DirectMessage[] }>(["messages", conversationId]);
      const optimistic: DirectMessage = { id: `tmp_${Date.now()}`, conversationId, senderId: "u1", text: payload.value, createdAt: new Date().toISOString(), status: "sending", replyToId: payload.reply?.id, replyPreview: payload.reply ? { id: payload.reply.id, authorUsername: payload.reply.authorUsername || payload.reply.authorId, snippet: payload.reply.deleted ? "" : payload.reply.content.slice(0, 80), deleted: payload.reply.deleted } : undefined };
      qc.setQueryData(["messages", conversationId], { items: [...(prev?.items || []), optimistic] });
      setText(""); setReplyTo(null);
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

  async function react(messageId: string, emoji: string, add: boolean, clientId: string) {
    const key = ["messages", conversationId] as const;
    await qc.cancelQueries({ queryKey: key });
    const previous = qc.getQueryData<{ items: DirectMessage[] }>(key);
    qc.setQueryData<{ items: DirectMessage[] }>(key, old => ({
      items: (old?.items || []).map(message => {
        if (message.id !== messageId) return message;
        const reactions = message.reactions || [];
        return { ...message, reactions: add
          ? addReactionSummary(reactions, emoji, currentUser?.id || "u1", currentUser?.id || "u1")
          : removeReactionSummary(reactions, emoji) };
      }),
    }));
    try {
      await api.setMessageReaction("dm", conversationId, messageId, emoji, add, clientId);
    } catch (error) {
      if (previous) qc.setQueryData(key, previous);
      throw error;
    }
  }

  const blocked = conv?.blocked;
  const peer = conv?.participant.username || "user";
  const items = (data?.items || []).map((m): MessageItem => ({
    id: m.id,
    authorId: m.senderId,
    authorUsername: m.senderId === "u1" ? "amaka-eze" : peer,
    content: m.text,
    createdAt: m.createdAt,
    status: m.status,
    deleted: m.deleted,
    replyToId: m.replyToId,
    replyPreview: m.replyPreview,
    reactions: m.reactions || [],
    mentionedUserIds: m.mentionedUserIds,
    mine: m.senderId === "u1",
  }));
  const lastMine = [...items].reverse().find(m => m.mine && !m.deleted);
  const grouped = config.GROUP_CONSECUTIVE_MESSAGES;

  function jumpTo(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); setFlashId(id); setTimeout(() => setFlashId(x => x === id ? null : x), 1500); }
  }

  return (
    <div className="flex flex-col h-full min-h-[70vh]">
      <header className="border-b px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <div className="font-heading font-semibold">#{peer}</div>
          <Link href={`/u/${peer}`} prefetch={false} className="text-xs text-muted hover:text-text">View profile</Link>
        </div>
      </header>
      <div ref={listRef} onScroll={event => {
        const element = event.currentTarget;
        setShowJumpLatest(element.scrollHeight - element.scrollTop - element.clientHeight > 160);
      }} className="relative flex-1 overflow-auto p-3 [overflow-anchor:auto]">
        {isLoading && <Skeleton className="h-24" />}
        {!isLoading && items.length === 0 && <p className="text-sm text-muted px-2">No messages yet.</p>}
        {items.map((m, i) => {
          const prev = i > 0 ? items[i - 1] : null;
          const showDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
          const isGrouped = grouped && prev && !showDay && canGroup(prev, m);
          return (
            <div key={m.id}>
              {showDay && <DaySeparator label={dayLabel(m.createdAt)} />}
              <MessageRow item={m} currentUserId={currentUser?.id || "u1"} grouped={!!isGrouped} flash={flashId === m.id} showSeen={lastMine?.id === m.id} onReply={!blocked ? setReplyTo : undefined} onDelete={m.mine ? (it) => del.mutate(it.id) : undefined} onRetry={m.status === "failed" ? (it) => send.mutate({ value: it.content, reply: replyTo }) : undefined} onJumpToReply={jumpTo} showReactions canReact={!blocked} reactionDisabledReason={blocked ? "You can't message this user" : undefined} onReaction={(emoji, add, clientId) => react(m.id, emoji, add, clientId)} onReactionUsers={(emoji, cursor) => api.listReactionUsers("dm", conversationId, m.id, emoji, cursor)} />
            </div>
          );
        })}
        {showJumpLatest && (
          <button type="button" data-testid="jump-to-latest" onClick={() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); setShowJumpLatest(false); }} className="sticky bottom-4 ml-auto flex items-center gap-2 rounded-full bg-blue-strong px-4 py-2 text-sm font-semibold text-bg shadow-lg hover:bg-blue-deep">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
            Jump to latest
          </button>
        )}
      </div>
      <div className="border-t bg-bg-2">
        {replyTo && !blocked && (
          <div className="px-3 pt-2 flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <span className="text-muted">Replying to </span>
              <span className="font-medium">{replyTo.authorUsername ? `#${replyTo.authorUsername}` : "message"}</span>
              <span className="text-muted"> — {replyTo.deleted ? "Original message deleted" : replyTo.content.slice(0, 60)}</span>
            </div>
            <button className="text-muted hover:text-text" onClick={() => setReplyTo(null)}>Cancel</button>
          </div>
        )}
        <div className="p-3">
          {blocked ? (
            <div className="rounded-lg border bg-surface p-3 text-sm text-muted">You can't message this user</div>
          ) : (
            <div className="flex gap-2">
              <input value={text} onChange={e => setText(e.target.value)} placeholder="Message" className="flex-1 rounded-lg border bg-bg px-3 py-2 text-sm outline-none focus:border-blue-strong" aria-label="Message" />
              <Button onClick={() => text.trim() && send.mutate({ value: text.trim(), reply: replyTo })} disabled={!text.trim() || send.isPending} aria-label="Send message">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9l20-7z"/></svg>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
