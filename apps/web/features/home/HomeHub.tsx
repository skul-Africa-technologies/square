"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatUsername, getInitials, plural, pluralWord } from "@square/shared";
import { useNow } from "@/lib/time";

// ─── localStorage key ────────────────────────────────────────────────────────
const DISMISSED_KEY = "square:dismissedPeople";
const BIRTHDAY_KEY  = "square:birthdayBannerDate";

// ─── Types ───────────────────────────────────────────────────────────────────
interface CommunityItem {
  id: string; name: string; slug: string; blurb: string;
  memberCount: number; onlineCount?: number; category: string;
  bannerUrl?: string; avatar?: string; isPublic: boolean;
}
interface PersonItem {
  id: string; username: string; displayName?: string; avatarUrl?: string;
  schoolName?: string; sharedCommunities: number; sharedInterests: string[];
  interests: string[]; canMessage: boolean;
}
interface BirthdayItem {
  id: string; username: string; displayName?: string;
  avatarUrl?: string; isCurrentUser?: boolean;
}
interface EventItem {
  id: string; title: string; communityName: string; communitySlug: string;
  date: string; time?: string; place?: string;
}
interface StudentItem {
  id: string; username: string; displayName?: string; avatarUrl?: string;
}

// ─── Colour palette for generated banners ───────────────────────────────────
const BANNER_PALETTE: Record<string, [string, string, string]> = {
  Web3:    ["#0d1f10", "#1a3a1a", "#B6FF3B"],
  AI:      ["#0d1520", "#1a2a3a", "var(--blue)"],
  Design:  ["#1a1020", "#2a1a35", "#c084fc"],
  Web2:    ["#0f1a12", "#1a2e1f", "#6ee7b7"],
  Arts:    ["#1f1208", "#3a2010", "#fb923c"],
  Writing: ["#180f0f", "#2e1a1a", "#f87171"],
  Sports:  ["#0a1a0a", "#1a3010", "#86efac"],
  General: ["#141414", "#282828", "#a3a3a3"],
};

function bannerStyle(id: string, category: string): React.CSSProperties {
  const p = BANNER_PALETTE[category] ?? BANNER_PALETTE.General;
  // deterministic hue shift from id
  const shift = id.charCodeAt(0) % 60 - 30;
  return { background: `linear-gradient(135deg, ${p[0]} 0%, ${p[1]} 100%)` };
}

