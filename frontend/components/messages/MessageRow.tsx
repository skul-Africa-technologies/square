"use client";
import React, { forwardRef, lazy, Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toDisplayUsername, getInitials, type Paginated, type ReactionSummary, type ReactionUser, type ReplyPreview } from "@square/shared";
import clsx from "clsx";
import { SmilePlus } from "lucide-react";
import { getNameColor, isSelf } from "@/lib/nameColor";
import { RobotAvatar } from "@/components/ui/redesign";

const LazyReactionPicker = lazy(() => import("./ReactionPicker").then(module => ({ default: module.ReactionPicker })));

export type MessageItem = {
  id: string;
  authorId: string;
  authorUsername?: string;
  authorAvatarUrl?: string;
  content: string;
  createdAt: string;
  status?: "sending" | "sent" | "failed" | "seen";
  deleted?: boolean;
  pinned?: boolean;
  replyToId?: string;
  replyPreview?: ReplyPreview;
  mine?: boolean;
  reactions?: ReactionSummary[];
  mentionedUserIds?: string[];
};

function renderContent(text: string, currentUsername: string) {
  const usernamePattern = String.raw`[\p{L}\p{M}\p{Extended_Pictographic}\p{Emoji_Modifier}\u200D\uFE0F]+(?:-[\p{L}\p{M}\p{Extended_Pictographic}\p{Emoji_Modifier}\u200D\uFE0F]+)*`;
  const codeParts = text.split(/(`+[^`]*`+)/g);
  return codeParts.flatMap((chunk, chunkIndex) => {
    if (/^`+[^`]*`+$/.test(chunk)) {
      return <code key={`code-${chunkIndex}`} className="rounded bg-surface px-1 text-[0.95em]">{chunk.replace(/^`+|`+$/g, "")}</code>;
    }
    const parts = chunk.split(new RegExp(`(https?:\\/\\/[^\\s]+|(?<![\\p{L}\\p{N}._%+-])@${usernamePattern})`, "gu"));
    return parts.map((part, index) => {
      const key = `${chunkIndex}-${index}`;
      if (/^https?:\/\/[^\s]+$/.test(part)) {
        return <a key={key} href={part} target="_blank" rel="noopener noreferrer" className="text-blue underline underline-offset-2 break-all">{part}</a>;
      }
      if (new RegExp(`^@${usernamePattern}$`, "u").test(part)) {
        return <MentionPill key={key} username={part.slice(1)} currentUsername={currentUsername} />;
      }
      return <React.Fragment key={key}>{part}</React.Fragment>;
    });
  });
}

