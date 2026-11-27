"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getInitials } from "@square/shared";
import { useBack } from "@/lib/navigation";
import { CommunityStrip } from "./CommunityStrip";
import { HexBadge } from "@/components/ui/redesign";
import {
  STRIP_ANIMATION_MS,
  STRIP_EXPAND_GESTURE,
  STRIP_WIDTH_FULL,
  isRoomRoute,
} from "./mobileShell";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function MobileShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const back = useBack();
  const isRoom = isRoomRoute(pathname);

  const [open, setOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const switcherRef = useRef<HTMLButtonElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const gesture = useRef<{ startX: number; startY: number; horizontal: boolean; active: boolean } | null>(null);

  const { data: myCommunities } = useQuery({
    queryKey: ["my-communities"],
    queryFn: () => api.myCommunities(),
    staleTime: 30_000,
  });
  const { data: unread } = useQuery({
    queryKey: ["unread"],
    queryFn: () => api.unreadCount(),
    staleTime: 5_000,
    refetchInterval: 15_000,
  });

  const offset = open ? STRIP_WIDTH_FULL : dragOffset;
  const curved = !isRoom || offset > 0;
  const unreadCount = unread?.unread || 0;

  const close = useCallback(() => {
    setOpen(false);
    setDragOffset(0);
    setDragging(false);
    const target = restoreFocusRef.current;
    restoreFocusRef.current = null;
    if (target && document.contains(target)) target.focus();
  }, []);

  const openStrip = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      restoreFocusRef.current = active;
      active.blur();
    }
    setOpen(true);
    setDragOffset(0);
  }, []);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
    setDragOffset(0);
    setDragging(false);
    restoreFocusRef.current = null;
  }, [pathname]);

  // Escape + focus trap while the strip is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const root = stripRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // Move focus into the strip.
    const first = stripRef.current?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const onTouchStart = (event: ReactTouchEvent) => {
    if (!isRoom || !STRIP_EXPAND_GESTURE || open) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-no-drag]")) return;
    const touch = event.touches[0];
    if (!touch || touch.clientX > 24) return;
    gesture.current = { startX: touch.clientX, startY: touch.clientY, horizontal: false, active: true };
  };

  const onTouchMove = (event: ReactTouchEvent) => {
    const g = gesture.current;
    if (!g?.active) return;
    const touch = event.touches[0];
    if (!touch) return;
    const dx = touch.clientX - g.startX;
    const dy = touch.clientY - g.startY;
    if (!g.horizontal) {
      if (Math.abs(dx) < Math.abs(dy) || dx <= 0) {
        g.active = false;
        return;
      }
      g.horizontal = true;
      setDragging(true);
    }
    setDragOffset(clamp(dx, 0, STRIP_WIDTH_FULL));
  };

  const onTouchEnd = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.horizontal) {
      setDragging(false);
      setDragOffset(0);
      return;
    }
    if (dragOffset > STRIP_WIDTH_FULL / 2) openStrip();
    else close();
    setDragging(false);
    setDragOffset(0);
  };

  const transition = dragging ? "none" : `transform ${STRIP_ANIMATION_MS}ms ease-out, border-radius ${STRIP_ANIMATION_MS}ms ease-out`;

  // Current room's community icon (Square mark for DMs).
  const communitySlug = pathname.startsWith("/c/") ? pathname.split("/")[2] : undefined;
  const current = (myCommunities || []).find((c) => c.slug === communitySlug);
  const switcherInitials = current ? current.avatar || getInitials(current.name) : "S";
  const switcherLabel = current ? current.name : "Square";

  return (
    <div
      className="mobile-shell"
      data-room={isRoom ? "true" : "false"}
      data-open={open ? "true" : "false"}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div
        ref={stripRef}
        className="mobile-strip"
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? "Communities" : undefined}
        style={
          isRoom
            ? { transform: `translateX(${-STRIP_WIDTH_FULL + offset}px)`, transition, zIndex: 30 }
            : undefined
        }
        onClickCapture={(event) => {
          if (open && (event.target as HTMLElement).closest("a[href]")) close();
        }}
      >
        <CommunityStrip />
      </div>

      {isRoom && offset > 0 && (
        <div
          className="mobile-strip-scrim"
          style={{ left: STRIP_WIDTH_FULL, opacity: Math.min(0.2, (offset / STRIP_WIDTH_FULL) * 0.2), transition: dragging ? "none" : `opacity ${STRIP_ANIMATION_MS}ms ease-out` }}
          onClick={close}
          aria-hidden="true"
        />
      )}

      <div
        className="mobile-sheet"
        data-testid="mobile-sheet"
        style={
          isRoom
            ? {
                transform: `translateX(${offset}px)`,
                transition,
                borderTopLeftRadius: curved ? 24 : 0,
                borderLeftWidth: offset === 0 ? 0 : undefined,
                zIndex: 20,
              }
            : undefined
        }
      >
        {isRoom && (
          <header className="flex h-14 shrink-0 items-center gap-1 border-b bg-bg-2 px-2">
            <button
              ref={switcherRef}
              type="button"
              data-no-drag
              onClick={openStrip}
              aria-label={`Open communities${unreadCount ? `, ${unreadCount} unread` : ""}`}
              className="relative flex h-8 w-8 items-center justify-center rounded-full"
            >
              <HexBadge label={switcherLabel} initials={switcherInitials} unread={0} size={30} />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg-2 bg-blue-strong" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              data-no-drag
              onClick={back}
              aria-label="Back"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
            </button>
          </header>
        )}
        <div className="mobile-sheet-content min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}