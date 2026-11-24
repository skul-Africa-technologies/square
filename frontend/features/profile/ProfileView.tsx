"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatUsername, getInitials, plural, pluralWord } from "@square/shared";
import type { Activity, Badge, Community, Project, PresenceStatus, User } from "@square/shared";
import type { Profile } from "@/lib/api/types";
import Image from "next/image";
import clsx from "clsx";
import { PresenceDot } from "@/components/shell/PresenceDot";

const PROFILE_TABS: { key: string; label: string; icon: string; count?: number }[] = [
  { key: "about", label: "About", icon: "user" },
  { key: "communities", label: "Communities", icon: "users" },
  { key: "badges", label: "Badges", icon: "award" },
  { key: "projects", label: "Projects", icon: "briefcase" },
  { key: "activity", label: "Activity", icon: "clock" },
];

function monthYear(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short" }) + " " + d.getFullYear();
}
function fullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
function relativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const secs = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
function isImageUrl(v?: string | null): v is string {
  return !!v && (v.startsWith("/") || v.startsWith("http") || v.startsWith("data:") || v.startsWith("blob:"));
}

function bannerGradient(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) | 0;
  const palettes: [string, string][] = [
    ["#1d2a10", "#0b0d0b"],
    ["#152219", "#0b0d0b"],
    ["#12251b", "#0b0d0b"],
    ["#20200f", "#0b0d0b"],
    ["#231a12", "#0b0d0b"],
    ["#1a102a", "#0b0d0b"],
  ];
  const [a, b] = palettes[Math.abs(hash) % palettes.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

const ICONS: Record<string, string> = {
  "shield-check": `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="22 12 14 12 10 18"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  rocket: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 6h-6a6 6 0 1 0 7.2 10.56L22 12.16V6z"/><path d="M6.2 17.8c-.3 1.1-.3 2.4 0 3.5l4.4 4.4c1.1 1.1 2.8 1.1 3.9 0l4.4-4.4c1.1-1.1 1.1-2.8 0-3.9L17.8 6.2z"/><path d="M12.5 10.5L19 4"/></svg>`,
  trophy: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 15V8c0-2.2-1.8-4-4-4h-2c-2.2 0-4 1.8-4 4v7"/><path d="M7 10c0-2.2 1.8-4 4-4h6c2.2 0 4 1.8 4 4"/><path d="M11 15h2v4h-2z"/><path d="M9 20h6"/></svg>`,
  flame: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 20.5c0-2.5 3-4 3-6.5s0-5-3-7c-3-2-5-1-6 1-1 2-2 5-1 7 0 2 1 4 1 4.5z"/><path d="M14 14c0-2.5 3-4 3-6.5s0-5-3-7c-3-2-5-1-6 1-1 2-2 5-1 7 0 2 1 4 1 4.5z"/></svg>`,
  star: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  handshake: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9c0-2-2-3-4-3-1 0-2 1-2 3"/><path d="M10 9c0-2 2-3 4-3 1 0 2 1 2 3"/><path d="M14 9h-4"/><path d="M19 9c0-2-2-3-4-3-1 0-2 1-2 3"/><path d="M15 9c0-2 2-3 4-3 1 0 2 1 2 3"/><path d="M19 9h-4"/><path d="M9 12l2 2 4-4"/><path d="M15 12l-2 2-4-4"/></svg>`,
  users: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  bug: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="10" r="2"/><path d="M12 12v2"/><path d="M12 16v2"/><path d="M8 8c-.4-.4-.8-.7-1.3-1"/><path d="M16 8c.4-.4.8-.7 1.3-1"/><path d="M8 16c-.4.4-.8.7-1.3 1"/><path d="M16 16c.4.4.8.7 1.3 1"/><path d="M12 6c-1.7 0-3 1.3-3 3"/><path d="M12 6c1.7 0 3 1.3 3 3"/></svg>`,
  pencil: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3l2.29 2.29-4.58 4.58L3 17.29 2 16l4.58-4.58z"/><path d="M20.71 8.29 19 2"/></svg>`,
  share: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.42" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
  "external-link": `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>`,
  github: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.333-.6-.55-1.215-.35-.227 0-.467-.11-.77-.225-1.17-.292-2.19-.884-2.19-2.645 0-.584.21-1.058.572-1.435-.15-.056-.62-.28-.855-.44-.53-.24-.74-.65-.74-1.26 0-.285.1-.57.27-.835.36-.692 1.19-1.17 2.12-.855 0 0 .69-.22 2.26.82.655-.18 1.35-.27 2.05-.27.7 0 1.395.09 2.055.27 1.57-1.04 2.26-.82 2.26-.82.93.315 1.75.163 2.12.855.17.265.27.55.27.835 0 .61-.21 1.02-.74 1.26-.235.16-.72.385-1.22.44.36.377.572.85.572 1.435 0 1.31-1.245 2.34-5.475 2.34-.265 0-.525-.025-.795-.15-1.005-.405-1.605-.975-1.605-1.985 0-.545.21-1.055.57-1.435.455-.33.96-.36 1.44-.36 1.08 0 2.13.585 2.53 1.455.05.055.075.11.075.165 0 1.41-.01 2.55-.015 2.85 0 .32.22.69.825.58C20.565 21.795 24 17.295 24 12.295c0-6.627-5.373-12-12-12"/></svg>`,
  x: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231z"/></svg>`,
  linkedin: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.136.919-2.063 2.063-2.063 1.14 0 2.064.93 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM20.447 7.505c-1.14 0-2.063-.926-2.063-2.065 0-1.136.919-2.063 2.063-2.063 1.14 0 2.064.93 2.064 2.063 0 1.139-.925 2.065-2.064 2.065z"/></svg>`,
  globe: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  lock: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  plus: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  calendar: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  building: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10h18v10H3z"/><path d="M12 10V4l6 6M18 10v10M6 10v10"/></svg>`,
  chat: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,
  compass: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="12 2 15 15 9 18"/><line x1="12" y1="12" x2="12.01" y2="12"/></svg>`,
};

function Icon({ name, className = "", size = 20, color, opacity }: { name: string; className?: string; size?: number; color?: string; opacity?: number }) {
  const svg = ICONS[name];
  if (!svg) return <span className={clsx("text-muted", className)}>{getInitials(name)}</span>;
  return (
    <span
      className={clsx("inline-block shrink-0", className)}
      style={{ width: size, height: size, color, opacity }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function avatarColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) | 0;
  const colors: string[] = [
    "bg-surface-hi text-lime", "bg-surface-hi text-blue", "bg-surface-hi text-[#fb923c]",
    "bg-surface-hi text-[#6ee7b7]", "bg-surface-hi text-[#f87171]", "bg-surface-hi text-[#c084fc]",
    "bg-surface-hi text-[#a3a3a3]",
  ];
  return colors[Math.abs(hash) % colors.length];
}

function dotColor(status?: PresenceStatus): string {
  if (status === "online") return "bg-blue-strong";
  return "bg-muted";
}

function completionItems(u: User | null): { label: string; done: boolean; link?: string }[] {
  if (!u) return [];
  return [
    { label: "Avatar", done: !!u.avatarUrl },
    { label: "Banner", done: !!u.bannerUrl },
    { label: "Bio", done: !!u.bio },
    { label: "Status", done: !!u.status },
    { label: "Interests", done: (u.skills || []).length > 0 },
    { label: "Department & level", done: !!(u.department && u.level) },
    { label: "A link", done: (u.links || []).length > 0 },
    { label: "3 communities", done: (u.joinedCommunitySlugs || []).length >= 3 },
    { label: "Birthday celebration", done: u.showBirthday === true },
  ];
}

export function ProfileView({ username }: { username: string }) {
  const clean = username.replace(/^#/, "");
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState(searchParams.get("tab") || "about");

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api.me(), staleTime: 30_000 });
  const isOwn = me ? clean.toLowerCase() === me.username.toLowerCase() : clean === "amaka-eze";

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", clean],
    queryFn: () => api.getProfile(clean),
    staleTime: 30_000,
    enabled: !!clean,
  });
  const { data: projects } = useQuery({
    queryKey: ["profile-projects", clean],
    queryFn: () => api.getProfileProjects(clean),
    staleTime: 30_000,
    enabled: !!clean && tab === "projects",
  });
  const { data: activity } = useQuery({
    queryKey: ["profile-activity", clean],
    queryFn: () => api.getProfileActivity(clean),
    staleTime: 30_000,
    enabled: !!clean && tab === "activity",
  });

  const msg = useMutation({
    mutationFn: () => api.getOrCreateConversation(clean),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ["conversations"] }); router.push(`/dm/${c.id}`); },
  });
  const block = useMutation({
    mutationFn: () => api.blockUser(clean),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["blocked"] }); },
  });
  const report = useMutation({ mutationFn: () => api.reportUser(clean, "inappropriate", ""), onSuccess: () => { /* noop */ } });

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && PROFILE_TABS.some(tabItem => tabItem.key === t)) setTab(t);
  }, [searchParams]);

  if (isLoading) return <ProfileSkeleton />;
  if (error || !data) return <ProfileNotFound />;

  const relations = data.relations || { blocked: false, blockedBy: false, inCommonCount: 0 };
  const canMessage = !relations.blocked && !relations.blockedBy;
  const joinedStr = monthYear(data.joinedAt);
  const interests = (data.skills || []).slice(0, 8);
  const moreInterests = Math.max(0, (data.skills || []).length - 8);
  const usernameColor = isOwn ? "text-name-self" : "text-name-other";
  const comp = completionItems(data);
  const compDone = comp.filter(i => i.done).length;
  const compPct = Math.round((compDone / comp.length) * 100);

  if (relations.blockedBy) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 gap-4">
        <div className="rounded-xl border bg-surface p-8 text-center max-w-md w-full">
          <p className="text-sm text-text">This profile is unavailable</p>
          <p className="text-xs text-muted mt-1">This user has blocked you.</p>
        </div>
        <Link href="/home" className="inline-flex items-center rounded-lg border bg-surface px-4 py-2 text-sm text-lime hover:bg-surface-hi">Back to Home</Link>
      </div>
    );
  }

  const onSetTab = (k: string) => {
    router.push(`/u/${clean}?tab=${k}`, { scroll: false });
    setTab(k);
  };

  return (
    <div data-testid="profile-page" className="min-h-[100dvh] flex flex-col">
      {/* Mobile header bar (56px): back arrow, #username, menu */}
      <header className="flex h-14 items-center gap-2 px-4 border-b border-border/60 bg-bg-2 backdrop-blur z-20 shrink-0 md:hidden">
        <button type="button" onClick={() => router.back()} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
        </button>
        <h1 className="font-heading text-base font-semibold truncate min-w-0">{formatUsername(data.username)}</h1>
        <button type="button" className="ml-auto flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text">
          <span className="relative"><span className="absolute inset-0 flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-current" /><span className="w-1.5 h-1.5 rounded-full bg-current" /><span className="w-1.5 h-1.5 rounded-full bg-current" /></span></span>
        </button>
      </header>

      {/* Scroll region: inner scroll on mobile, page scroll on desktop */}
      <div className="flex-1 min-h-0 overflow-y-auto md:overflow-visible">
        <div className="max-w-[1120px] mx-auto px-4 md:px-6 pb-[96px] md:pb-24">
          <section data-testid="profile-header-card" className="relative">
            <HeaderCard
              data={data} relations={relations} canMessage={canMessage} joinedStr={joinedStr}
              interests={interests} moreInterests={moreInterests} msg={msg} block={block} report={report}
              isOwn={isOwn} me={me} comp={comp} compPct={compPct} onSetTab={onSetTab}
            />
          </section>
          <div data-testid="profile-tabs" className="relative">
            <Tabs tabs={PROFILE_TABS} active={tab} onSet={onSetTab} data={data} relations={relations} isOwn={isOwn} />
          </div>
          <div className="flex gap-20 md:gap-20 min-w-0">
            <div className="flex-1 min-w-0 flex flex-col gap-16">
              {tab === "about" && <AboutBody data={data} isOwn={isOwn} relations={relations} interests={interests} moreInterests={moreInterests} />}
              {tab === "communities" && <CommunitiesBody data={data} isOwn={isOwn} me={me} />}
              {tab === "badges" && <BadgesBody data={data} isOwn={isOwn} />}
              {tab === "projects" && <ProjectsBody data={data} projects={projects || []} isOwn={isOwn} />}
              {tab === "activity" && <ActivityBody data={data} activity={activity || []} isOwn={isOwn} />}
            </div>
            <aside className="hidden lg:flex lg:flex-shrink-0 lg:w-[340px] flex flex-col gap-16 min-w-[340px]">
              {tab === "about" && isOwn ? (
                <>
                  <CompleteYourProfile data={data} comp={comp} compPct={compPct} />
                  <WalletComingLater />
                </>
              ) : tab === "about" && !isOwn ? (
                <>
                  <CommunitiesInCommon data={data} relations={relations} me={me} />
                  <SharedInterests data={data} interests={interests} moreInterests={moreInterests} onSetTab={onSetTab} />
                  <SayHi data={data} canMessage={canMessage} msg={msg} />
                </>
              ) : null}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function dataUsernameEquals(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/* ── Desktop header card ── */
function HeaderCard({ data, relations, canMessage, joinedStr, interests, moreInterests, msg, block, report, isOwn, me, comp, compPct, onSetTab }: {
  data: Profile; relations: any; canMessage: boolean; joinedStr: string;
  interests: string[]; moreInterests: number; msg: any; block: any; report: any;
  isOwn: boolean; me: User | undefined; comp: any[]; compPct: number; onSetTab: (k: string) => void;
}) {
  const router = useRouter();
  const [shareOpen, setShareOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  const usernameColor = isOwn ? "text-name-self" : "text-name-other";
  const url = typeof window !== "undefined" ? window.location.origin + `/u/${data.username}` : "";

  return (
    <section className="rounded-xl border bg-surface border border-border flex flex-col">
      <div className="relative h-[120px] md:h-[200px] bg-surface-hi">
        <div className="h-full w-full overflow-hidden">
          {isImageUrl(data.bannerUrl) ? (
            <Image src={data.bannerUrl} alt="" fill className="object-cover" sizes="(max-width: 768px) 100vw, 1040px" priority />
          ) : (
            <div className="h-full w-full bg-surface-hi relative overflow-hidden" style={{ background: bannerGradient(data.username) }}>
              <div className="absolute inset-0 opacity-40 banner-fallback" />
            </div>
          )}
        </div>
        {isOwn && (
          <button
            type="button"
            aria-label="Change banner"
            className="absolute top-2 md:top-3 right-2 md:right-3 z-20 flex h-8 md:h-9 w-8 md:w-9 items-center justify-center rounded-full bg-lime text-bg cursor-pointer hover:bg-lime-hover transition-colors opacity-0 group-hover:opacity-100"
            onClick={() => router.push(`/settings/profile`)}
          >
            <Icon name="pencil" size={14} color="#0B0D0B" />
          </button>
        )}
        <div className="absolute -bottom-[44px] md:-bottom-[60px] left-1/2 -translate-x-1/2 z-10">
          <div className="relative h-[88px] w-[88px] md:h-[120px] md:w-[120px] rounded-full border-[6px] border-[var(--surface)] bg-surface-hi flex items-center justify-center shrink-0">
            {isImageUrl(data.avatarUrl) ? (
              <Image src={data.avatarUrl} alt={`Avatar of ${formatUsername(data.username)}`} width={88} height={88} className="rounded-full object-cover" sizes="88px" />
            ) : (
              <div className="h-full w-full rounded-full flex items-center justify-center font-heading text-2xl md:text-3xl font-bold">{getInitials(data.username)}</div>
            )}
            <PresenceDot
              status={isOwn && (data.presence === "hidden" || data.presence === "offline") ? "offline" : data.presence}
              className="absolute -bottom-[1px] -right-[1px] z-20 h-3.5 md:h-6 w-3.5 md:w-6 rounded-full border-[2px] border-[var(--surface)]"
              label={false}
            />
          </div>
        </div>
      </div>
      <div className="p-4 md:p-6 lg:p-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:gap-6 gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 mb-1">
              <h1 className={clsx("font-heading text-lg md:text-[28px] font-semibold leading-tight truncate", usernameColor)}>{formatUsername(data.username)}</h1>
              {data.birthdayToday && <span className="text-[20px] md:text-[24px]" aria-label="Birthday today">🎂</span>}
            </div>
            <div className="flex flex-wrap gap-2 mt-1">
              {(data.badgePins || data.badgeIds || []).slice(0, 5).map((bid: string) => {
                const b = (data.badges || []).find((x: Badge) => x.id === bid);
                return (
                  <button
                    key={bid}
                    type="button"
                    aria-label={b?.name || "Badge"}
                    className="relative shrink-0 h-7 w-7 rounded-full border border-border/60 bg-surface flex items-center justify-center"
                    title={b?.name}
                  >
                    <Icon name={b?.icon || "star"} size={14} />
                  </button>
                );
              })}
              {((data.badgePins || data.badgeIds || []).length - 5 > 0) && (
                <span className="shrink-0 h-7 w-7 rounded-full border border-border/60 bg-surface-hi flex items-center justify-center text-[11px] font-semibold text-muted">+{(data.badgePins || data.badgeIds || []).length - 5}</span>
              )}
            </div>
          </div>
        </div>
        {data.status && (
          <p className="mt-2 text-sm text-text">{data.status}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2 text-[13px] text-muted">
        {data.schoolName && <span className="flex items-center gap-2"><Icon name="building" size={13} /> {data.schoolName}</span>}
        {data.department && <span className="flex items-center gap-2"><Icon name="building" size={13} opacity={0.6} /> {data.department}</span>}
        <span className="flex items-center gap-2"><Icon name="calendar" size={13} opacity={0.6} /> Joined {joinedStr}</span>
        {data.location && <span className="flex items-center gap-2"><Icon name="globe" size={13} opacity={0.6} /> {data.location}</span>}
        </div>
        {data.bio && (
          <div className="mt-4">
            <p className={clsx("text-sm text-text/95 leading-relaxed", bioExpanded ? "line-clamp-none" : "line-clamp-3")}>{data.bio}</p>
            {data.bio.length > 100 && (
              <button type="button" onClick={() => setBioExpanded(!bioExpanded)} className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-lime hover:underline">
                {bioExpanded ? "less" : "more"}
              </button>
            )}
          </div>
        )}
        {!data.bio && isOwn && (
          <p className="mt-4 text-sm text-muted">No bio yet. <Link href="/settings/profile" className="text-lime hover:underline font-medium">Add a bio</Link></p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          {interests.map((s: string) => (
            <button key={s} type="button" onClick={() => onSetTab("about")} className="text-[11px] rounded-full border border-border bg-surface px-2.5 py-1 text-muted hover:border-blue-strong/60 hover:text-blue-strong">
              {s}
            </button>
          ))}
          {moreInterests > 0 && (
            <button type="button" onClick={() => onSetTab("about")} className="text-[11px] rounded-full border border-border bg-surface px-2.5 py-1 text-muted hover:border-blue-strong/60 hover:text-blue-strong">
              +{moreInterests}
            </button>
          )}
        </div>
        {(data.links || []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(data.links || []).map((l) => (
              <a
                key={l.label}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] text-muted hover:bg-surface-hi hover:text-text group"
                title={l.label}
              >
                <Icon name={l.label.toLowerCase().includes("git") ? "github" : l.label.toLowerCase().includes("link") || l.label.toLowerCase().includes("x") ? "x" : l.label.toLowerCase().includes("in") ? "linkedin" : "globe"} size={13} opacity={0.7} />
                <span className="truncate max-w-[120px]">{l.label}</span>
                <Icon name="external-link" size={12} opacity={0.5} className="group-hover:opacity-100" />
              </a>
            ))}
          </div>
        )}
        <div className="mt-6 border-t border-border/60 pt-5 grid grid-cols-2 md:grid-cols-4 gap-0">
          <StatCell label="Communities" value={data.stats?.communities ?? data.communitiesJoined} />
          <div className="hidden md:block w-[1px] h-4 bg-border self-center" />
          <StatCell label="Badges" value={data.stats?.badges ?? (data.badges || []).length} />
          <div className="hidden md:block w-[1px] h-4 bg-border self-center" />
          <StatCell label="Projects" value={data.stats?.projects ?? 0} />
          <div className="hidden md:block w-[1px] h-4 bg-border self-center" />
          <StatCell2 label={isOwn ? "Joined" : "In common"} value={isOwn ? joinedStr : `${relations.inCommonCount} mutual`} showMutual={!isOwn && relations.inCommonCount > 0} data={data} />
        </div>
        <div className="mt-5 flex flex-col md:flex-row gap-2 md:gap-3 items-start md:items-center">
          {isOwn ? (
            <>
              <Link href="/settings/profile" className="flex-1 flex h-10 items-center justify-center rounded-lg border border-lime bg-lime text-bg text-sm font-semibold hover:bg-lime-hover">
                <Icon name="pencil" size={15} color="#0B0D0B" className="mr-1.5" /> Edit profile
              </Link>
              <button type="button" aria-label="Share profile" onClick={() => setShareOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text">
                <Icon name="share" size={17} />
              </button>
            </>
          ) : canMessage ? (
            <>
              <button type="button" onClick={() => msg.mutate()} disabled={msg.isPending} className="flex-1 flex h-10 items-center justify-center rounded-lg border border-lime bg-lime text-bg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-lime-hover">
                Message
              </button>
              <button type="button" aria-label="More" onClick={() => setMoreOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text">
                <span className="relative"><span className="absolute inset-0 flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-current" /><span className="w-1.5 h-1.5 rounded-full bg-current" /><span className="w-1.5 h-1.5 rounded-full bg-current" /></span></span>
              </button>
            </>
          ) : (
            <button type="button" disabled className="flex-1 flex h-10 items-center justify-center rounded-lg border border-border/50 bg-surface text-muted/50 text-sm font-semibold cursor-not-allowed" title="You can't message this user">Message</button>
          )}
        </div>
      </div>
      {shareOpen && <SharePopover url={url} onClose={() => setShareOpen(false)} />}
      {moreOpen && <MoreMenu canMessage={canMessage} onBlock={() => { block.mutate(); setMoreOpen(false); }} onReport={() => { report.mutate(); setMoreOpen(false); }} onCopyLink={() => { navigator.clipboard.writeText(url); setMoreOpen(false); }} onCopyUsername={() => { navigator.clipboard.writeText(formatUsername(data.username)); setMoreOpen(false); }} />}
    </section>
  );
}

function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="font-heading text-xs font-semibold text-text">{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  );
}
function StatCell2({ label, value, showMutual, data }: { label: string; value: string; showMutual: boolean; data: Profile }) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0">
      <div className="font-heading text-xs font-semibold text-text truncate min-w-0">{value}</div>
      <div className="text-[10px] text-muted truncate min-w-0">{label}</div>
      {showMutual && (
        <div className="mt-1 flex gap-[-6px]">
          {(data.mutualAvatars || []).slice(0, 3).map((a) => (
            <div key={a.id} className="h-5 w-5 shrink-0 rounded-full border border-[var(--surface)]" style={{ background: avatarColor(a.username) }}>
              {a.avatarUrl ? <Image src={a.avatarUrl} alt="" fill className="rounded-full object-cover" /> : <span className="text-[9px] font-bold flex items-center justify-center">{getInitials(a.username)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Tabs ── */
function Tabs({ tabs, active, onSet, data, relations, isOwn }: { tabs: typeof PROFILE_TABS; active: string; onSet: (k: string) => void; data: Profile; relations: any; isOwn: boolean }) {
  const counts = {
    communities: data.stats?.communities ?? data.communitiesJoined,
    badges: data.stats?.badges ?? (data.badges || []).length,
    projects: data.stats?.projects ?? 0,
  };
  return (
    <div className="overflow-x-auto scrollbar-hide pb-2 md:pb-0 md:sticky md:top-0 md:z-20 md:border-b md:border-border/60 md:bg-bg/80 md:backdrop-blur-sm md:-mt-[1px]">
      <nav className="flex items-center gap-0 px-2 md:px-4 lg:px-0 py-2 md:py-3 lg:py-4" aria-label="Profile tabs">
        {tabs.map((t) => {
          const count = counts[t.key as keyof typeof counts];
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active === t.key}
              onClick={() => onSet(t.key)}
              className={clsx("shrink-0 items-center gap-1 px-3 md:px-4 py-2 md:py-2.5 transition-colors rounded-lg", active === t.key ? "bg-blue-soft text-blue border-b-0 md:border-b-2 border-lime pb-[3px] md:pb-[3px]" : "text-muted hover:bg-surface hover:text-text")}
            >
              <Icon name={t.icon} size={14} />
              <span className="md:block hidden">{t.label}</span>
              {(t.key === "communities" || t.key === "badges" || t.key === "projects") && count != null && (
                <span className="ml-1 md:ml-1.5 text-[10px] md:text-[11px] text-muted">{count}</span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/* ── About body ── */
function AboutBody({ data, isOwn, relations, interests, moreInterests }: { data: Profile; isOwn: boolean; relations: any; interests: string[]; moreInterests: number }) {
  return (
    <section className="flex flex-col gap-16 min-w-0">
      <AboutMeCard data={data} isOwn={isOwn} />
      <DetailsCard data={data} />
      <SkillsCard data={data} />
      <CurrentlyBuilding data={data} isOwn={isOwn} />
      <LinksCard data={data} />
    </section>
  );
}

function AboutMeCard({ data, isOwn }: { data: Profile; isOwn: boolean }) {
  return (
    <section className="rounded-xl border bg-surface p-6">
      <h2 className="font-heading font-semibold mb-3">About me</h2>
      {data.bio ? (
        <p className="text-sm text-text leading-relaxed">{data.bio}</p>
      ) : isOwn ? (
        <p className="text-sm text-muted">No bio yet. <Link href="/settings/profile" className="text-lime hover:underline font-medium">Add one in Edit profile</Link>.</p>
      ) : null}
      {data.status && (
        <div className="mt-4 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-lime" />
          <span className="text-sm text-text">{data.status}</span>
        </div>
      )}
    </section>
  );
}

function DetailsCard({ data }: { data: Profile }) {
  const rows: { label: string; value: string }[] = [];
  if (data.schoolName) rows.push({ label: "School", value: data.schoolName });
  if (data.department) rows.push({ label: "Department", value: data.department });
  if (data.level) rows.push({ label: "Level", value: `${data.level} level` });
  rows.push({ label: "Joined", value: fullDate(data.joinedAt) });
  if (data.location) rows.push({ label: "Location", value: data.location });
  if ((data.languages || []).length > 0) rows.push({ label: "Languages", value: (data.languages as string[]).join(", ") });
  if (data.birthdayToday) rows.push({ label: "Birthday", value: "Celebrating today 🎂" });
  return (
    <section className="rounded-xl border bg-surface p-6">
      <h2 className="font-heading font-semibold mb-3">Details</h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {rows.map((r) => (
          <div key={r.label} className="min-w-0">
            <p className="text-[13px] text-muted">{r.label}</p>
            <p className="text-sm text-text truncate">{r.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SkillsCard({ data }: { data: Profile }) {
  const skills = (data.skills || []).slice(0, 12);
  return (
    <section className="rounded-xl border bg-surface p-6">
      <h2 className="font-heading font-semibold mb-3">Skills</h2>
      {skills.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <span key={s} className="text-[11px] rounded-full border border-border bg-surface px-2.5 py-1 text-muted">{s}</span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No skills added.</p>
      )}
    </section>
  );
}

function CurrentlyBuilding({ data, isOwn }: { data: Profile; isOwn: boolean }) {
  const featured = data.featuredProjectId ? (data.projects || []).find((p) => p.id === data.featuredProjectId) : (data.projects || [])[0];
  if (!featured) return null;
  return (
    <section className="rounded-xl border bg-surface p-6">
      <h2 className="font-heading font-semibold mb-3">Currently building</h2>
      <div className="flex items-start gap-4">
        <div className="h-14 w-14 shrink-0 rounded-lg bg-surface-hi flex items-center justify-center font-heading text-[12px] font-bold">{featured.title.slice(0, 2).toUpperCase()}</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-text">{featured.title}</h3>
          <p className="text-[12px] text-muted mt-0.5 line-clamp-2">{featured.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-[11px] rounded-full border border-lime/60 text-lime px-2 py-0.5">{featured.status}</span>
            <Link href={`/project/${featured.id}`} className="text-[11px] rounded-full border border-blue-border text-blue px-2 py-0.5 hover:bg-blue-soft">View</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function LinksCard({ data }: { data: Profile }) {
  return (
    <section className="rounded-xl border bg-surface p-6">
      <h2 className="font-heading font-semibold mb-3">Links</h2>
      {(data.links || []).length > 0 ? (
        <div className="space-y-2">
          {(data.links || []).map((l) => (
            <div key={l.label} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/60 bg-bg-2/50">
              <div className="flex items-center gap-2 flex-1">
                <Icon name={l.label.toLowerCase().includes("git") ? "github" : l.label.toLowerCase().includes("in") ? "linkedin" : l.label.toLowerCase().includes("x") ? "x" : "globe"} size={15} opacity={0.7} />
                <span className="text-sm truncate flex-1">{l.label}</span>
              </div>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-lime hover:underline">{domainOf(l.url)}</a>
              <Icon name="external-link" size={13} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No links added.</p>
      )}
    </section>
  );
}

/* ── Communities body ── */
function CommunitiesBody({ data, isOwn, me }: { data: Profile; isOwn: boolean; me: User | undefined }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "owner" | "moderator" | "member">("all");
  const myRole = (c: Community | null) => {
    if (!c) return null;
    if (c.role != null) return c.role;
    return null;
  };
  const list = (data.joinedCommunities || []).filter((c) => c.isPublic !== false);
  const filtered = list.filter((c) => {
    if (q && !c.name.toLowerCase().includes(q.toLowerCase()) && !(c.blurb || "").toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "all") return true;
    const role = myRole(c);
    return role === filter;
  });
  return (
    <section className="rounded-xl border bg-surface p-6 min-w-0">
      <h2 className="font-heading font-semibold mb-3">Communities</h2>
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="search"
          placeholder="Search communities"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1 min-w-[150px] rounded-lg border bg-surface px-3 py-2 text-sm outline-none focus:border-blue-strong"
        />
        {["all", "owner", "moderator", "member"].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f as any)}
            className={clsx("shrink-0 rounded-full border px-3 py-1 text-[11px] transition-colors", filter === f ? "border-lime bg-lime-tint text-lime" : "border-border bg-surface text-muted hover:border-blue-strong/40")}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-surface p-12 text-center">
          <p className="text-sm text-muted">{isOwn ? "You haven't joined any public communities yet." : `${formatUsername(data.username)} hasn't joined any public communities yet.`}</p>
          {isOwn && <Link href="/explore" className="mt-3 inline-flex items-center rounded-lg border bg-surface px-3 py-1.5 text-sm text-lime hover:bg-surface-hi">Explore communities</Link>}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {filtered.map((c) => (
            <CommunityCard key={c.id} c={c} isOwn={isOwn} me={me} />
          ))}
        </div>
      )}
    </section>
  );
}

