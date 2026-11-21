"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getInitials } from "@square/shared";
import { CreateCommunityModal } from "./CreateCommunityModal";
import clsx from "clsx";

export function CommunityStrip() {
  const pathname = usePathname();
  const [creating, setCreating] = useState(false);
  const { data: myCommunities } = useQuery({
    queryKey: ["my-communities"],
    queryFn: () => api.myCommunities(),
    staleTime: 30_000,
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
          <span
            className={clsx(
              "relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border-2 transition-[border-color] duration-200",
              isHub ? "border-blue bg-blue-soft text-lime" : "border-blue-border bg-surface text-lime",
            )}
          >
            <Image src="/logo-mark.png" alt="" width={44} height={44} className="h-11 w-11 object-cover" />
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
              <span
                className={clsx(
                  "flex h-11 w-11 items-center justify-center rounded-full border-2 text-xs font-semibold transition-[border-color] duration-200",
                  active
                    ? "border-blue bg-blue-soft text-lime"
                    : "border-blue-border bg-surface text-lime",
                )}
              >
                {c.avatar || getInitials(c.name)}
              </span>
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
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-blue-border text-lime transition-[border-color] duration-200">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
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
          <span
            className={clsx(
              "flex h-11 w-11 items-center justify-center rounded-full border-2 transition-[border-color] duration-200",
              isExplore
                ? "border-blue bg-blue-soft text-lime"
                : "border-blue-border bg-surface text-lime",
            )}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="m15 9-2 6-6 2 2-6 6-2Z" />
            </svg>
          </span>
        </Link>
      </div>

      <CreateCommunityModal open={creating} onClose={() => setCreating(false)} />
    </nav>
  );
}