// ─── Scroll-aware mask hook ──────────────────────────────────────────────────
function useMask(ref: React.RefObject<HTMLDivElement | null>) {
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const atStart = el.scrollLeft <= 4;
    const atEnd   = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    el.classList.toggle("mask-fade-left",  !atStart);
    el.classList.toggle("mask-fade-right", !atEnd);
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

// ─── Main component ──────────────────────────────────────────────────────────
export function HomeHub() {
  const now = useNow();
  const qc  = useQueryClient();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [birthdayDismissed, setBirthdayDismissed] = useState(false);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api.me(), staleTime: 30_000 });
  const { data: discover, isLoading, isError, refetch } = useQuery({
    queryKey: ["discover"], queryFn: () => api.discover(), staleTime: 60_000,
  });

  // load dismissed ids
  useEffect(() => {
    try {
      const s = localStorage.getItem(DISMISSED_KEY);
      if (s) setDismissedIds(new Set(JSON.parse(s) as string[]));
    } catch {}
  }, []);

  // birthday banner: show once per day
  useEffect(() => {
    if (!me?.birthdayToday) return;
    try {
      const today = new Date().toDateString();
      if (localStorage.getItem(BIRTHDAY_KEY) === today) setBirthdayDismissed(true);
    } catch {}
  }, [me?.birthdayToday]);

  const dismiss = useCallback((id: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  const dismissBirthday = () => {
    setBirthdayDismissed(true);
    try { localStorage.setItem(BIRTHDAY_KEY, new Date().toDateString()); } catch {}
  };

  const sections = (discover?.sections as Array<{ id: string; items: unknown[] }>) ?? [];
  const get = <T,>(id: string) => (sections.find(s => s.id === id)?.items ?? []) as T[];

  const topCommunities      = get<CommunityItem>("topCommunities");
  const people              = get<PersonItem>("peopleYouMayKnow");
  const birthdays           = get<BirthdayItem>("birthdays");
  const events              = get<EventItem>("events");
  const newStudents         = get<StudentItem>("newStudents");
  const interestCommunities = get<CommunityItem>("interestCommunities");

  const topSlugs     = topCommunities.map(c => c.slug);
  const joinedSlugs  = me?.joinedCommunitySlugs ?? [];
  const myInterests  = (me?.skills ?? []).slice(0, 2);

  // people visible after dismissal
  const visiblePeople = people.filter(p => p.id !== me?.id && !dismissedIds.has(p.id)).slice(0, 5);
  // birthday for self — show banner, not in list
  const selfBirthday = birthdays.find(b => b.id === me?.id);
  const otherBirthdays = birthdays.filter(b => b.id !== me?.id).slice(0, 4);
  const extraBirthdays = Math.max(0, birthdays.filter(b => b.id !== me?.id).length - 4);
  const visibleEvents   = events.slice(0, 3);
  const interestTiles   = interestCommunities
    .filter(c => !joinedSlugs.includes(c.slug) && !topSlugs.includes(c.slug))
    .slice(0, 6);

  return (
    <div className="main-area">
      {/* ── 56 px top bar ── */}
      <header className="main-header flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <h1 className="font-heading text-sm font-semibold tracking-wide">Discover</h1>
        <span className="text-border">·</span>
        <span className="text-xs text-muted">{new Date(now).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button" disabled aria-label="Notifications — coming soon" title="Coming soon"
            className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-lg text-muted/50"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 19a2 2 0 0 0 4 0"/>
            </svg>
          </button>
        </div>
      </header>

      {/* ── self-birthday slim banner ── */}
      {me?.birthdayToday && selfBirthday && !birthdayDismissed && (
        <div
          role="status" aria-live="polite"
          className="flex shrink-0 items-center gap-3 border-b bg-lime-tint px-4 py-2.5 text-sm"
        >
          <span aria-hidden="true">🎂</span>
          <span className="font-heading font-semibold">Happy birthday, <span className="text-name-self">{formatUsername(me.username)}</span>!</span>
          <button
            type="button" onClick={dismissBirthday} aria-label="Dismiss birthday banner"
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text"
          >✕</button>
        </div>
      )}

      {/* ── scrollable content ── */}
      <div className="main-content">
        <div className="page-container">

          {/* ── HERO ─────────────────────────────────────────────────── */}
          <HeroCard me={me} now={now} />

          {/* ── loading / error states ── */}
          {isLoading && <DiscoverSkeletons />}
          {isError && !isLoading && (
            <div className="rounded-xl border bg-surface px-4 py-6 text-center text-sm text-muted">
              Couldn't load content.{" "}
              <button type="button" onClick={() => refetch()} className="text-lime hover:underline">Retry</button>
            </div>
          )}

          {/* ── sections (only render when loaded) ── */}
          {!isLoading && !isError && (
            <>
              {/* Top communities */}
              <section aria-labelledby="h-top-communities">
                {topCommunities.filter(c => !joinedSlugs.includes(c.slug)).length === 0 ? (
                  <EmptyState
                    message="No new communities to suggest right now."
                    cta={{ label: "Browse Explore", href: "/explore" }}
                  />
                ) : (
                  <CommunityCarousel
                    id="h-top-communities"
                    title="Top communities to join"
                    seeAll="/explore"
                    communities={topCommunities.filter(c => !joinedSlugs.includes(c.slug))}
                    joinedSlugs={joinedSlugs}
                    onJoin={(slug) => {
                      api.joinCommunity(slug).then(() => {
                        qc.invalidateQueries({ queryKey: ["discover"] });
                        qc.invalidateQueries({ queryKey: ["my-communities"] });
                      }).catch(() => {});
                    }}
                  />
                )}
              </section>

              {/* Two-column zone */}
              {(visiblePeople.length > 0 || otherBirthdays.length > 0 || visibleEvents.length > 0) && (
                <TwoColZone
                  people={visiblePeople}
                  birthdays={otherBirthdays}
                  extraBirthdays={extraBirthdays}
                  events={visibleEvents}
                  onDismiss={dismiss}
                />
              )}

              {/* Interest grid */}
              {interestTiles.length > 0 && (
                <section aria-labelledby="h-interests">
                  <SectionHeader
                    id="h-interests"
                    title={
                      myInterests.length > 0
                        ? `Because you like ${myInterests.join(" and ")}`
                        : "Based on your interests"
                    }
                    seeAll="/explore"
                  />
                  <InterestGrid communities={interestTiles} joinedSlugs={joinedSlugs} onJoin={(slug) => {
                    api.joinCommunity(slug).then(() => {
                      qc.invalidateQueries({ queryKey: ["discover"] });
                      qc.invalidateQueries({ queryKey: ["my-communities"] });
                    }).catch(() => {});
                  }} />
                </section>
              )}

              {/* New from school */}
              {newStudents.length > 0 && (
                <section aria-labelledby="h-new-school">
                  <SectionHeader id="h-new-school" title="New from your school" />
                  <NewStudentsRow students={newStudents} />
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Hero card ───────────────────────────────────────────────────────────────
function HeroCard({ me, now }: { me?: { username: string; skills?: string[] } | null; now: number }) {
  const hour = new Date(now).getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const [imageFailed, setImageFailed] = useState(false);
  const dateStr = new Date(now).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

  return (
    <div
      role="banner"
      className="relative rounded-[20px] border border-border overflow-hidden min-h-[220px] md:min-h-[220px] mb-5 md:mb-0 bg-[var(--bg-2)]"
    >
      {/* Mascot background image */}
      {!imageFailed && (
        <Image
          src="/images/hero-mascot.jpg"
          alt=""
          fill
          priority
          unoptimized
          sizes="100vw"
          quality={80}
          className="object-cover object-position-[78%_40%] md:object-position-right"
          style={{ transform: "scale(1.08)", transformOrigin: "center" }}
          blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAWABQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDno7eM3JEuJVPQjjcf/r1NNEskMcflxw5cBMEkYPc5JP8AKpUkx8kRQzNzng5/Go57dktk4yTkHIzzmsrklC+t/s0/lht3APTBoqwmnz3O54xwDt59aKFUjHRsLlpDCqDEOSE38n65p+6ORvL8oYJLDnGMZz06UUVHcQtjawyQbi0gOe2P60UUVjJu7E2f/2Q=="
          onError={() => setImageFailed(true)}
        />
      )}
      {imageFailed && (
        <div className="absolute inset-0 bg-[var(--bg-2)]" />
      )}

      {/* Overlays (mobile only; desktop keeps its own fade) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-10 md:hidden bg-[linear-gradient(90deg,rgba(11,13,11,0.94)_0%,rgba(11,13,11,0.78)_38%,rgba(11,13,11,0.2)_70%,rgba(11,13,11,0)_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 z-20 md:hidden bg-[linear-gradient(0deg,rgba(11,13,11,0.85)_0%,rgba(11,13,11,0)_55%)]"
      />
      {/* Desktop overlay */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-10 hidden md:block bg-[linear-gradient(90deg,rgba(11,13,11,0.92)_0%,rgba(11,13,11,0.75)_40%,rgba(11,13,11,0.15)_75%,rgba(11,13,11,0)_100%)]"
      />

      {/* Glows (mobile) */}
      <div aria-hidden="true" className="absolute z-30 md:hidden pointer-events-none" style={{
        bottom: -40, left: -40, width: 200, height: 200, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(182,255,59,0.14) 0%, transparent 70%)",
      }} />
      <div aria-hidden="true" className="absolute z-30 md:hidden pointer-events-none" style={{
        top: -40, right: -40, width: 160, height: 160, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(125,211,252,0.10) 0%, transparent 70%)",
      }} />

      {/* Content */}
      <div className="relative z-40 flex flex-col justify-between h-full p-20 md:p-20 md:pl-28 md:pt-24 md:pb-24 text-white">
        <div className="max-w-[62%] md:max-w-[55%] min-w-0">
          {/* Top pill */}
          <div className="flex items-center gap-2 mb-3 md:hidden">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-[var(--muted)] bg-[rgba(11,13,11,0.45)] backdrop-blur-[8px] border border-[rgba(255,255,255,0.08)]">
              {dateStr}
            </span>
          </div>

          {/* Middle: greeting + name */}
          <div className="flex flex-col gap-1">
            <p className="text-[14px] text-[var(--muted)] leading-none md:text-[28px] md:leading-[1.2]">
              {greeting},
            </p>
            <p className="text-[26px] font-[700] leading-[1.1] font-[var(--font-space-grotesk)] text-blue-strong truncate min-w-0 md:text-[28px] md:leading-[1.2]">
              {me ? formatUsername(me.username) : "…"}
            </p>
            <p className="text-[13px] text-[var(--muted)] leading-[1.4] line-clamp-2 max-w-[60%] md:line-clamp-none md:max-w-none mt-2 md:mt-6">
              Pick up a chat or find a new community.
            </p>
          </div>

          {/* Bottom row: buttons */}
          <div className="mt-6 md:mt-8 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
                }
              }}
              className="inline-flex items-center justify-center h-[44px] px-4 rounded-[12px] bg-lime text-bg font-semibold text-[13px] md:text-[14px] font-[var(--font-inter)] whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-strong"
              aria-label="Find people"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.47" /><path d="M16 3.13a4 4 0 0 1 0 5.74" /></svg>
              Find people
            </button>
            <Link
              href="/explore"
              prefetch={false}
              className="inline-flex items-center justify-center h-[44px] px-4 rounded-[12px] border border-[rgba(255,255,255,0.12)] bg-[rgba(11,13,11,0.35)] backdrop-blur-[8px] text-[var(--text)] font-semibold text-[13px] md:text-[14px] font-[var(--font-inter)] whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-strong"
            >
              Explore
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────
function SectionHeader({
  id, title, seeAll,
  prevDisabled, nextDisabled, onPrev, onNext,
}: {
  id: string; title: React.ReactNode; seeAll?: string;
  prevDisabled?: boolean; nextDisabled?: boolean;
  onPrev?: () => void; onNext?: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <h2 id={id} style={{ flex: 1, fontFamily: "var(--font-space-grotesk)", fontSize: 18, fontWeight: 600, margin: 0 }}>
        {title}
      </h2>
      {seeAll && (
        <Link href={seeAll} prefetch={false} style={{ fontSize: 13, color: "var(--lime)", textDecoration: "none" }}>
          See all
        </Link>
      )}
      {onPrev !== undefined && (
        <>
          <ArrowBtn dir="prev" disabled={!!prevDisabled} onClick={onPrev} />
          <ArrowBtn dir="next" disabled={!!nextDisabled} onClick={onNext!} />
        </>
      )}
    </div>
  );
}

function ArrowBtn({ dir, disabled, onClick }: { dir: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous" : "Next"}
      style={{
        width: 28, height: 28, borderRadius: "50%",
        border: "1px solid var(--border)",
        background: disabled ? "transparent" : "var(--surface)",
        color: disabled ? "var(--border)" : "var(--text)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        transition: "background 0.15s, color 0.15s",
        flexShrink: 0,
      }}
    >
      {dir === "prev"
        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
      }
    </button>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ message, cta }: { message: string; cta?: { label: string; href: string } }) {
  return (
    <div style={{ padding: "24px", textAlign: "center", color: "var(--muted)", fontSize: 14,
      border: "1px dashed var(--border)", borderRadius: 12 }}>
      <p>{message}</p>
      {cta && <Link href={cta.href} prefetch={false} style={{ color: "var(--lime)", fontSize: 13, marginTop: 8, display: "inline-block" }}>{cta.label}</Link>}
    </div>
  );
}

// ─── Community carousel ──────────────────────────────────────────────────────
function CommunityCarousel({ id, title, seeAll, communities, joinedSlugs, onJoin }: {
  id: string; title: string; seeAll?: string;
  communities: CommunityItem[]; joinedSlugs: string[]; onJoin: (slug: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft,  setCanLeft]  = useState(false);
  const [canRight, setCanRight] = useState(false);
  useMask(ref);

  const updateArrows = useCallback(() => {
    const el = ref.current; if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    updateArrows();
    el.addEventListener("scroll", updateArrows, { passive: true });
    const ro = new ResizeObserver(updateArrows); ro.observe(el);
    return () => { el.removeEventListener("scroll", updateArrows); ro.disconnect(); };
  }, [updateArrows]);

  const scroll = (d: number) => ref.current?.scrollBy({ left: d * 264, behavior: "smooth" });

  // keyboard: when the row is focused, arrow keys scroll
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); scroll(1); }
    if (e.key === "ArrowLeft")  { e.preventDefault(); scroll(-1); }
  };

  return (
    <>
      <SectionHeader
        id={id}
        title={title}
        seeAll={seeAll}
        prevDisabled={!canLeft}
        nextDisabled={!canRight}
        onPrev={() => scroll(-1)}
        onNext={() => scroll(1)}
      />
      <div
        ref={ref}
        role="list"
        aria-label={title}
        onKeyDown={onKeyDown}
        className="scrollbar-hide"
        style={{
          display: "flex", gap: 16, overflowX: "auto",
          scrollSnapType: "x mandatory", paddingBottom: 4,
        }}
      >
        {communities.map(c => (
          <CommunityCard key={c.id} community={c} joined={joinedSlugs.includes(c.slug)} onJoin={onJoin} />
        ))}
      </div>
    </>
  );
}

function CommunityCard({ community, joined, onJoin }: {
  community: CommunityItem; joined: boolean; onJoin: (slug: string) => void;
}) {
  const router = useRouter();
  const href = `/c/${community.slug}`;
    const initials = community.avatar && community.avatar.length <= 3
      ? community.avatar
      : getInitials(community.name);

  return (
    <article
      role="listitem"
      style={{
        width: 248, flexShrink: 0, scrollSnapAlign: "start",
        borderRadius: 14, border: "1px solid var(--border)",
        background: "var(--surface)", overflow: "hidden",
        display: "flex", flexDirection: "column",
        transition: "border-color 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(182,255,59,.4)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(0,0,0,.3)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
      }}
    >
      {/* Banner 248×112 */}
      <div
        style={{
          position: "relative", width: "100%", height: 112,
          flexShrink: 0, overflow: "hidden",
          ...bannerStyle(community.id, community.category),
        }}
        aria-hidden="true"
      >
        {/* Category pill top-left */}
        <span style={{
          position: "absolute", top: 8, left: 8,
          fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
          padding: "2px 8px", borderRadius: 999,
          background: "rgba(0,0,0,.55)", backdropFilter: "blur(4px)",
          color: "var(--text)",
        }}>
          {community.category}
        </span>
        {/* Faint watermark letter */}
        <span style={{
          position: "absolute", bottom: -8, right: 8,
          fontSize: 72, fontWeight: 900, lineHeight: 1,
          fontFamily: "var(--font-space-grotesk)",
          color: "rgba(255,255,255,.06)", pointerEvents: "none", userSelect: "none",
        }}>
          {initials[0]}
        </span>
      </div>

      {/* Avatar overlapping banner bottom edge */}
      <div style={{ position: "relative", height: 24, flexShrink: 0 }}>
        <div style={{
          position: "absolute", top: -24, left: 12,
          width: 48, height: 48, borderRadius: "50%",
          border: "3px solid var(--surface)",
          background: "var(--surface-hi)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700, fontSize: 14, fontFamily: "var(--font-space-grotesk)",
          color: "var(--lime)", userSelect: "none",
        }}>
          {initials}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: "4px 12px 0", minWidth: 0 }}>
        {/* Stretched link — card is one tab stop */}
        <a
          href={href}
          onClick={e => { e.preventDefault(); router.push(href); }}
          style={{ textDecoration: "none", outline: "none" }}
          aria-label={`Open ${community.name}`}
        >
          <p style={{
            fontSize: 15, fontWeight: 600, fontFamily: "var(--font-space-grotesk)",
            color: "var(--text)", margin: 0, whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {community.name}
          </p>
          <p style={{
            fontSize: 13, color: "var(--muted)", margin: "4px 0 0",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            overflow: "hidden", lineHeight: 1.4,
          }}>
            {community.blurb}
          </p>
        </a>
      </div>

      {/* Footer: members | online | Join */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center",
        gap: 8, padding: "10px 12px 12px", marginTop: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            {community.memberCount.toLocaleString()}
          </span>
          {(community.onlineCount ?? 0) > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} aria-hidden="true" />
              {community.onlineCount} online
            </span>
          )}
        </div>
        {/* Join button — separate focusable, z above the stretched link */}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); joined ? router.push(href) : onJoin(community.slug); }}
          aria-label={joined ? `Open ${community.name}` : `Join ${community.name}`}
          style={{
            height: 32, width: 64, borderRadius: 8, flexShrink: 0, cursor: "pointer",
            fontWeight: 600, fontSize: 13, fontFamily: "var(--font-inter)",
            background: joined ? "transparent" : "var(--lime)",
            color: joined ? "var(--lime)" : "var(--bg)",
            border: joined ? "1px solid var(--lime)" : "none",
            transition: "background 0.15s",
            position: "relative", zIndex: 1,
          }}
        >
          {joined ? "Joined" : "Join"}
        </button>
      </div>
    </article>
  );
}

