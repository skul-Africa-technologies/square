"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatUsername, getInitials, plural } from "@square/shared";
import { relativeTime, useNow } from "@/lib/time";
import { PresenceDot } from "@/components/shell/PresenceDot";
import { CommandPalette } from "@/components/shell/CommandPalette";
import clsx from "clsx";

export const MOBILE_HOME_DEFAULT = "discover" as const;

// ─── Types ───────────────────────────────────────────────────────────────────

interface CommunityItem {
  id: string;
  name: string;
  slug: string;
  blurb: string;
  memberCount: number;
  category: string;
  bannerUrl?: string;
  avatar?: string;
  isPublic: boolean;
}

interface PersonItem {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  schoolName?: string;
  sharedCommunities: number;
  sharedInterests: string[];
  interests: string[];
  canMessage: boolean;
}

interface BirthdayItem {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  isCurrentUser?: boolean;
}

interface EventItem {
  id: string;
  title: string;
  communityName: string;
  communitySlug: string;
  date: string;
  time?: string;
  place?: string;
}

interface StudentItem {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
}

// ─── Scroll-aware mask hook ───────────────────────────────────────────────────

function useMask(ref: React.RefObject<HTMLDivElement | null>) {
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const atStart = el.scrollLeft <= 4;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    el.classList.remove("mask-none", "mask-left", "mask-right", "mask-both");
    if (atStart && atEnd)       el.classList.add("mask-none");
    else if (atStart)           el.classList.add("mask-right");
    else if (atEnd)             el.classList.add("mask-left");
    else                        el.classList.add("mask-both");
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, [ref, update]);
}

// ─── Generated banner ────────────────────────────────────────────────────────