function CommunityCard({ c, isOwn, me }: { c: Community; isOwn: boolean; me: User | undefined }) {
  const joined = c.joined !== false;
  const roleChip = c.role ? <span className="text-[10px] rounded-full border px-2 py-0.5 text-muted border-border">{c.role}</span> : null;
  return (
    <article className="rounded-lg border bg-surface p-3">
      <div className="relative">
        <div className="h-12 w-12 shrink-0 rounded-lg bg-surface-hi flex items-center justify-center font-heading text-[11px] font-bold">{c.avatar || getInitials(c.name)}</div>
        {c.role === "owner" && <span className="absolute -right-1 -bottom-1 h-5 w-5 rounded-full bg-lime flex items-center justify-center text-[9px] text-bg font-bold">O</span>}
      </div>
      <h3 className="truncate text-sm font-semibold mt-2 mb-1">{c.name}</h3>
      <p className="text-[11px] text-muted">{plural(c.memberCount || 0, "member", "members")} · {c.onlineCount != null ? plural(c.onlineCount, "online") : ""}</p>
      {roleChip}
      <Link
        href={`/c/${c.slug}/general`}
        className="mt-3 inline-flex items-center rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors"
        style={{ background: joined ? "#B6FF3B" : "transparent", color: joined ? "#0B0D0B" : "var(--text)", borderColor: joined ? "#B6FF3B" : "var(--border)" }}
      >
        {joined ? "Open" : "Join"}
      </Link>
    </article>
  );
}