function MentionPill({ username, currentUsername }: { username: string; currentUsername: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Link
        href={`/u/${encodeURIComponent(username)}`}
        data-testid="mention-pill"
        className={clsx("rounded bg-blue-soft px-1 text-blue hover:underline", username.toLowerCase() === currentUsername.toLowerCase() && "font-semibold text-blue-strong")}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        @{username}
      </Link>
      {open && <span role="tooltip" className="absolute bottom-full left-0 z-30 mb-1 whitespace-nowrap rounded-lg border border-blue-border bg-bg-2 px-2 py-1 text-xs text-text shadow-lg">#{username} · View profile</span>}
    </span>
  );
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (day === today) return "Today";
  if (day === today - 86400000) return "Yesterday";
  return d.toLocaleDateString();
}

export function canGroup(a: MessageItem, b: MessageItem) {
  if (a.authorId !== b.authorId) return false;
  const ta = new Date(a.createdAt).getTime();
  const tb = new Date(b.createdAt).getTime();
  return Math.abs(tb - ta) <= 5 * 60 * 1000;
}

export const MessageRow = forwardRef<HTMLDivElement, {
  item: MessageItem;
  currentUserId?: string;
  grouped?: boolean;
  showSeen?: boolean;
  flash?: boolean;
  onReply?: (item: MessageItem) => void;
  onDelete?: (item: MessageItem) => void;
  onRetry?: (item: MessageItem) => void;
  onJumpToReply?: (id: string) => void;
  showReactions?: boolean;
  canReact?: boolean;
  reactionDisabledReason?: string;
  currentUsername?: string;
  onFloatingUiChange?: (open: boolean) => void;
  onReaction?: (emoji: string, add: boolean, clientId: string) => Promise<void>;
  onReactionUsers?: (emoji: string, cursor?: string) => Promise<Paginated<ReactionUser>>;
}>(function MessageRow({ item, currentUserId, grouped, showSeen, flash, onReply, onDelete, onRetry, onJumpToReply, showReactions, canReact = true, reactionDisabledReason, currentUsername = "amaka-eze", onFloatingUiChange, onReaction, onReactionUsers }, ref) {
  const name = item.authorUsername ? toDisplayUsername(item.authorUsername) : (item.authorId || "user");
  const nameColor = getNameColor(item.authorId, currentUserId);
  const self = isSelf(item.authorId, currentUserId);
  const [reactions, setReactions] = useState(item.reactions || []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [usersEmoji, setUsersEmoji] = useState<string | null>(null);
  const [reactionUsers, setReactionUsers] = useState<ReactionUser[]>([]);
  const [usersCursor, setUsersCursor] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const busy = useRef(new Set<string>());
  const lastTap = useRef(new Map<string, number>());
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setReactions(item.reactions || []), [item.reactions]);
  useEffect(() => () => { if (longPress.current) clearTimeout(longPress.current); }, []);
  useEffect(() => onFloatingUiChange?.(pickerOpen || !!usersEmoji), [onFloatingUiChange, pickerOpen, usersEmoji]);

  const mineCount = reactions.filter(reaction => reaction.me).length;

  async function toggleReaction(emoji: string) {
    if (!canReact || !onReaction || item.deleted) return;
    const previous = reactions;
    const current = previous.find(reaction => reaction.emoji === emoji);
    const add = !current?.me;
    const requestKey = `${item.id}:${emoji}`;
    const now = Date.now();
    if (busy.current.has(requestKey) || now - (lastTap.current.get(requestKey) || 0) < 250) return;
    lastTap.current.set(requestKey, now);
    if (add && (mineCount >= 10 || (!current && previous.length >= 20))) {
      setNotice("Reaction limit reached");
      window.setTimeout(() => setNotice(""), 2400);
      return;
    }
    const clientId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${item.id}-${now}`;
    busy.current.add(requestKey);
    setReactions(add
      ? current
        ? previous.map(reaction => reaction.emoji === emoji ? { ...reaction, count: reaction.count + 1, me: true } : reaction)
        : [...previous, { emoji, count: 1, me: true }]
      : previous.flatMap(reaction => reaction.emoji !== emoji || !reaction.me
        ? [reaction]
        : reaction.count > 1 ? [{ ...reaction, count: reaction.count - 1, me: false }] : []));
    try {
      await onReaction(emoji, add, clientId);
    } catch (error) {
      setReactions(previous);
      setNotice(error instanceof Error ? error.message : "Could not update reaction");
      window.setTimeout(() => setNotice(""), 2400);
    } finally {
      busy.current.delete(requestKey);
    }
  }

  async function showReactors(emoji: string, cursor?: string) {
    if (!onReactionUsers) return;
    setUsersEmoji(emoji);
    setLoadingUsers(true);
    try {
      const page = await onReactionUsers(emoji, cursor);
      setReactionUsers(current => cursor ? [...current, ...page.items] : page.items);
      setUsersCursor(page.nextCursor || null);
    } catch {
      setNotice("Could not load reactions");
      window.setTimeout(() => setNotice(""), 2400);
    } finally {
      setLoadingUsers(false);
    }
  }

  function openReactors(emoji: string) {
    void showReactors(emoji);
  }

  function closePicker() {
    setPickerOpen(false);
    requestAnimationFrame(() => addButtonRef.current?.focus());
  }

  return (
    <div ref={ref} id={`msg-${item.id}`} data-testid="message-row" className={clsx("group relative rounded-lg px-2 py-1 transition-colors motion-reduce:transition-none [overflow-anchor:auto]", flash && "bg-blue-soft outline outline-1 outline-blue-border")}>
      <div className="flex gap-3">
        <div className="w-9 shrink-0">
          {!grouped && (
            <RobotAvatar
              id={item.authorId}
              pictureUrl={item.authorAvatarUrl}
              size={36}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {!grouped && (
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className={clsx("text-sm font-semibold", nameColor)}>{name}{self && <span className="sr-only"> (you)</span>}</span>
              <span className="text-[11px] text-muted">{new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              {item.pinned && <span className="text-[11px] text-lime">Pinned</span>}
            </div>
          )}
          {item.replyPreview && (
            <button type="button" onClick={() => item.replyPreview && onJumpToReply?.(item.replyPreview.id)} className="mb-1 flex items-center gap-2 text-xs text-muted hover:text-text w-full min-w-0">
              <span className="w-4 h-3 border-l-2 border-t-2 border-blue rounded-tl-sm translate-y-1 shrink-0" aria-hidden />
              <span className="font-medium shrink-0 text-blue">
                {toDisplayUsername(item.replyPreview.authorUsername || "unknown")}
                {currentUserId === "u1" && item.replyPreview.authorUsername === "amaka-eze" && <span className="sr-only"> (you)</span>}
              </span>
              <span className="truncate min-w-0">{item.replyPreview.deleted ? "Original message deleted" : item.replyPreview.snippet || "Message"}</span>
            </button>
          )}
          {item.deleted ? (
            <p className="text-sm text-muted italic">Message deleted</p>
          ) : (
            <p className="max-w-3xl whitespace-pre-wrap break-words text-sm text-text/95">{renderContent(item.content, currentUsername)}</p>
          )}
          {showReactions && !item.deleted && (
            <div className="relative mt-1 flex min-h-7 flex-wrap items-center gap-1.5" data-testid="reaction-row">
              {reactions.map(reaction => (
                <button
                  key={reaction.emoji}
                  type="button"
                  aria-pressed={reaction.me}
                  aria-label={`${reaction.emoji} ${reaction.count} ${reaction.count === 1 ? "reaction" : "reactions"}${reaction.me ? ", you reacted" : ""}`}
                  title={`${reaction.me ? "You, " : ""}${Math.max(0, reaction.count - Number(reaction.me))} others reacted with ${reaction.emoji}`}
                  onClick={event => event.altKey ? openReactors(reaction.emoji) : void toggleReaction(reaction.emoji)}
                  onContextMenu={event => { event.preventDefault(); openReactors(reaction.emoji); }}
                  onPointerDown={() => {
                    if (longPress.current) clearTimeout(longPress.current);
                    longPress.current = setTimeout(() => openReactors(reaction.emoji), 500);
                  }}
                  onPointerUp={() => { if (longPress.current) clearTimeout(longPress.current); }}
                  onPointerLeave={() => { if (longPress.current) clearTimeout(longPress.current); }}
                  className={clsx("flex h-7 items-center gap-1 rounded-lg border px-2 text-xs transition-colors hover:bg-surface-hi", reaction.me ? "border-blue-border bg-blue-soft text-blue" : "border-border bg-surface text-muted")}
                >
                  <span className="text-base leading-none">{reaction.emoji}</span>
                  <span>{reaction.count >= 1000 ? `${(reaction.count / 1000).toFixed(1).replace(/\\.0$/, "")}k` : reaction.count}</span>
                </button>
              ))}
              <button
                ref={addButtonRef}
                type="button"
                aria-label={canReact ? "Add reaction" : reactionDisabledReason || "You can't react here"}
                title={!canReact ? reactionDisabledReason || "You can't react here" : "Add reaction"}
                disabled={!canReact}
                onClick={() => setPickerOpen(true)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted opacity-60 transition-opacity hover:bg-surface-hi hover:text-blue-strong focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-40 md:group-hover:opacity-100"
              >
                <SmilePlus className="h-4 w-4" aria-hidden="true" />
              </button>
              {pickerOpen && (
                <Suspense fallback={<div role="status" className="fixed bottom-0 left-0 z-[100] h-[55vh] w-full animate-pulse rounded-t-[var(--sheet-radius)] bg-bg-2 md:bottom-auto md:h-[380px] md:w-[320px] md:rounded-xl" />}>
                  <LazyReactionPicker
                    anchorRef={addButtonRef}
                    existing={reactions.map(reaction => reaction.emoji)}
                    mine={reactions.filter(reaction => reaction.me).map(reaction => reaction.emoji)}
                    disableNewDistinct={reactions.length >= 20}
                    disableNewForUser={mineCount >= 10}
                    onSelect={(emoji, keepOpen) => {
                      void toggleReaction(emoji);
                      if (!keepOpen) closePicker();
                    }}
                    onLimitReached={() => { setNotice("Reaction limit reached"); window.setTimeout(() => setNotice(""), 2400); }}
                    onClose={closePicker}
                  />
                </Suspense>
              )}
              {notice && <span role="status" className="basis-full text-xs text-blue">{notice}</span>}
              {usersEmoji && (
                <div role="dialog" aria-label={`Who reacted with ${usersEmoji}`} className="fixed inset-x-0 bottom-0 z-[101] max-h-[50vh] overflow-y-auto rounded-t-[var(--sheet-radius)] border border-blue-border bg-bg-2 p-4 shadow-2xl md:absolute md:inset-x-auto md:bottom-8 md:left-0 md:w-72 md:rounded-xl">
                  <div className="mb-3 flex items-center justify-between">
                    <strong className="text-sm">{usersEmoji} reactions</strong>
                    <button type="button" aria-label="Close reactions" onClick={() => setUsersEmoji(null)} className="rounded px-2 py-1 text-muted hover:bg-surface">Close</button>
                  </div>
                  <div className="mb-2 flex gap-1">{reactions.map(reaction => <button key={reaction.emoji} type="button" onClick={() => openReactors(reaction.emoji)} className="rounded px-2 py-1 text-xs hover:bg-surface">{reaction.emoji} {reaction.count}</button>)}</div>
                  <ul className="space-y-2">
                    {reactionUsers.map(user => (
                      <li key={user.id} className={clsx("flex items-center gap-2 text-sm", user.me ? "text-blue" : "text-name-other")}>
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-[10px]">{getInitials(user.username)}</span>
                        #{user.me ? "you" : user.username}
                      </li>
                    ))}
                  </ul>
                  {loadingUsers && <p className="py-2 text-xs text-muted">Loading…</p>}
                  {usersCursor && <button type="button" disabled={loadingUsers} onClick={() => void showReactors(usersEmoji, usersCursor)} className="mt-2 text-xs text-blue hover:underline">Load more</button>}
                </div>
              )}
            </div>
          )}
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
            {item.mine && item.status === "sending" && <span>Sending…</span>}
            {item.mine && item.status === "failed" && <><span className="text-red-400">Failed</span>{onRetry && <button className="text-lime hover:underline" onClick={() => onRetry(item)}>Retry</button>}</>}
            {showSeen && item.mine && item.status === "seen" && <span>Seen</span>}
          </div>
        </div>
        {!item.deleted && (
          <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-start gap-1 shrink-0">
            {onReply && <button className="text-xs text-muted hover:text-text px-2 py-1 rounded border bg-bg" onClick={() => onReply(item)}>Reply</button>}
            {item.mine && onDelete && <button className="text-xs text-muted hover:text-text px-2 py-1 rounded border bg-bg" onClick={() => onDelete(item)}>Delete</button>}
          </div>
        )}
      </div>
    </div>
  );
});

export function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-3 px-2">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[11px] text-muted">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
