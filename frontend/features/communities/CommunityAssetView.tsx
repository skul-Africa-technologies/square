"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toDisplayUsername, getInitials } from "@square/shared";
import { relativeTime, useNow } from "@/lib/time";
import { copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PresenceDot } from "@/components/shell/PresenceDot";
import { MemberList } from "@/features/assets/MemberList";
import { DaySeparator, MessageRow, canGroup, dayLabel, type MessageItem } from "@/components/messages/MessageRow";
import { MentionInput } from "@/components/messages/MentionInput";
import { useMentionJump } from "@/components/messages/useMentionJump";
import { addReactionSummary, applyReactionCount, config, removeReactionSummary, type Asset, type AssetItem, type AssetKind, type Post, type Project, type Campaign, type ReactionStreamEvent } from "@square/shared";
import { Skeleton } from "@/components/ui/skeleton";
import clsx from "clsx";

const KIND_ICON: Record<AssetKind, string> = {
  chat: "💬",
  feed: "📣",
  rules: "📜",
  events: "📅",
  board: "🗂",
  list: "📋",
  campaigns: "🎯",
};

export function CommunityAssetView({ community, asset }: { community: string; asset: string }) {
  const qc = useQueryClient();
  const now = useNow();
  const [membersOpen, setMembersOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<MessageItem | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [showUnreadBanner, setShowUnreadBanner] = useState(false);
  const [showJumpLatest, setShowJumpLatest] = useState(false);
  const [floatingUiOpen, setFloatingUiOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: currentUser } = useQuery({ queryKey: ["me"], queryFn: () => api.me(), staleTime: 60_000 });
  const { data: communityDetail, isLoading: commLoading } = useQuery({
    queryKey: ["community", community],
    queryFn: () => api.getCommunity(community),
    staleTime: 60_000,
  });
  const currentAsset = communityDetail?.assets?.find(a => a.slug === asset);
  const myRole = communityDetail?.community?.role;
  const requireAssetId = () => {
    if (!currentAsset) throw new Error("Asset is no longer available");
    return currentAsset.id;
  };
  const canPost = currentAsset ? currentAsset.permissions.canPost.includes(myRole || "member") : false;
  const canRead = currentAsset ? currentAsset.permissions.canRead.includes(myRole || "member") : false;

  const { data: posts, isLoading: postsLoading } = useQuery({
    queryKey: ["posts", community, asset],
    queryFn: () => api.listPosts(requireAssetId()),
    staleTime: 10_000,
    enabled: !commLoading && !!currentAsset,
  });
  const mentionJump = useMentionJump("asset", currentAsset?.id || "", listRef, posts?.items?.length || 0, !!currentAsset);

  const { data: items } = useQuery({
    queryKey: ["items", community, asset],
    queryFn: () => api.listItems(requireAssetId()),
    staleTime: 30_000,
    enabled: !commLoading && !!currentAsset,
  });

  const { data: projectsData } = useQuery({
    queryKey: ["projects", community, asset],
    queryFn: () => api.listProjects(requireAssetId()),
    staleTime: 30_000,
    enabled: !commLoading && !!currentAsset,
  });

  const { data: campaignsData } = useQuery({
    queryKey: ["campaigns", community, asset],
    queryFn: () => api.listCampaigns(requireAssetId()),
    staleTime: 30_000,
    enabled: !commLoading && !!currentAsset,
  });

  useEffect(() => {
    if (currentAsset?.unreadCount && currentAsset.unreadCount > 0) {
      setShowUnreadBanner(true);
    }
  }, [currentAsset]);

  useEffect(() => {
    if (currentAsset?.kind !== "chat") return;
    return api.subscribeReactionEvents("asset", currentAsset.id, (event: ReactionStreamEvent) => {
      if (event.type === "reaction.resync") {
        const byMessage = new Map(event.messages.map(message => [message.messageId, message.reactions]));
        qc.setQueryData<{ items: Post[]; nextCursor?: string | null }>(["posts", community, asset], old => ({
          ...old,
          items: (old?.items || []).map(post => ({
            ...post,
            reactions: byMessage.get(post.id) || [],
          })),
        }));
        return;
      }
      if (event.userId === (currentUser?.id || "u1")) return;
      qc.setQueryData<{ items: Post[]; nextCursor?: string | null }>(["posts", community, asset], old => ({
        ...old,
        items: (old?.items || []).map(post => post.id === event.messageId
          ? { ...post, reactions: applyReactionCount(post.reactions || [], event.emoji, event.count) }
          : post),
      }));
    });
  }, [asset, community, currentAsset, currentUser?.id, qc]);

  useEffect(() => {
    if (currentAsset) {
      try {
        const stored = localStorage.getItem("square:lastAsset");
        const map = stored ? JSON.parse(stored) : {};
        map[community] = asset;
        localStorage.setItem("square:lastAsset", JSON.stringify(map));
      } catch {}
    }
  }, [community, asset]);

  const sendPost = useMutation({
    mutationFn: (content: string) => api.createPost(requireAssetId(), { content, replyToId: replyTo?.id, replyPreview: replyTo ? { id: replyTo.id, authorUsername: replyTo.authorUsername || "unknown", snippet: replyTo.deleted ? "" : replyTo.content.slice(0, 80), deleted: replyTo.deleted } : undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["posts", community, asset] });
      qc.invalidateQueries({ queryKey: ["home-feed"] });
    },
  });

  const markRead = useMutation({
    mutationFn: () => api.markAssetRead(requireAssetId()),
    onSuccess: () => {
      setShowUnreadBanner(false);
      qc.invalidateQueries({ queryKey: ["community", community] });
      qc.invalidateQueries({ queryKey: ["my-communities"] });
    },
  });

  const addItem = useMutation({
    mutationFn: (data: Partial<AssetItem>) => api.createItem(requireAssetId(), data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["items", community, asset] }),
  });

  const createProject = useMutation({
    mutationFn: (data: { title: string; description: string; status: "idea" | "building" | "launched" }) => api.createProject(requireAssetId(), data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", community, asset] }),
  });

  const itemsList = items || [];
  const postsList = (posts?.items || []).map(p => ({
    id: p.id,
    authorId: p.authorId,
    authorUsername: p.authorUsername,
    content: p.content,
    createdAt: p.createdAt,
    pinned: p.pinned,
    replyToId: p.replyToId,
    replyPreview: p.replyPreview,
    deleted: p.deleted,
    reactions: p.reactions || [],
    mentionedUserIds: p.mentionedUserIds,
    mine: p.authorId === "u1",
  }));

  const peer = currentAsset?.name || asset;
  const assetDesc = currentAsset?.description || "";
  const isChat = currentAsset?.kind === "chat";
  const isFeed = currentAsset?.kind === "feed";
  const isBoard = currentAsset?.kind === "board";
  const isList = currentAsset?.kind === "list";

  async function react(messageId: string, emoji: string, add: boolean, clientId: string) {
    if (!currentAsset) throw new Error("Asset is no longer available");
    const key = ["posts", community, asset] as const;
    await qc.cancelQueries({ queryKey: key });
    const previous = qc.getQueryData<{ items: Post[]; nextCursor?: string | null }>(key);
    qc.setQueryData<{ items: Post[]; nextCursor?: string | null }>(key, old => ({
      ...old,
      items: (old?.items || []).map(post => {
        if (post.id !== messageId) return post;
        const reactions = post.reactions || [];
        return { ...post, reactions: add
          ? addReactionSummary(reactions, emoji, currentUser?.id || "u1", currentUser?.id || "u1")
          : removeReactionSummary(reactions, emoji) };
      }),
    }));
    try {
      await api.setMessageReaction("asset", currentAsset.id, messageId, emoji, add, clientId);
    } catch (error) {
      if (previous) qc.setQueryData(key, previous);
      throw error;
    }
  }

  if (commLoading) return <div className="flex h-full items-center justify-center"><Skeleton className="h-8 w-32" /></div>;
  if (!currentAsset) return <div className="flex h-full items-center justify-center p-8 text-center text-muted">Asset not found</div>;
  if (!canRead) return <div className="flex h-full items-center justify-center p-8 text-center text-muted">You don't have permission to view this asset.</div>;

  function jumpTo(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (el) { const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" }); setFlashId(id); setTimeout(() => setFlashId(x => x === id ? null : x), 1500); }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b px-4 bg-bg-2">
        <span className="font-semibold text-sm"># {peer}</span>
        {assetDesc && <span className="text-muted text-sm truncate max-w-[300px]">· {assetDesc}</span>}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" aria-label="Pinned messages" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text" title="Pinned messages">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 17v5M9 12v8m6-8v8M4 12c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg>
          </button>
          <button type="button" onClick={() => setMembersOpen(!membersOpen)} aria-label="Members" aria-expanded={membersOpen} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text" title="Members">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          </button>
          <div className="relative ml-2 hidden sm:block">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input ref={searchRef} type="search" placeholder={`Search ${communityDetail?.community?.name || community}`} className="h-8 w-52 rounded-lg border bg-bg-2 pl-9 pr-3 text-sm outline-none focus:border-blue-strong placeholder:text-muted" aria-label={`Search ${communityDetail?.community?.name || community}`} />
          </div>
        </div>
      </header>

      {showUnreadBanner && currentAsset.unreadCount && (
        <div data-testid="unread-banner" className="flex items-center justify-between border-b border-blue-border bg-blue-soft px-4 py-2 text-sm text-blue">
          <span>{currentAsset.unreadCount} new messages since {postsList[postsList.length - currentAsset.unreadCount]?.createdAt ? new Date(postsList[postsList.length - currentAsset.unreadCount].createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "earlier"}</span>
          <Button size="sm" variant="ghost" className="text-blue hover:bg-blue-soft hover:text-blue" onClick={() => markRead.mutate()}>Mark as read</Button>
        </div>
      )}

      <div ref={listRef} onScroll={event => {
        const element = event.currentTarget;
        setShowJumpLatest(element.scrollHeight - element.scrollTop - element.clientHeight > 160);
      }} className="relative min-h-0 flex-1 overflow-auto [overflow-anchor:auto]">
        {isChat || isFeed ? (
          <div className="p-3">
            {postsLoading && <div className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>}
            <ul className="divide-y divide-border/60">
              {postsList.map((p, i) => {
                const prev = i > 0 ? postsList[i - 1] : null;
                const showDay = !prev || dayLabel(prev.createdAt) !== dayLabel(p.createdAt);
                const isGrouped = config.GROUP_CONSECUTIVE_MESSAGES && prev && !showDay && canGroup(prev, p);
                const firstUnreadIndex = Math.max(0, postsList.length - (currentAsset.unreadCount || 0));
                return (
                  <li key={p.id}>
                    {showDay && <DaySeparator label={dayLabel(p.createdAt)} />}
                    {showUnreadBanner && currentAsset.unreadCount && i === firstUnreadIndex && <NewMessagesDivider />}
                    <MessageRow
                      item={p}
                      currentUserId={currentUser?.id || "u1"}
                      grouped={!!isGrouped}
                      flash={flashId === p.id || mentionJump.flashId === p.id}
                      onReply={canPost ? setReplyTo : undefined}
                      onDelete={p.mine ? (it) => qc.invalidateQueries({ queryKey: ["posts", community, asset] }) : undefined}
                      onJumpToReply={jumpTo}
                      showReactions={isChat}
                      canReact={canPost}
                      reactionDisabledReason={canPost ? undefined : myRole ? "You can't react here" : "Join to react"}
                      onFloatingUiChange={setFloatingUiOpen}
                      onReaction={(emoji, add, clientId) => react(p.id, emoji, add, clientId)}
                      onReactionUsers={(emoji, cursor) => api.listReactionUsers("asset", currentAsset.id, p.id, emoji, cursor)}
                    />
                  </li>
                );
              })}
              {!postsLoading && postsList.length === 0 && <p className="py-8 text-center text-sm text-muted">No messages yet.</p>}
            </ul>
          </div>
        ) : isList ? (
          <div className="p-3">
            <ul className="space-y-2">
              {itemsList.map(item => (
                <li key={item.id} className="flex items-start gap-3 rounded-lg border bg-surface p-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-hi text-[11px] font-semibold">{getInitials(item.createdBy ?? "") || "?"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium">{item.title}</span>
                      <span className="text-[11px] text-muted">{relativeTime(item.createdAt, now)}</span>
                    </div>
                    {item.description && <p className="mt-0.5 text-sm text-text/90">{item.description}</p>}
                    {item.date && <p className="mt-0.5 text-xs text-muted">📅 {new Date(item.date).toLocaleDateString()}</p>}
                    {item.place && <p className="mt-0.5 text-xs text-muted">📍 {item.place}</p>}
                    {item.link && <a href={item.link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-lime underline">Link</a>}
                  </div>
                </li>
              ))}
              {itemsList.length === 0 && <p className="py-8 text-center text-sm text-muted">No items yet.</p>}
            </ul>
          </div>
        ) : isBoard ? (
          <div className="p-3">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {["Idea", "Building", "Launched"].map(status => (
                <div key={status} className="rounded-xl border bg-surface p-3 min-h-[200px]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">{status}</span>
                    <span className="text-[11px] text-muted">{(projectsData || []).filter(p => p.status === status.toLowerCase()).length}</span>
                  </div>
                  <ul className="space-y-2">
                    {(projectsData || []).filter(p => p.status === status.toLowerCase()).map(p => (
                      <li key={p.id} className="rounded-lg border bg-bg-2 p-3">
                        <div className="font-medium">{p.title}</div>
                        <p className="mt-1 text-sm text-muted">{p.description}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {p.rolesNeeded.map(r => <span key={r} className="rounded border px-1.5 py-0.5 text-[10px] text-muted">{r}</span>)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-muted">Asset view for {currentAsset.kind} coming soon.</div>
        )}
        <div className="sr-only" aria-live="polite">{mentionJump.announcement}</div>
        {!floatingUiOpen && mentionJump.button && <div className="absolute bottom-3 right-3 z-30">{mentionJump.button}</div>}
        {!floatingUiOpen && showJumpLatest && (
          <button type="button" data-testid="jump-to-latest" onClick={() => { const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" }); setShowJumpLatest(false); }} className={`absolute right-3 z-20 flex items-center gap-2 rounded-full bg-blue-strong px-4 py-2 text-sm font-semibold text-bg shadow-lg hover:bg-blue-deep ${mentionJump.pendingCount ? "bottom-[68px] md:bottom-16" : "bottom-3"}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
            Jump to latest
          </button>
        )}
      </div>

      <div className="border-t bg-bg-2">
        {replyTo && canPost && (
          <div className="px-3 pt-2 flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <span className="text-muted">Replying to </span>
              <span className="font-medium">{replyTo.authorUsername ? `#${replyTo.authorUsername}` : "message"}</span>
              <span className="text-muted"> — {replyTo.deleted ? "Original message deleted" : replyTo.content.slice(0, 60)}</span>
            </div>
            <button className="text-muted hover:text-text" onClick={() => setReplyTo(null)}>Cancel</button>
          </div>
        )}
        {!canPost && canRead && currentAsset ? (
          <div className="p-3 text-center text-sm text-muted">
            {myRole ? "You do not have permission to send messages in this asset." : `Join ${communityDetail?.community?.name || "this community"} to chat`}
            {!myRole && <Button size="sm" className="ml-2" onClick={() => api.joinCommunity(communityDetail?.community?.id || community)}>Join</Button>}
          </div>
        ) : (
          <div className="p-3">
            {(isChat || isFeed) && canPost && (
              <div className="flex gap-2">
                <MentionInput value={messageText} onChange={setMessageText} scope="asset" roomId={currentAsset.id} onSubmit={() => { if (messageText.trim()) { sendPost.mutate(messageText.trim()); setMessageText(""); } }} placeholder="Message" className="w-full rounded-lg border bg-bg px-3 py-2 text-sm outline-none focus:border-blue-strong" />
                <Button onClick={() => { if (messageText.trim()) { sendPost.mutate(messageText.trim()); setMessageText(""); } }} disabled={sendPost.isPending || !messageText.trim()} aria-label="Send message">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9l20-7z"/></svg>
                </Button>
              </div>
            )}
            {isList && canPost && (
              <div className="flex gap-2">
                <Input placeholder="Title" className="flex-1" maxLength={100} onKeyDown={e => { if (e.key === "Enter" && e.currentTarget.value.trim()) { addItem.mutate({ title: e.currentTarget.value.trim() }); e.currentTarget.value = ""; } }} />
                <Button onClick={() => { const input = document.querySelector('input[placeholder="Title"]') as HTMLInputElement; if (input?.value.trim()) { addItem.mutate({ title: input.value.trim() }); input.value = ""; } }} disabled={addItem.isPending}>Add</Button>
              </div>
            )}
            {isBoard && canPost && (
              <div className="flex gap-2">
                <Input placeholder="Project title" className="flex-1" maxLength={100} onKeyDown={e => { if (e.key === "Enter" && e.currentTarget.value.trim()) { createProject.mutate({ title: e.currentTarget.value.trim(), description: "", status: "idea" }); e.currentTarget.value = ""; } }} />
                <Button onClick={() => { const input = document.querySelector('input[placeholder="Project title"]') as HTMLInputElement; if (input?.value.trim()) { createProject.mutate({ title: input.value.trim(), description: "", status: "idea" }); input.value = ""; } }} disabled={createProject.isPending}>Create</Button>
              </div>
            )}
          </div>
        )}
      </div>

      {membersOpen && (
        <MemberList communityId={communityDetail?.community?.id || community} onClose={() => setMembersOpen(false)} />
      )}
    </div>
  );
}

function NewMessagesDivider() {
  return (
    <div data-testid="new-messages-divider" className="my-3 flex items-center gap-2 text-[10px] font-bold tracking-wide text-blue-strong">
      <span className="h-px flex-1 bg-blue-strong" />
      <span>NEW</span>
    </div>
  );
}