/* ── Badges body ── */
function BadgesBody({ data, isOwn }: { data: Profile; isOwn: boolean }) {
  const earned = (data.badges || []).filter((b) => (data.badgeIds || []).includes(b.id));
  const locked = (data.badges || []).filter((b) => !(data.badgeIds || []).includes(b.id));
  return (
    <section className="flex flex-col gap-12 min-w-0">
      <div className="flex items-center gap-2">
        <h2 className="font-heading font-semibold">Badges</h2>
        <span className="text-xs text-muted">{(data.badges || []).length} total</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-3 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
        {earned.map((b) => (
          <BadgeTile key={b.id} b={b} locked={false} data={data} />
        ))}
        {isOwn && locked.length > 0 && (
          <>
            <h3 className="font-heading font-semibold text-xs uppercase tracking-wide text-muted mt-4">Locked</h3>
            {locked.map((b) => (
              <BadgeTile key={b.id} b={b} locked={true} data={data} />
            ))}
          </>
        )}
      </div>
      {((earned.length === 0) && (!isOwn || locked.length === 0)) && (
        <p className="text-sm text-muted">No badges yet.</p>
      )}
    </section>
  );
}

function BadgeTile({ b, locked, data }: { b: Badge; locked: boolean; data: Profile }) {
  const earnedAt = b.earnedAt ? `Earned ${fullDate(b.earnedAt)}` : "";
  return (
    <div className={clsx("rounded-xl border p-3 min-w-0", locked ? "border-border/40 bg-surface/50 text-muted/60" : "border-border bg-surface")}>
      <div className="h-12 w-12 shrink-0 rounded-full mb-2 flex items-center justify-center" style={{ background: locked ? "#202720" : (b.rarity === "legendary" ? "rgba(125,211,252,0.12)" : "rgba(182,255,59,0.12)" ) }}>
        <Icon name={b.icon || "star"} size={18} color={locked ? "#667" : (b.rarity === "legendary" ? "#7DD3FC" : "#B6FF3B")} />
      </div>
      <h3 className="truncate text-sm font-semibold">{b.name}</h3>
      <p className="text-[11px] text-muted line-clamp-2 mt-1">{locked ? "How to earn: complete related tasks." : "Awarded for community contribution."}</p>
      {earnedAt && <p className="text-[11px] text-muted mt-1">{earnedAt}</p>}
      {b.rarity && !locked && <span className="mt-2 inline-block text-[10px] rounded-full border px-2 py-0.5 text-muted border-border">{b.rarity}</span>}
    </div>
  );
}

