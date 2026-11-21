"use client";
import React, { forwardRef } from "react";
import { toDisplayUsername, getInitials, type ReplyPreview } from "@square/shared";
import clsx from "clsx";
import { getNameColor, isSelf } from "@/lib/nameColor";

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
};

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) => {
    if (/^https?:\/\/[^\s]+$/.test(part)) {
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue underline underline-offset-2 break-all">{part}</a>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
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
}>(function MessageRow({ item, currentUserId, grouped, showSeen, flash, onReply, onDelete, onRetry, onJumpToReply }, ref) {
  const name = item.authorUsername ? toDisplayUsername(item.authorUsername) : (item.authorId || "user");
  const initials = getInitials(item.authorUsername || item.authorId || "u");
  const nameColor = getNameColor(item.authorId, currentUserId);
  const self = isSelf(item.authorId, currentUserId);
  return (
    <div ref={ref} id={`msg-${item.id}`} className={clsx("group relative px-2 py-1 rounded-lg transition-colors", flash && "bg-lime-tint/30")}>
      <div className="flex gap-3">
        <div className="w-9 shrink-0">
          {!grouped && (
            <div className="h-9 w-9 rounded-full bg-surface-hi flex items-center justify-center text-xs font-semibold">{initials}</div>
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
            <p className="text-sm text-text/95 whitespace-pre-wrap break-words max-w-3xl">{linkify(item.content)}</p>
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
