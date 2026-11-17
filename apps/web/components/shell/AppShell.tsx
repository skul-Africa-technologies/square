"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { communities, channels, campaigns } from "@/lib/api/seed";
import { toDisplayUsername } from "@square/shared";
import clsx from "clsx";

export function AppShell({ children, rightRail }: { children: ReactNode; rightRail?: ReactNode }) {
  const pathname = usePathname();
  const activeCommunity = communities[0];
  const commChannels = channels.filter(c => c.communityId === "wc");
  const live = campaigns[0];
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="hidden lg:grid lg:grid-cols-[72px_260px_1fr_300px] min-h-screen">
        <aside className="border-r bg-bg flex flex-col items-center py-4 gap-3">
          <Link href="/explore" prefetch={false} className="h-10 w-10 rounded-xl overflow-hidden flex items-center justify-center border bg-surface hover:border-lime" aria-label="Square home">
            <Image src="/logo-mark.png" alt="Square" width={40} height={40} className="h-10 w-10 object-contain" />
          </Link>
          <div className="w-8 h-px bg-border" />
          {communities.slice(0, 4).map(c => (
            <Link key={c.id} href={`/c/${c.slug}`} prefetch={false} title={c.name} className={clsx("h-10 w-10 rounded-xl flex items-center justify-center text-xs font-semibold border", pathname.includes(c.slug) ? "bg-lime-tint border-lime text-lime" : "bg-surface text-muted hover:text-text")}>{c.avatar}</Link>
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
            <div className="mt-6 text-xs text-muted mb-2 px-2">LIVE NOW</div>
            <Link href="/c/web3-club/general/campaigns" prefetch={false} className="block rounded-lg border bg-surface p-2">
              <div className="text-sm font-medium">{live.title}</div>
              <div className="text-xs text-muted">Active campaign</div>
            </Link>
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
      <MobileNav />
    </div>
  );
}

function DefaultRightRail() {
  const live = campaigns[0];
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
      <section className="rounded-xl border bg-surface p-3">
        <div className="text-xs text-lime mb-1">Pinned campaign</div>
        <div className="font-heading text-sm mb-2">{live.title}</div>
        <div className="text-xs text-muted mb-2">{live.joined} of {live.target} testers joined</div>
        <div className="h-2 w-full rounded-full bg-bg-2 overflow-hidden"><div className="h-full bg-lime" style={{ width: `${(live.joined / live.target) * 100}%` }} /></div>
      </section>
      <button className="w-full rounded-lg bg-lime text-bg py-2 text-sm font-medium">+ New project</button>
    </div>
  );
}

function MobileNav() {
  const pathname = usePathname();
  const items = [
    { href: "/home", label: "Home" },
    { href: "/explore", label: "Explore" },
    { href: "/inbox", label: "Inbox" },
    { href: "/u/amaka-eze", label: "Me" },
  ];
  if (pathname.startsWith("/login")) return null;
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 border-t bg-bg/95 backdrop-blur flex justify-around py-2 z-50" aria-label="Primary">
      {items.map(i => (
        <Link key={i.href} href={i.href} prefetch={false} className={clsx("px-3 py-1 text-xs", pathname.startsWith(i.href) ? "text-lime" : "text-muted")}>{i.label}</Link>
      ))}
    </nav>
  );
}
