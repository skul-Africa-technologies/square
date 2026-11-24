"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getInitials } from "@square/shared";
import { CreateCommunityModal } from "./CreateCommunityModal";
import { HexBadge } from "@/components/ui/redesign";

export function CommunityStrip() {
  const pathname = usePathname();
  const [creating, setCreating] = useState(false);
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
  const isHub = pathname === "/home" || pathname.startsWith("/dm");
  const isExplore = pathname.startsWith("/explore") || pathname.startsWith("/channels");

  return (
    <nav aria-label="Communities" className="strip-fixed">
      {/* ── Pinned header: Home button ─────────────────────────── */}
      <div className="strip-header flex flex-col items-center pt-3">
        <Link
          href="/home"
          prefetch={false}
          aria-label="Home"
          aria-current={isHub ? "page" : undefined}
          className="relative flex h-12 w-12 items-center justify-center"
        >
          <span className="relative">
            <HexBadge label="Square home" initials="S" active={isHub} unread={unread?.unread || 0} size={52} />
          </span>
        </Link>

        <div className="my-2 h-px w-8 shrink-0 bg-border" aria-hidden="true" />
      </div>

      {/* ── Scrollable community icons ─────────────────────────── */}
      <div className="strip-icons">
        {(myCommunities || []).map(c => {
          const href = `/c/${c.slug}`;
          const active = pathname.startsWith(`/c/${c.slug}`);
          return (
            <Link
              key={c.id}
              href={href}
              prefetch={false}
              aria-label={c.name}
              aria-current={active ? "page" : undefined}
              className="relative flex h-12 w-12 shrink-0 items-center justify-center"
            >
              <HexBadge
                label={c.name}
                initials={c.avatar || getInitials(c.name)}
                active={active}
                unread={(c.unreadCount || 0) + (c.mentions || 0)}
                size={52}
              />
            </Link>
          );
        })}
      </div>

      {/* ── Pinned footer: Create + Explore ───────────────────── */}
      <div className="strip-footer flex flex-col items-center gap-1 pb-3 pt-2">
        <div className="mb-1 h-px w-8 bg-border" aria-hidden="true" />
        <button
          type="button"
          onClick={() => setCreating(true)}
          aria-label="Create a community"
          className="relative flex h-12 w-12 items-center justify-center"
        >
          <span className="relative flex h-12 w-14 items-center justify-center">
            <svg viewBox="0 0 52 58" aria-hidden="true" className="absolute inset-0 h-full w-full">
              <polygon points="26,3 49,16 49,42 26,55 3,42 3,16" fill="none" stroke="#3a463f" strokeDasharray="3 4" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" className="text-lime" />
            </svg>
          </span>
        </button>

        <Link
          href="/explore"
          prefetch={false}
          aria-label="Explore"
          aria-current={isExplore ? "page" : undefined}
          className="relative flex h-12 w-12 items-center justify-center"
        >
          <HexBadge label="Explore" initials="EX" active={isExplore} unread={0} size={52} />
        </Link>
      </div>

      <CreateCommunityModal open={creating} onClose={() => setCreating(false)} />
    </nav>
  );
}
