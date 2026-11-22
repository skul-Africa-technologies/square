"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign } from "lucide-react";
import type { MentionRecord, MentionScope } from "@square/shared";
import { api } from "@/lib/api";

export function useMentionJump(scope: MentionScope, roomId: string, listRef: RefObject<HTMLDivElement | null>, messageCount = 0, enabled = true) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<MentionRecord[]>([]);
  const [buttonMounted, setButtonMounted] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const seenIds = useRef(new Set<string>());
  const pendingRef = useRef(pending);
  const currentRoomRef = useRef(roomId);
  pendingRef.current = pending;
  currentRoomRef.current = roomId;
  const { data: records = [] } = useQuery({
    queryKey: ["mentions", scope, roomId],
    queryFn: () => api.listMentions(scope, roomId),
    refetchInterval: 8_000,
    enabled,
  });

  useEffect(() => {
    if (pending.length) {
      setButtonMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setButtonMounted(false), 180);
    return () => window.clearTimeout(timer);
  }, [pending.length]);

  const markSeen = useCallback((record: MentionRecord) => {
    if (seenIds.current.has(record.messageId)) return;
    seenIds.current.add(record.messageId);
    setPending(current => current.filter(item => item.messageId !== record.messageId));
    void api.markMentionsSeen(scope, roomId, { messageIds: [record.messageId] })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["mentions", scope, roomId] });
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        void queryClient.invalidateQueries({ queryKey: ["community"] });
        void queryClient.invalidateQueries({ queryKey: ["my-communities"] });
        void queryClient.invalidateQueries({ queryKey: ["unread"] });
      })
      .catch(error => console.error("Could not mark mention as seen", error));
  }, [queryClient, roomId, scope]);

  useEffect(() => {
    const pendingIds = new Set(pendingRef.current.map(record => record.messageId));
    const added = records.filter(record => !seenIds.current.has(record.messageId) && !pendingIds.has(record.messageId)).length;
    setPending(current => {
      const currentIds = new Set(current.map(record => record.messageId));
      const next = [...current];
      for (const record of records) {
        if (!seenIds.current.has(record.messageId) && !currentIds.has(record.messageId)) {
          next.push(record);
          currentIds.add(record.messageId);
        }
      }
      return next.sort((a, b) => a.seq - b.seq);
    });
    if (added) {
      setAnnouncement("You were mentioned");
      const timer = window.setTimeout(() => setAnnouncement(""), 1800);
      return () => window.clearTimeout(timer);
    }
  }, [records]);

  useEffect(() => {
    const root = listRef.current;
    if (!root || !pending.length) return;
    const timers = new Map<string, number>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const messageId = entry.target.id.replace(/^msg-/, "");
        const record = pendingRef.current.find(item => item.messageId === messageId);
        if (!record) continue;
        if (entry.intersectionRatio >= 0.5) {
          if (!timers.has(messageId)) {
            timers.set(messageId, window.setTimeout(() => markSeen(record), 600));
          }
        } else {
          const timer = timers.get(messageId);
          if (timer !== undefined) window.clearTimeout(timer);
          timers.delete(messageId);
        }
      }
    }, { root, threshold: [0.5] });
    for (const record of pending) {
      const element = document.getElementById(`msg-${record.messageId}`);
      if (element) observer.observe(element);
    }
    return () => {
      observer.disconnect();
      for (const timer of timers.values()) window.clearTimeout(timer);
    };
  }, [listRef, markSeen, messageCount, pending]);

  const visitGeneration = useRef(0);
  useEffect(() => {
    const generation = ++visitGeneration.current;
    return () => {
      if (!enabled) return;
      const markAll = () => {
        void api.markMentionsSeen(scope, roomId, { all: true }, { keepalive: true })
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: ["mentions", scope, roomId] });
            void queryClient.invalidateQueries({ queryKey: ["conversations"] });
            void queryClient.invalidateQueries({ queryKey: ["community"] });
            void queryClient.invalidateQueries({ queryKey: ["my-communities"] });
            void queryClient.invalidateQueries({ queryKey: ["unread"] });
          })
          .catch(error => console.error("Could not mark mentions as seen while leaving chat", error));
      };
      if (currentRoomRef.current !== roomId) {
        markAll();
        return;
      }
      window.setTimeout(() => {
        if (visitGeneration.current !== generation) return;
        markAll();
      }, 0);
    };
  }, [enabled, queryClient, roomId, scope]);

  const jumpToOldest = useCallback(() => {
    const oldest = pendingRef.current[0];
    if (!oldest) return;
    const element = document.getElementById(`msg-${oldest.messageId}`);
    if (element) {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      element.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
      setFlashId(oldest.messageId);
      window.setTimeout(() => setFlashId(current => current === oldest.messageId ? null : current), 1500);
    }
    markSeen(oldest);
  }, [markSeen]);

  const button = buttonMounted ? (
    <button
      type="button"
      data-testid="mention-jump"
      aria-label={pending.length === 1 ? "Jump to your mention" : pending.length ? `Jump to your mentions (${pending.length})` : "Jump to your mention"}
      aria-hidden={!pending.length}
      disabled={!pending.length}
      onClick={jumpToOldest}
      className={`relative flex h-11 w-11 items-center justify-center rounded-full bg-blue-strong text-[#0B0D0B] shadow-lg transition-opacity duration-150 md:h-10 md:w-10 ${pending.length ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <AtSign aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
      {pending.length > 1 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-deep px-1 text-[10px] font-bold text-white">{pending.length > 99 ? "99+" : pending.length}</span>}
    </button>
  ) : null;

  return { button, flashId, announcement, pendingCount: pending.length };
}