function GeneratedBanner({ name, category }: { name: string; category: string }) {
  const palette: Record<string, [string, string]> = {
    "Technology": ["#1d2a10", "#0b1a06"],
    "Web3":       ["#1d2a10", "#0b0d0b"],
    "AI":         ["#102030", "#0b0d0b"],
    "Design":     ["#152219", "#0b0d0b"],
    "Web2":       ["#12251b", "#0b0d0b"],
    "Arts":       ["#231a12", "#0b0d0b"],
    "Writing":    ["#1a1020", "#0b0d0b"],
    "Sports":     ["#20100b", "#0b0d0b"],
    "General":    ["#20200f", "#0b0d0b"],
  };
  const [c1, c2] = palette[category] || ["#1a1a1a", "#0b0d0b"];
  return (
    <div
      className="absolute inset-0"
      style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 flex items-center justify-center opacity-10">
        <span className="font-heading text-6xl font-black text-white select-none">{getInitials(name)}</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MobileHomeHub() {
  const qc = useQueryClient();
  const now = useNow();
  const [activeTab, setActiveTab] = useState<"discover" | "messages">(MOBILE_HOME_DEFAULT);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api.me(), staleTime: 30_000 });
  const { data: conversations, isLoading: convLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.listConversations(),
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
  const { data: discover, isLoading: discoverLoading } = useQuery({
    queryKey: ["discover"],
    queryFn: () => api.discover(),
  });

  const items = conversations || [];
  const totalUnread = items.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const recent = items.filter((c: { blocked?: boolean }) => !c.blocked).slice(0, 6);
  const firstUnread = items.findIndex((c: { unreadCount: number }) => c.unreadCount > 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function markAllRead() {
    for (const c of items) if (c.unreadCount > 0) await api.markRead(c.id);
    await qc.invalidateQueries({ queryKey: ["conversations"] });
    await qc.invalidateQueries({ queryKey: ["unread"] });
  }

  const sections = discover?.sections || [];

  return (
    // The mobile-sheet-content wrapper in AppShell provides the scrollable region.
    // MobileHomeHub itself is a flex-col; the user bar is absolute at bottom of .mobile-sheet.
    <div className="flex min-h-full flex-col">
      {/* Fixed header */}
      <header className="mobile-sheet-header flex items-center gap-2 border-b bg-bg-2 px-4 py-2 sticky top-0 z-10">
        <div className="flex-1 flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("discover")}
            className={clsx(
              "rounded-lg px-3 py-1.5 transition-colors",
              activeTab === "discover" ? "bg-lime text-bg" : "text-muted hover:bg-surface hover:text-text",
            )}
            aria-current={activeTab === "discover" ? "page" : undefined}
            aria-label="Discover"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polygon points="12 2 15 15 9 18"/><line x1="12" y1="12" x2="12.01" y2="12"/></svg>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("messages")}
            className={clsx(
              "relative rounded-lg px-3 py-1.5 transition-colors",
              activeTab === "messages" ? "bg-lime text-bg" : "text-muted hover:bg-surface hover:text-text",
            )}
            aria-current={activeTab === "messages" ? "page" : undefined}
            aria-label="Messages"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            {totalUnread > 0 && <span aria-label={`${totalUnread} unread messages`} className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-blue-strong" />}
          </button>
        </div>
        <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Search" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </button>
        <button type="button" onClick={() => setPaletteOpen(true)} aria-label="New message" className="flex h-9 w-9 items-center justify-center rounded-lg bg-lime text-bg hover:bg-lime-hover">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </header>

      {/* Scrollable content */}
      <div className="flex-1 px-4 pt-3 pb-24">
        {activeTab === "discover" ? (
          <MobileDiscoverView
            sections={sections}
            isLoading={discoverLoading}
            user={me}
            now={now}
          />
        ) : (
          <MobileMessagesView
            items={items}
            recent={recent}
            firstUnread={firstUnread}
            isLoading={convLoading}
            now={now}
            onMarkAllRead={markAllRead}
            me={me}
          />
        )}
      </div>

      {/* Floating user bar — rendered here, positioned absolute by .mobile-user-bar CSS */}
      <div className="mobile-user-bar sticky bottom-0 z-40 px-4 pt-2">
        {userOpen && (
          <div role="menu" className="mb-2 rounded-xl border bg-surface p-1 shadow-xl">
            <Link href={`/u/${me?.username || "amaka-eze"}`} prefetch={false} role="menuitem" className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-hi">Profile</Link>
            <Link href="/settings" prefetch={false} role="menuitem" className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-hi">Settings</Link>
          </div>
        )}
        <div className="flex items-center gap-2 rounded-full border bg-bg/95 p-1.5 pl-2 shadow-lg backdrop-blur">
          <span className="relative flex-shrink-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-hi text-xs font-semibold select-none">
              {me ? getInitials(me.username) : "??"}
            </span>
            <PresenceDot status="online" className="absolute -bottom-0.5 -right-0.5" />
          </span>
          <button
            type="button"
            onClick={() => setUserOpen(v => !v)}
            aria-expanded={userOpen}
            className="flex min-w-0 flex-1 items-center gap-1 text-left"
          >
            <span className="truncate text-sm text-name-self">{me ? formatUsername(me.username) : "…"}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={clsx("shrink-0 text-muted transition", userOpen && "rotate-180")} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          <button type="button" disabled aria-label="Notifications coming soon" title="Coming soon" className="flex h-8 w-8 items-center justify-center rounded-full text-muted/60">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>
          </button>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

// ─── Discover view ────────────────────────────────────────────────────────────

function MobileDiscoverView({
  sections,
  isLoading,
  user,
  now,
}: {
  sections: { id: string; items: unknown[] }[];
  isLoading: boolean;
  user?: { username: string; displayName?: string; id: string; joinedCommunitySlugs?: string[] } | null;
  now: number;
}) {
  if (isLoading) return <MobileDiscoverSkeletons />;

  const topCommunities = (sections.find(s => s.id === "topCommunities")?.items || []) as CommunityItem[];
  const people = (sections.find(s => s.id === "peopleYouMayKnow")?.items || []) as PersonItem[];
  const birthdays = (sections.find(s => s.id === "birthdays")?.items || []) as BirthdayItem[];
  const events = (sections.find(s => s.id === "events")?.items || []) as EventItem[];
  const newStudents = (sections.find(s => s.id === "newStudents")?.items || []) as StudentItem[];
  const interestCommunities = (sections.find(s => s.id === "interestCommunities")?.items || []) as CommunityItem[];

  return (
    <div className="space-y-8 pb-24">
      <MobileGreetingRow user={user} now={now} />

      {topCommunities.length > 0 && (
        <section aria-labelledby="mob-top-communities">
          <div className="flex items-center justify-between mb-3">
            <h2 id="mob-top-communities" className="font-heading text-sm font-semibold">Top communities to join</h2>
            <Link href="/explore" prefetch={false} className="text-xs text-lime hover:underline">See all</Link>
          </div>
          <MobileCommunityCardRow
            communities={topCommunities.filter(c => !user?.joinedCommunitySlugs?.includes(c.slug))}
          />
        </section>
      )}

      {people.length > 0 && (
        <section aria-labelledby="mob-people">
          <h2 id="mob-people" className="font-heading text-sm font-semibold mb-3">People you may know</h2>
          <MobilePeopleCardRow people={people} currentUserId={user?.id} />
        </section>
      )}

      {birthdays.length > 0 && (
        <section aria-labelledby="mob-birthdays">
          <h2 id="mob-birthdays" className="font-heading text-sm font-semibold mb-3">Celebrating today</h2>
          <MobileBirthdayStrip people={birthdays} currentUserId={user?.id} />
        </section>
      )}

      {events.length > 0 && (
        <section aria-labelledby="mob-events">
          <h2 id="mob-events" className="font-heading text-sm font-semibold mb-3">Upcoming events</h2>
          <MobileEventsList events={events} />
        </section>
      )}

      {newStudents.length > 0 && (
        <section aria-labelledby="mob-new-from-school">
          <h2 id="mob-new-from-school" className="font-heading text-sm font-semibold mb-3">New from your school</h2>
          <MobileNewStudentsRow students={newStudents} />
        </section>
      )}

      {interestCommunities.length > 0 && (
        <section aria-labelledby="mob-interests">
          <div className="flex items-center justify-between mb-3">
            <h2 id="mob-interests" className="font-heading text-sm font-semibold">Based on your interests</h2>
            <Link href="/explore" prefetch={false} className="text-xs text-lime hover:underline">See all</Link>
          </div>
          <MobileCommunityCardRow
            communities={interestCommunities.filter(c => !user?.joinedCommunitySlugs?.includes(c.slug))}
            excludeSlugs={topCommunities.map(c => c.slug)}
          />
        </section>
      )}
    </div>
  );
}

function MobileGreetingRow({ user, now }: { user?: { username: string; displayName?: string } | null; now: number }) {
  const date = new Date(now);
  const hour = date.getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const name = user?.displayName || user?.username || "there";
  const dateStr = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <div className="flex items-center gap-3 px-1">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime-tint text-lime font-semibold text-sm" aria-hidden="true">
        {timeOfDay[0].toUpperCase()}
      </div>
      <div>
        <p className="font-heading text-base font-semibold">Good {timeOfDay}, <span className="text-name-self">{formatUsername(name)}</span></p>
        <p className="text-xs text-muted">{dateStr}</p>
      </div>
    </div>
  );
}

// ─── Community card row (mobile) ──────────────────────────────────────────────

function MobileCommunityCardRow({ communities, excludeSlugs = [] }: { communities: CommunityItem[]; excludeSlugs?: string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const filtered = communities.filter(c => !excludeSlugs.includes(c.slug));
  useMask(scrollRef);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      className="card-row mask-right scrollbar-hide"
      role="list"
      style={{ marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}
    >
      {filtered.map(c => (
        <article
          key={c.id}
          className="community-photo-card"
          role="listitem"
          style={{ width: 240, scrollSnapAlign: "start" }}
        >
          <div className="banner" style={{ flex: "1 1 0", minHeight: 0, position: "relative", overflow: "hidden" }}>
            {c.bannerUrl ? (
              <div className="absolute inset-0" style={{ background: c.bannerUrl }} />
            ) : (
              <GeneratedBanner name={c.name} category={c.category} />
            )}
            <div className="gradient" />
            <div className="banner-info">
              <div className="avatar-wrap">
                {/* letter avatar — no img, no 404 */}
                <div className="avatar">{c.avatar || getInitials(c.name)}</div>
              </div>
              <div className="text">
                <div className="name">{c.name}</div>
                <div className="blurb">{c.blurb}</div>
              </div>
            </div>
          </div>
          <div className="footer">
            <div className="footer-info">
              <span className="members">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                {c.memberCount.toLocaleString()}
              </span>
              <span className="chip">{c.category}</span>
            </div>
            <button
              type="button"
              className="join-btn join"
              onClick={() => router.push(`/c/${c.slug}`)}
              aria-label={`Join ${c.name}`}
            >
              Join
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

// ─── Person card row (mobile) ─────────────────────────────────────────────────

function MobilePeopleCardRow({ people, currentUserId }: { people: PersonItem[]; currentUserId?: string }) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("square:dismissedPeople");
      if (stored) setDismissedIds(new Set(JSON.parse(stored) as string[]));
    } catch {}
  }, []);

  useMask(scrollRef);

  const filtered = people.filter(p => p.id !== currentUserId && !dismissedIds.has(p.id));

  const dismiss = (id: string) => {
    const next = new Set(dismissedIds);
    next.add(id);
    setDismissedIds(next);
    try { localStorage.setItem("square:dismissedPeople", JSON.stringify([...next])); } catch {}
  };

  if (filtered.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      className="card-row mask-right scrollbar-hide"
      role="list"
      style={{ marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}
    >
      {filtered.map(p => (
        <MobilePersonCard key={p.id} person={p} onDismiss={() => dismiss(p.id)} />
      ))}
    </div>
  );
}

function MobilePersonCard({ person, onDismiss }: { person: PersonItem; onDismiss: () => void }) {
  const router = useRouter();
  const initials = getInitials(person.username);

  const sharedText =
    person.sharedCommunities > 0
      ? plural(person.sharedCommunities, "community", "communities") + " in common"
      : plural(person.sharedInterests.length, "shared interest");

  const visibleChips = person.interests.slice(0, 2);
  const extraChips = person.interests.length - visibleChips.length;

  function openProfile(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest(".dismiss") || target.closest(".message-btn")) return;
    router.push(`/u/${person.username}`);
  }

  return (
    <div
      className="person-card"
      role="listitem"
      tabIndex={0}
      onClick={openProfile}
      onKeyDown={e => { if (e.key === "Enter") router.push(`/u/${person.username}`); }}
      aria-label={`View profile of ${formatUsername(person.username)}`}
    >
      {/* Only absolutely positioned child: dismiss X */}
      <button
        type="button"
        className="dismiss"
        onClick={e => { e.stopPropagation(); onDismiss(); }}
        aria-label="Dismiss suggestion"
      >✕</button>

      <div className="avatar-wrap">
        {person.avatarUrl ? (
          <img src={person.avatarUrl} alt="" draggable={false} />
        ) : (
          <span className="avatar-initials">{initials}</span>
        )}
      </div>

      <div className="username">{formatUsername(person.username)}</div>
      {person.schoolName && <div className="school">{person.schoolName}</div>}
      <div className="shared">{sharedText}</div>

      {visibleChips.length > 0 && (
        <div className="chips">
          {visibleChips.map(i => <span key={i} className="chip">{i}</span>)}
          {extraChips > 0 && <span className="chip">+{extraChips}</span>}
        </div>
      )}

      <button
        type="button"
        className="message-btn"
        onClick={e => { e.stopPropagation(); window.location.href = `/dm/${person.id}`; }}
        disabled={!person.canMessage}
        title={person.canMessage ? undefined : "Cannot message this person"}
      >
        Message
      </button>
    </div>
  );
}

// ─── Birthday strip (mobile) ──────────────────────────────────────────────────

function MobileBirthdayStrip({ people, currentUserId }: { people: BirthdayItem[]; currentUserId?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const filtered = people.filter(p => p.id !== currentUserId || p.isCurrentUser);
  useMask(scrollRef);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      className="card-row mask-right scrollbar-hide"
      role="list"
      style={{
        marginLeft: -16, marginRight: -16,
        paddingLeft: 16, paddingRight: 16,
        alignItems: "flex-start",
      }}
    >
      {filtered.map(p => (
        <div key={p.id} className="birthday-item" role="listitem">
          <div className="avatar-wrap">
            {p.avatarUrl ? (
              <img src={p.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <span className="avatar-initials">{getInitials(p.username)}</span>
            )}
            <span className="badge" aria-label="Birthday today">🎂</span>
          </div>
          <div className="username">{formatUsername(p.username)}</div>
          <button
            type="button"
            className="btn"
            onClick={() => {
              window.location.href = `/dm/${p.id}?prefill=${encodeURIComponent(`Happy birthday ${formatUsername(p.displayName || p.username)}! 🎉`)}`;
            }}
          >
            Say happy birthday
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Events (mobile) ─────────────────────────────────────────────────────────

function MobileEventsList({ events }: { events: EventItem[] }) {
  if (events.length === 0) return null;
  return (
    <div className="space-y-3" role="list">
      {events.map(e => (
        <article key={e.id} className="event-card" role="listitem">
          <div className="flex items-center gap-3">
            <div className="date-badge">
              <span className="day">{new Date(e.date).getDate()}</span>
              <span className="month">{new Date(e.date).toLocaleDateString(undefined, { month: "short" })}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="title truncate">{e.title}</p>
              <p className="community truncate">{e.communityName}</p>
            </div>
          </div>
          {(e.time || e.place) && (
            <div className="meta">
              {e.time && <span className="flex items-center gap-1"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>{e.time}</span>}
              {e.place && <span className="flex items-center gap-1"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0" /><circle cx="12" cy="10" r="3" /></svg>{e.place}</span>}
            </div>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => window.location.href = `/c/${e.communitySlug}/events`}
          >
            View
          </button>
        </article>
      ))}
    </div>
  );
}

// ─── New students (mobile) ────────────────────────────────────────────────────

function MobileNewStudentsRow({ students }: { students: StudentItem[] }) {
  if (students.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" role="list">
      {students.map(s => (
        <button
          key={s.id}
          type="button"
          onClick={() => window.location.href = `/dm/${s.id}?prefill=${encodeURIComponent(`Hi ${formatUsername(s.displayName || s.username)}! 👋`)}`}
          className="flex items-center gap-2 rounded-full border border-border/60 bg-surface px-3 py-1.5 text-sm hover:bg-surface-hi transition-colors"
          role="listitem"
        >
          <span className="h-6 w-6 shrink-0 rounded-full bg-lime-tint text-lime flex items-center justify-center text-[11px] font-semibold select-none">
            {getInitials(s.username)}
          </span>
          <span className="text-lime font-medium">{formatUsername(s.username)}</span>
          <span className="text-muted">Say hi</span>
        </button>
      ))}
    </div>
  );
}

// ─── Messages view (mobile) ───────────────────────────────────────────────────

function MobileMessagesView({
  items,
  recent,
  firstUnread,
  isLoading,
  now,
  onMarkAllRead,
  me,
}: {
  items: any[];
  recent: any[];
  firstUnread: number;
  isLoading: boolean;
  now: number;
  onMarkAllRead: () => void;
  me?: { username: string } | null;
}) {
  return (
    <div className="space-y-6 pb-24">
      {recent.length > 0 && (
        <section aria-label="Recent conversations" className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Recent</h2>
            {firstUnread >= 0 && (
              <button type="button" onClick={onMarkAllRead} className="text-[11px] text-lime hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-2 scrollbar-hide">
            {recent.map((c: any) => (
              <Link key={c.id} href={`/dm/${c.id}`} prefetch={false} className="w-[72px] shrink-0 text-center">
                <span className="relative mx-auto block h-14 w-14">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-hi text-sm font-semibold select-none">
                    {getInitials(c.participant.username)}
                  </span>
                  <PresenceDot status={c.presence} className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5" />
                  {c.unreadCount > 0 && (
                    <span className="absolute -right-1 top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-strong px-1 text-[10px] font-semibold text-bg">
                      {c.unreadCount > 99 ? "99+" : c.unreadCount}
                    </span>
                  )}
                </span>
                <span className="mt-1 block truncate text-[11px] text-muted">{formatUsername(c.participant.username)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Conversations">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Direct Messages</h2>
        {isLoading && <p className="py-3 text-sm text-muted">Loading…</p>}
        <div className="divide-y divide-border/60">
          {items.map((c: any, i: number) => {
            const unread = c.unreadCount > 0;
            const highlight = i === firstUnread;
            return (
              <Link
                key={c.id}
                href={`/dm/${c.id}`}
                prefetch={false}
                className={clsx("flex min-h-[56px] items-center gap-3 py-2", highlight && "rounded-lg bg-surface/60 px-2")}
              >
                <span className="relative shrink-0">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-hi text-[11px] font-semibold select-none">
                    {getInitials(c.participant.username)}
                  </span>
                  <PresenceDot status={c.presence} className="absolute -bottom-0.5 -right-0.5" />
                  {unread && <span aria-hidden="true" className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-blue-strong" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={clsx("truncate text-sm", unread ? "font-semibold" : "text-text/90")}>
                      {formatUsername(c.participant.username)}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted">{relativeTime(c.lastMessageAt, now)}</span>
                  </span>
                  <span className={clsx("block truncate text-xs", unread ? "text-text/80" : "text-muted")}>
                    {c.lastMessagePreview || c.lastMessage || "No messages yet"}
                  </span>
                </span>
                {unread && (
                  <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-blue-strong px-1 text-[10px] font-semibold text-bg">
                    {c.unreadCount > 99 ? "99+" : c.unreadCount}
                  </span>
                )}
                {Boolean(c.mentionCount) && (
                  <span aria-label={`${c.mentionCount} direct mentions`} className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-mention px-1 text-[10px] font-semibold text-bg">
                    {c.mentionCount > 99 ? "99+" : c.mentionCount}
                  </span>
                )}
              </Link>
            );
          })}
          {!isLoading && items.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">No conversations yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function MobileDiscoverSkeletons() {
  return (
    <div className="space-y-8 pb-24">
      <div className="h-10 w-1/3 rounded bg-surface-hi animate-pulse" />
      {[200, 220, 100].map((h, i) => (
        <div key={i} className="space-y-3">
          <div className="h-5 w-1/4 rounded bg-surface-hi animate-pulse" />
          <div className={`h-[${h}px] flex gap-3 overflow-hidden`}>
            {[1, 2, 3].map(j => (
              <div key={j} className="flex-1 max-w-[200px] h-full rounded-2xl bg-surface-hi animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
