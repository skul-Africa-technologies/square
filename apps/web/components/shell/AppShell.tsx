"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { communities, channels, campaigns } from "@/lib/api/seed";
import { api } from "@/lib/api";
import { toDisplayUsername } from "@square/shared";
import clsx from "clsx";

export function AppShell({ children, rightRail }: { children: ReactNode; rightRail?: ReactNode }) {
  const pathname = usePathname();
  const activeCommunity = communities[0];
  const commChannels = channels.filter(c => c.communityId === "wc");
  const { data: unread } = useQuery({ queryKey: ["unread"], queryFn: () => api.unreadCount(), staleTime: 15_000, refetchInterval: 30_000 }); // PROPOSED
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="hidden lg:grid lg:grid-cols-[72px_260px_1fr_300px] min-h-screen">
        <aside className="border-r bg-bg flex flex-col items-center py-4 gap-3">
          <Link href="/home" prefetch={false} className="h-10 w-10 rounded-xl overflow-hidden flex items-center justify-center border bg-surface hover:border-lime" aria-label="Home">
            <Image src="/logo-mark.png" alt="Square" width={40} height={40} className="h-10 w-10 object-contain" />
          </Link>
          <Link href="/dm" prefetch={false} title="Messages" aria-label="Messages" className={clsx("relative h-10 w-10 rounded-xl flex items-center justify-center border", pathname.startsWith("/dm") || pathname.startsWith("/inbox") ? "bg-lime-tint border-lime text-lime" : "bg-surface text-muted hover:text-text")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5.5h16v13H4z"/><path d="M4 14h4l2 2h4l2-2h4"/></svg>
            {(unread?.count || 0) > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-lime text-bg text-[10px] font-semibold flex items-center justify-center">{unread?.count}</span>}
          </Link>
          <div className="w-8 h-px bg-border" />
          {communities.slice(0, 4).map(c => (
            <Link key={c.id} href={`/c/${c.slug}`} prefetch={false} title={c.name} className={clsx("h-10 w-10 rounded-xl flex items-center justify-center text-xs font-semibold border", pathname.includes(`/c/${c.slug}`) ? "bg-lime-tint border-lime text-lime" : "bg-surface text-muted hover:text-text")}>{c.avatar}</Link>
          ))}
          <button className="h-10 w-10 rounded-xl border border-dashed text-muted hover:text-lime hover:border-lime" aria-label="Create community">+</button>
        </aside>
        <aside className="border-r bg-bg-2 flex flex-col">
          <div className="p-4 border-b">
            <div className="font-heading font-semibold">{activeCommunity.name}</div>
            <div className="text-xs text-muted">412 members · FUT Minna</div>
          </div>
          <div className="p-3 flex-1 overflow-auto">
            <div className="text-xs text-muted mb-2 px-2">CHANNELS</div>
            <nav className="space-y-1">
              {commChannels.map(ch => (
                <Link key={ch.id} href={`/c/web3-club/${ch.slug}/general`} prefetch={false} className={clsx("block rounded-lg px-2 py-1.5 text-sm", pathname.includes(`/${ch.slug}/`) ? "bg-surface text-text" : "text-muted hover:text-text hover:bg-surface")}># {ch.name}</Link>
              ))}
            </nav>
          </div>
          <div className="p-3 border-t flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-surface-hi flex items-center justify-center text-xs">AE</div>
            <div className="min-w-0">
              <div className="text-sm truncate">{toDisplayUsername("amaka-eze")}</div>
              <div className="text-xs text-lime">Verified student</div>
            </div>
          </div>
        </aside>
        <main className="min-w-0 flex flex-col">{children}</main>
        <aside className="border-l bg-bg-2 p-4 hidden xl:block overflow-auto">
          {rightRail ?? <DefaultRightRail />}
        </aside>
      </div>
      <div className="lg:hidden pb-20 min-h-screen">{children}</div>
      <MobileNav unread={unread?.count || 0} />
    </div>
  );
}

function DefaultRightRail() {
  const live = campaigns.find(c => c.pinned && c.status === "active");
  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-heading text-sm mb-2">Members online</h3>
        <div className="space-y-2 text-sm text-muted">
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-lime" />#amaka-eze</div>
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-lime" />#tunde-ade</div>
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-lime" />#kemi-obi</div>
        </div>
      </section>
      {live && (
        <section className="rounded-xl border bg-surface p-3">
          <div className="text-xs text-lime mb-1">Pinned campaign</div>
          <div className="font-heading text-sm mb-2">{live.title}</div>
          <div className="text-xs text-muted mb-2">{live.joined} of {live.target} joined</div>
          <div className="h-2 w-full rounded-full bg-bg-2 overflow-hidden"><div className="h-full bg-lime" style={{ width: `${(live.joined / live.target) * 100}%` }} /></div>
        </section>
      )}
    </div>
  );
}

function MobileNav({ unread }: { unread: number }) {
  const pathname = usePathname();
  const items: { href: string; label: string; icon: (p: { active: boolean }) => ReactNode; badge?: number }[] = [
    { href: "/home", label: "Home", icon: HomeIcon },
    { href: "/explore", label: "Explore", icon: ExploreIcon },
    { href: "/inbox", label: "Inbox", icon: InboxIcon, badge: unread },
    { href: "/u/amaka-eze", label: "Me", icon: ProfileIcon },
  ];
  if (pathname.startsWith("/login")) return null;
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 border-t bg-bg/95 backdrop-blur flex justify-around py-3 z-50" aria-label="Primary">
      {items.map(i => {
        const active = pathname === i.href || pathname.startsWith(i.href + "/") || (i.href === "/home" && pathname === "/") || (i.href === "/inbox" && pathname.startsWith("/dm"));
        const Icon = i.icon;
        return (
          <Link key={i.href} href={i.href} prefetch={false} aria-label={i.label} aria-current={active ? "page" : undefined} className={clsx("relative flex h-10 w-10 items-center justify-center rounded-xl", active ? "text-lime bg-lime-tint" : "text-muted hover:text-text")}>
            <Icon active={active} />
            {i.badge ? <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-lime text-bg text-[10px] font-semibold flex items-center justify-center">{i.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.8V20h13V9.8" />
    </svg>
  );
}
function ExploreIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-2 6-6 2 2-6 6-2Z" />
    </svg>
  );
}
function InboxIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.5h16v13H4z" />
      <path d="M4 14h4l2 2h4l2-2h4" />
    </svg>
  );
}
function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19.5a7 7 0 0 1 14 0" />
    </svg>
  );
}