/* ── Projects body ── */
function ProjectsBody({ data, projects, isOwn }: { data: Profile; projects: Project[]; isOwn: boolean }) {
  return (
    <section className="rounded-xl border bg-surface p-6 min-w-0">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading font-semibold">Projects</h2>
        {isOwn && (
          <button type="button" className="inline-flex items-center rounded-lg border bg-surface px-3 py-1.5 text-sm text-lime hover:bg-surface-hi border-lime">New project</button>
        )}
      </div>
      {projects.length === 0 ? (
        <p className="text-sm text-muted">No projects yet.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {projects.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectCard({ p }: { p: Project }) {
  return (
    <article className="rounded-xl border bg-surface p-4">
      <div className="h-24 rounded-lg bg-surface-hi mb-3" style={{ background: bannerGradient(p.title) }} />
      <h3 className="text-sm font-semibold text-text">{p.title}</h3>
      <p className="text-[12px] text-muted mt-1 line-clamp-2">{p.description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="text-[11px] rounded-full border border-lime/60 text-lime px-2 py-0.5">{p.status}</span>
        {(p.needs || []).map((n) => (
          <span key={n} className="text-[11px] rounded-full border border-blue-border text-blue px-2 py-0.5">Needs: {n}</span>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2">
        {p.team.slice(0, 3).map((t) => (
          <div key={t.id} className="h-6 w-6 shrink-0 rounded-full border border-[var(--surface)]" style={{ background: avatarColor(t.username) }}>
            {t.avatarUrl ? <Image src={t.avatarUrl} alt="" fill className="rounded-full object-cover" /> : <span className="text-[8px] font-bold flex items-center justify-center">{getInitials(t.username)}</span>}
          </div>
        ))}
        {p.team.length > 3 && <span className="text-[11px] text-muted">+{p.team.length - 3}</span>}
      </div>
    </article>
  );
}

/* ── Activity body ── */
function ActivityBody({ data, activity, isOwn }: { data: Profile; activity: Activity[]; isOwn: boolean }) {
  return (
    <section className="rounded-xl border bg-surface p-6 min-w-0">
      <h2 className="font-heading font-semibold mb-4">Activity</h2>
      {activity.length === 0 ? (
        <p className="text-sm text-muted">Nothing here yet.</p>
      ) : (
        <div className="space-y-5">
          {activity.map((a) => (
            <div key={a.id} className="relative pl-6">
              <div className="absolute left-0 top-1 h-2 w-2 rounded-full bg-lime" />
              <div className="flex items-start gap-3">
                <div className="shrink-0 h-8 w-8 rounded-full bg-surface-hi flex items-center justify-center text-[10px] font-bold">{a.actorUsername.slice(0, 2).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text">{a.text}</p>
                  <p className="text-[11px] text-muted mt-0.5">{relativeTime(a.createdAt)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Side: communities in common ── */
function CommunitiesInCommon({ data, relations, me }: { data: Profile; relations: any; me: User | undefined }) {
  const mySlugs = new Set((me?.joinedCommunitySlugs || []));
  const shared = (data.joinedCommunities || []).filter((c: Community) => mySlugs.has(c.slug)).slice(0, 4);
  return (
    <section className="rounded-xl border bg-surface p-6">
      <h2 className="font-heading font-semibold mb-4">Communities in common</h2>
      {shared.length === 0 ? (
        <p className="text-sm text-muted">No public communities in common.</p>
      ) : (
        <div className="space-y-3">
          {shared.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-hi cursor-pointer">
              <div className="h-8 w-8 shrink-0 rounded-lg bg-surface-hi flex items-center justify-center font-heading text-[10px] font-bold">{c.avatar || getInitials(c.name)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{c.name}</div>
                <div className="text-[11px] text-muted">{plural(c.memberCount || 0, "member", "members")}</div>
              </div>
            </div>
          ))}
          {relations.inCommonCount > 4 && <div className="pt-2 text-[11px] text-lime hover:underline">See all</div>}
        </div>
      )}
    </section>
  );
}

/* ── Side: shared interests ── */
function SharedInterests({ data, interests, moreInterests, onSetTab }: { data: Profile; interests: string[]; moreInterests: number; onSetTab: (k: string) => void }) {
  const skills = (data.skills || []).slice(0, 8);
  return (
    <section className="rounded-xl border bg-surface p-6">
      <h2 className="font-heading font-semibold mb-4">Shared interests</h2>
      {skills.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <span key={s} className="text-[11px] rounded-full border border-border bg-surface px-2 py-1 text-muted">{s}</span>
          ))}
          {moreInterests > 0 && <span className="text-[11px] rounded-full border border-border bg-surface px-2 py-1 text-muted">+{moreInterests}</span>}
        </div>
      ) : (
        <p className="text-sm text-muted">No interests listed.</p>
      )}
    </section>
  );
}

/* ── Side: say hi ── */
function SayHi({ data, canMessage, msg }: { data: Profile; canMessage: boolean; msg: any }) {
  const starters = ["Hey! Saw your profile and wanted to connect.", "Hi, are you open to collabs?", "Cool projects — would love to hear more."];
  return (
    <section className="rounded-xl border bg-surface p-6">
      <h2 className="font-heading font-semibold mb-4">Say hi</h2>
      <p className="text-[12px] text-muted mb-4">Start a conversation.</p>
      <div className="space-y-2">
        {starters.map((s, i) => (
          <button
            key={i}
            type="button"
            disabled={!canMessage}
            onClick={() => { if (canMessage) msg.mutate(); }}
            className={clsx("w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors", canMessage ? "border-border bg-surface hover:bg-surface-hi" : "border-border/50 bg-surface text-muted/50 cursor-not-allowed")}
          >
            <Icon name="chat" size={16} />
            <span className="truncate flex-1">{s}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ── Own: complete your profile ── */
function CompleteYourProfile({ data, comp, compPct }: { data: Profile; comp: any[]; compPct: number }) {
  return (
    <section className="rounded-xl border bg-surface p-6">
      <h2 className="font-heading font-semibold mb-3">Complete your profile</h2>
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold">{compPct}% complete</span>
          <span className="text-[11px] text-muted">{comp.filter((i) => i.done).length}/{comp.length}</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-surface-hi overflow-hidden">
          <div className="h-full bg-lime" style={{ width: `${compPct}%` }} />
        </div>
        <ul className="space-y-2">
          {comp.map((item) => (
            <li key={item.label} className={clsx("flex items-center justify-between p-2 rounded-lg hover:bg-surface-hi cursor-pointer", item.done ? "opacity-70" : "")}>
              <div className="flex items-center gap-2 min-w-0">
                <span className={clsx("text-sm", item.done ? "line-through text-muted" : "text-text")}>{item.label}</span>
                {item.done && <span className="text-lime">✓</span>}
              </div>
              {!item.done && <Link href="/settings/profile" className="text-[11px] text-lime hover:underline">Edit</Link>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ── Own: wallet ── */
function WalletComingLater() {
  return (
    <section className="rounded-xl border bg-surface p-6">
      <h2 className="font-heading font-semibold mb-2">Wallet</h2>
      <p className="text-sm text-muted">Coming later</p>
      <button type="button" disabled className="mt-3 inline-flex items-center rounded-lg border border-lime/50 bg-transparent px-4 py-2 text-sm text-lime/50 font-semibold cursor-not-allowed">Coming later</button>
    </section>
  );
}

/* ── Share popover ── */
function SharePopover({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute right-4 top-4 w-64 rounded-xl border bg-surface p-4 shadow-xl">
        <p className="text-xs font-semibold mb-2">Copy profile link</p>
        <div className="flex gap-2">
          <input value={url} readOnly className="flex-1 rounded-lg border bg-surface px-3 py-2 text-[11px] outline-none" />
          <button type="button" onClick={() => { navigator.clipboard.writeText(url); onClose(); }} className="rounded-lg border bg-lime text-bg px-3 py-2 text-sm font-semibold hover:bg-lime-hover">Copy</button>
        </div>
      </div>
    </div>
  );
}

/* ── More menu ── */
function MoreMenu({ canMessage, onBlock, onReport, onCopyLink, onCopyUsername }: { canMessage: boolean; onBlock: () => void; onReport: () => void; onCopyLink: () => void; onCopyUsername: () => void }) {
  return (
    <div className="fixed inset-0 z-50" onClick={() => { }}>
      <div className="absolute right-4 top-20 w-56 rounded-xl border bg-surface p-2 shadow-xl">
        {canMessage ? (
          <button type="button" onClick={onBlock} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-red-400/10">Block user</button>
        ) : null}
        <button type="button" onClick={onReport} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-red-400/10">Report</button>
        <button type="button" onClick={onCopyLink} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-surface-hi">Copy profile link</button>
        <button type="button" onClick={onCopyUsername} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-surface-hi">Copy username</button>
      </div>
    </div>
  );
}

/* ── Skeletons ── */
function ProfileSkeleton() {
  return (
    <div className="min-h-[100dvh] p-4 lg:p-6 space-y-6">
      <section className="rounded-xl border bg-surface p-0 flex flex-col">
        <div className="h-[200px] bg-surface-hi" />
        <div className="h-30 w-30 rounded-full bg-surface-hi mx-auto -mt-[60px]" />
        <div className="p-6 space-y-4">
          <div className="h-6 w-1/3 bg-surface-hi" />
          <div className="h-4 w-full bg-surface-hi" />
          <div className="h-16 w-full bg-surface-hi" />
          <div className="h-3 w-1/2 bg-surface-hi" />
          <div className="h-3 w-2/3 bg-surface-hi" />
        </div>
        <div className="grid grid-cols-4 gap-0 h-12">
          {[1,2,3,4].map((_, i) => <div key={i} className="bg-surface-hi" />)}
        </div>
      </section>
      {[1, 2, 3].map(i => (
        <section key={i} className="rounded-xl border bg-surface p-6 space-y-4">
          <div className="h-4 w-20 bg-surface-hi" />
          <div className="h-3 w-full bg-surface-hi" />
          <div className="h-12 w-full rounded bg-surface-hi" />
          <div className="h-12 w-full rounded bg-surface-hi" />
        </section>
      ))}
    </div>
  );
}

/* ── Not found ── */
function ProfileNotFound() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 gap-4">
      <div className="rounded-xl border bg-surface p-8 text-center max-w-md w-full">
        <h2 className="font-heading font-semibold">Profile not found</h2>
        <p className="text-sm text-muted mt-1">Try again later.</p>
      </div>
      <Link href="/home" className="inline-flex items-center rounded-lg border bg-surface px-4 py-2 text-sm text-lime hover:bg-surface-hi">Back to Home</Link>
    </div>
  );
}