// ─── Two-column zone ─────────────────────────────────────────────────────────
function TwoColZone({ people, birthdays, extraBirthdays, events, onDismiss }: {
  people: PersonItem[]; birthdays: BirthdayItem[]; extraBirthdays: number;
  events: EventItem[]; onDismiss: (id: string) => void;
}) {
  return (
    <div style={{
      display: "grid",
      // container-query-like: left 1fr, right 340px. At narrow widths the right col
      // is hidden via the @media fallback below — handled by the className.
      gridTemplateColumns: "1fr 340px",
      gap: 24,
    }}
    className="two-col-zone"
    >
      {/* Left: people */}
      {people.length > 0 && (
        <section aria-labelledby="h-people" style={{
          borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface)",
          overflow: "hidden", display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
            <h2 id="h-people" style={{ flex: 1, fontFamily: "var(--font-space-grotesk)", fontSize: 15, fontWeight: 600, margin: 0 }}>
              People you may know
            </h2>
          </div>
          <div role="list" style={{ flex: 1 }}>
            {people.map((p, i) => (
              <PersonRow key={p.id} person={p} onDismiss={onDismiss} divider={i < people.length - 1} />
            ))}
          </div>
        </section>
      )}

      {/* Right: birthdays + events stacked */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Birthdays */}
        {birthdays.length > 0 && (
          <section aria-labelledby="h-birthdays" style={{
            borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface)",
            overflow: "hidden",
          }}>
            <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center" }}>
              <h2 id="h-birthdays" style={{ flex: 1, fontFamily: "var(--font-space-grotesk)", fontSize: 15, fontWeight: 600, margin: 0 }}>
                Celebrating today 🎂
              </h2>
            </div>
            <div role="list">
              {birthdays.map((b, i) => (
                <BirthdayRow key={b.id} person={b} divider={i < birthdays.length - 1} />
              ))}
              {extraBirthdays > 0 && (
                <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--muted)" }}>
                  +{extraBirthdays} more
                </div>
              )}
            </div>
          </section>
        )}

        {/* Events */}
        {events.length > 0 && (
          <section aria-labelledby="h-events" style={{
            borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface)",
            overflow: "hidden",
          }}>
            <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center" }}>
              <h2 id="h-events" style={{ flex: 1, fontFamily: "var(--font-space-grotesk)", fontSize: 15, fontWeight: 600, margin: 0 }}>
                Upcoming events
              </h2>
            </div>
            <div role="list">
              {events.map((e, i) => (
                <EventRow key={e.id} event={e} divider={i < events.length - 1} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ─── Person row ───────────────────────────────────────────────────────────────
function PersonRow({ person, onDismiss, divider }: { person: PersonItem; onDismiss: (id: string) => void; divider: boolean }) {
  const router = useRouter();
  const initials = getInitials(person.username);
  const meta = [
    person.schoolName,
    person.sharedCommunities > 0
      ? plural(person.sharedCommunities, "community", "communities") + " in common"
      : person.sharedInterests.length > 0
        ? plural(person.sharedInterests.length, "shared interest")
        : null,
  ].filter(Boolean).join(" · ");

  return (
    <div
      role="listitem"
      style={{
        display: "grid", gridTemplateColumns: "44px 1fr auto",
        alignItems: "center", gap: 10, padding: "0 16px",
        height: 72, flexShrink: 0, minWidth: 0,
        borderBottom: divider ? "1px solid var(--border)" : "none",
      }}
    >
      {/* Avatar */}
      <button
        type="button"
        onClick={() => router.push(`/u/${person.username}`)}
        aria-label={`View profile of ${formatUsername(person.username)}`}
        style={{ width: 44, height: 44, borderRadius: "50%", border: "none", padding: 0, cursor: "pointer", flexShrink: 0, background: "var(--surface-hi)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 15, color: "var(--text)", userSelect: "none" }}
      >
        {person.avatarUrl
          ? <img src={person.avatarUrl} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
          : <span style={{ fontSize: 15, fontFamily: "var(--font-space-grotesk)" }}>{initials}</span>
        }
      </button>

      {/* Text */}
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, fontFamily: "var(--font-space-grotesk)", color: "var(--lime)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {formatUsername(person.username)}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {meta || "\u00A0"}
        </p>
        {/* up to 2 chips — only if they fit */}
        {person.interests.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginTop: 2, overflow: "hidden" }}>
            {person.interests.slice(0, 2).map(i => (
              <span key={i} style={{
                fontSize: 11, padding: "1px 6px", borderRadius: 999,
                border: "1px solid var(--border)", color: "var(--muted)",
                whiteSpace: "nowrap", flexShrink: 0,
              }}>{i}</span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => window.location.href = `/dm/${person.id}`}
          disabled={!person.canMessage}
          aria-label={`Message ${formatUsername(person.username)}`}
          style={{
            height: 32, padding: "0 12px", borderRadius: 8, cursor: person.canMessage ? "pointer" : "not-allowed",
            border: "1px solid var(--lime)", color: "var(--lime)", background: "transparent",
            fontWeight: 600, fontSize: 13, fontFamily: "var(--font-inter)",
            opacity: person.canMessage ? 1 : 0.4, whiteSpace: "nowrap",
          }}
        >Message</button>
        <button
          type="button"
          onClick={() => onDismiss(person.id)}
          aria-label="Dismiss suggestion"
          style={{
            width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)",
            background: "transparent", color: "var(--muted)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
  );
}

// ─── Birthday row ─────────────────────────────────────────────────────────────
function BirthdayRow({ person, divider }: { person: BirthdayItem; divider: boolean }) {
  const initials = getInitials(person.username);
  const prefill  = encodeURIComponent(`Happy birthday ${formatUsername(person.username)}! 🎉`);
  return (
    <div
      role="listitem"
      style={{
        display: "grid", gridTemplateColumns: "40px 1fr auto",
        alignItems: "center", gap: 10, padding: "0 16px",
        height: 52, minWidth: 0,
        borderBottom: divider ? "1px solid var(--border)" : "none",
      }}
    >
      {/* Avatar with ring */}
      <div style={{ position: "relative", width: 40, height: 40, flexShrink: 0 }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          border: "2px solid var(--lime)",
          background: "var(--surface-hi)",
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
        }}>
          {person.avatarUrl
            ? <img src={person.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--font-space-grotesk)", color: "var(--text)" }}>{initials}</span>
          }
        </div>
        {/* cake badge */}
        <span aria-label="birthday" style={{
          position: "absolute", bottom: -2, right: -2,
          width: 16, height: 16, borderRadius: "50%",
          background: "var(--lime)", color: "var(--bg)",
          fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center",
          border: "1.5px solid var(--surface)",
        }}>🎂</span>
      </div>

      {/* Text */}
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, fontFamily: "var(--font-space-grotesk)", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {formatUsername(person.username)}
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>Birthday today</p>
      </div>

      {/* Wish button */}
      <a
        href={`/dm/${person.id}?prefill=${prefill}`}
        aria-label={`Wish ${formatUsername(person.username)} happy birthday`}
        style={{
          height: 28, padding: "0 10px", borderRadius: 8, cursor: "pointer",
          border: "1px solid var(--border)", color: "var(--muted)",
          background: "transparent", fontWeight: 600, fontSize: 12,
          fontFamily: "var(--font-inter)", textDecoration: "none",
          display: "flex", alignItems: "center", whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >Wish</a>
    </div>
  );
}

// ─── Event row ────────────────────────────────────────────────────────────────
function EventRow({ event, divider }: { event: EventItem; divider: boolean }) {
  const router = useRouter();
  const d = new Date(event.date);
  const meta = [event.communityName, event.time, event.place].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      role="listitem"
      onClick={() => router.push(`/c/${event.communitySlug}/events`)}
      style={{
        display: "grid", gridTemplateColumns: "44px 1fr",
        alignItems: "center", gap: 10, padding: "0 16px",
        height: 64, width: "100%", background: "none", border: "none",
        cursor: "pointer", textAlign: "left", minWidth: 0,
        borderBottom: divider ? "1px solid var(--border)" : "none",
      }}
    >
      {/* Date badge */}
      <div style={{
        width: 44, height: 48, borderRadius: 8, flexShrink: 0,
        background: "var(--surface-hi)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", lineHeight: 1 }}>
          {d.toLocaleDateString(undefined, { month: "short" })}
        </span>
        <span style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-space-grotesk)", color: "var(--lime)", lineHeight: 1.1 }}>
          {d.getDate()}
        </span>
      </div>

      {/* Text */}
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, fontFamily: "var(--font-space-grotesk)", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {event.title}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {meta}
        </p>
      </div>
    </button>
  );
}

// ─── Interest grid ────────────────────────────────────────────────────────────
function InterestGrid({ communities, joinedSlugs, onJoin }: {
  communities: CommunityItem[]; joinedSlugs: string[]; onJoin: (slug: string) => void;
}) {
  const router = useRouter();
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
      gap: 8,
    }} role="list">
      {communities.slice(0, 6).map(c => {
        const initials = c.avatar && c.avatar.length <= 3 ? c.avatar : getInitials(c.name);
        const joined   = joinedSlugs.includes(c.slug);
        return (
          <div
            key={c.id}
            role="listitem"
            style={{
              display: "grid", gridTemplateColumns: "48px 1fr auto",
              alignItems: "center", gap: 10,
              height: 72, padding: "0 12px",
              borderRadius: 12, border: "1px solid var(--border)",
              background: "var(--surface)", minWidth: 0,
              cursor: "pointer", transition: "border-color 0.15s",
            }}
            onClick={() => router.push(`/c/${c.slug}`)}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "rgba(182,255,59,.4)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"}
          >
            {/* Avatar tile */}
            <div style={{
              width: 48, height: 48, borderRadius: 10, flexShrink: 0,
              background: bannerStyle(c.id, c.category).background as string,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 14, fontFamily: "var(--font-space-grotesk)",
              color: "rgba(255,255,255,.8)", userSelect: "none",
            }}>
              {initials}
            </div>

            {/* Text */}
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, fontFamily: "var(--font-space-grotesk)", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.name}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.memberCount.toLocaleString()} {pluralWord(c.memberCount, "member")} · {c.category}
              </p>
            </div>

            {/* Join */}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); joined ? router.push(`/c/${c.slug}`) : onJoin(c.slug); }}
              aria-label={joined ? `Open ${c.name}` : `Join ${c.name}`}
              style={{
                height: 32, padding: "0 14px", borderRadius: 8, flexShrink: 0, cursor: "pointer",
                fontWeight: 600, fontSize: 13, fontFamily: "var(--font-inter)",
                background: joined ? "transparent" : "var(--lime)",
                color: joined ? "var(--lime)" : "var(--bg)",
                border: joined ? "1px solid var(--lime)" : "none",
              }}
            >{joined ? "Joined" : "Join"}</button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Skeletons ────────────────────────────────────────────────────────────────// ─── New students row ─────────────────────────────────────────────────────────
function NewStudentsRow({ students }: { students: StudentItem[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} role="list">
      {students.slice(0, 6).map(s => (
        <a
          key={s.id}
          href={`/dm/${s.id}?prefill=${encodeURIComponent(`Hi ${formatUsername(s.username)}! 👋`)}`}
          role="listitem"
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 12px", borderRadius: 999,
            border: "1px solid var(--border)", background: "var(--surface)",
            textDecoration: "none", fontSize: 13,
            transition: "border-color 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(182,255,59,.4)"}
          onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border)"}
        >
          <span style={{
            width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
            background: "var(--surface-hi)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 600, color: "var(--lime)", userSelect: "none",
          }}>
            {getInitials(s.username)}
          </span>
          <span style={{ color: "var(--lime)", fontWeight: 600 }}>{formatUsername(s.username)}</span>
          <span style={{ color: "var(--muted)" }}>Say hi</span>
        </a>
      ))}
    </div>
  );
}

// ─── Skeletons ────────────────────────────────────────────────────────────────
function Sk({ w, h, r = 8 }: { w: string | number; h: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r, flexShrink: 0,
      background: "var(--surface-hi)",
      animation: "pulse 1.5s ease-in-out infinite",
    }} />
  );
}

function DiscoverSkeletons() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {/* hero */}
      <Sk w="100%" h={176} r={16} />

      {/* carousel */}
      <div>
        <Sk w="30%" h={20} r={6} />
        <div style={{ display: "flex", gap: 16, marginTop: 12, overflow: "hidden" }}>
          {[0, 1, 2, 3].map(i => <Sk key={i} w={248} h={252} r={14} />)}
        </div>
      </div>

      {/* two-col */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24 }}>
        <Sk w="100%" h={360} r={14} />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Sk w="100%" h={160} r={14} />
          <Sk w="100%" h={196} r={14} />
        </div>
      </div>

      {/* interest grid */}
      <div>
        <Sk w="40%" h={20} r={6} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px,1fr))", gap: 8, marginTop: 12 }}>
          {[0, 1, 2, 3, 4, 5].map(i => <Sk key={i} w="100%" h={72} r={12} />)}
        </div>
      </div>
    </div>
  );
}
