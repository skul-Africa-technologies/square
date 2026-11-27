"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatUsername, getInitials } from "@square/shared";
import { RobotAvatar } from "@/components/ui/redesign";

// ─── Shared card style (one family) ─────────────────────────────────────────
// Surface #101410, 1px border #303A2D, radius 16px. No inner boxes inside boxes.
const CARD: React.CSSProperties = {
  background: "#101410",
  border: "1px solid #303A2D",
  borderRadius: 16,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
};
const HEADER: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "16px",
  borderBottom: "1px solid #303A2D",
};
const TITLE: React.CSSProperties = {
  flex: 1,
  margin: 0,
  fontFamily: "var(--font-space-grotesk)",
  fontSize: 16,
  fontWeight: 600,
  color: "var(--text)",
};
const ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 16px",
  minWidth: 0,
};
const DIVIDER = "1px solid #303A2D";

// ─── Types (match the discover payload) ─────────────────────────────────────
export interface BirthdayPerson {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  isCurrentUser?: boolean;
}
export interface EventItem {
  id: string;
  title: string;
  communityName: string;
  communitySlug: string;
  date: string;
  time?: string;
  place?: string;
}
export interface StudentPerson {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
}

// ─── Inline SVG icons (no emoji) ────────────────────────────────────────────
export function CakeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21H4a1 1 0 0 1-1-1v-9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a1 1 0 0 1-1 1Z" />
      <path d="M7 9V6a2 2 0 0 1 4 0v3M13 9V5a2 2 0 0 1 4 0v4M3 14c1.5 1 3 1 4.5 0S10.5 13 12 14s3 1 4.5 0S19.5 13 21 14" />
    </svg>
  );
}
function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// ─── Persisted "sent/wished" set ────────────────────────────────────────────
function useSentSet(key: string) {
  const [sent, setSent] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(key);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  const mark = (id: string) => {
    setSent(prev => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(key, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };
  return { sent, mark };
}

// ─── Pill button (Wish / Say hi) — 32px, outlined blue, no solid fill ───────
function PillButton({
  children,
  onClick,
  done,
  doneLabel,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  done?: boolean;
  doneLabel?: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={done}
      aria-label={ariaLabel}
      className="home-pill"
      style={{
        height: 32,
        padding: "0 12px",
        borderRadius: 999,
        border: done ? "1px solid var(--border)" : "1px solid var(--blue-border)",
        background: done ? "transparent" : "var(--blue-soft)",
        color: done ? "var(--muted)" : "var(--blue)",
        fontSize: 13,
        fontWeight: 600,
        fontFamily: "var(--font-inter)",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        cursor: done ? "default" : "pointer",
        whiteSpace: "nowrap",
        flexShrink: 0,
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      {done ? <CheckIcon /> : null}
      {done && doneLabel ? doneLabel : children}
    </button>
  );
}

// ─── Card header ────────────────────────────────────────────────────────────
function CardHeader({
  id,
  title,
  count,
  seeAll,
}: {
  id: string;
  title: React.ReactNode;
  count?: React.ReactNode;
  seeAll?: { label: string; href: string };
}) {
  return (
    <div style={HEADER}>
      <h2 id={id} style={TITLE}>
        {title}
      </h2>
      {count != null && <span style={{ fontSize: 13, color: "var(--muted)" }}>{count}</span>}
      {seeAll && (
        <Link href={seeAll.href} prefetch={false} style={{ fontSize: 13, color: "var(--blue)", textDecoration: "none" }}>
          {seeAll.label}
        </Link>
      )}
    </div>
  );
}

// ─── Celebrating today ──────────────────────────────────────────────────────
export function CelebratingCard({ people, currentUserId }: { people: BirthdayPerson[]; currentUserId?: string }) {
  const router = useRouter();
  const { sent, mark } = useSentSet("square:wishedBirthdays");
  const [expanded, setExpanded] = useState(false);

  // Others only; the signed-in user's own birthday is handled by the top banner.
  const others = people.filter(p => p.id !== currentUserId || p.isCurrentUser);
  if (others.length === 0) return null; // empty state: hidden entirely

  const shown = expanded ? others : others.slice(0, 3);
  const hidden = others.length - shown.length;

  const wish = (p: BirthdayPerson) => {
    mark(p.id);
    const name = formatUsername(p.displayName || p.username);
    router.push(`/dm/${p.id}?prefill=${encodeURIComponent(`Happy birthday ${name}! 🎉`)}`);
  };

  return (
    <section aria-labelledby="home-birthdays" style={CARD}>
      <CardHeader
        id="home-birthdays"
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <CakeIcon />
            Celebrating today
          </span>
        }
        count={others.length > 2 ? `+${others.length - 2} more` : undefined}
      />
      <div role="list" style={{ display: "flex", flexDirection: "column" }}>
        {shown.map((p, i) => {
          const self = p.isCurrentUser || p.id === currentUserId;
          const done = sent.has(p.id);
          return (
            <div
              key={p.id}
              role="listitem"
              className="home-row"
              style={{ ...ROW, borderBottom: i < shown.length - 1 || hidden > 0 ? DIVIDER : "none" }}
            >
              <RobotAvatar id={p.id} pictureUrl={p.avatarUrl} size={40} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: "var(--font-space-grotesk)",
                    color: self ? "var(--name-self)" : "var(--name-other)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {formatUsername(p.username)}
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>Birthday today</p>
              </div>
              <PillButton
                onClick={() => wish(p)}
                done={done}
                doneLabel="Wished"
                ariaLabel={done ? `Wished ${formatUsername(p.username)}` : `Wish ${formatUsername(p.username)} happy birthday`}
              >
                Wish
              </PillButton>
            </div>
          );
        })}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            style={{
              ...ROW,
              width: "100%",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--blue)",
              fontSize: 13,
              justifyContent: "flex-start",
            }}
          >
            Show all ({others.length})
          </button>
        )}
      </div>
    </section>
  );
}

// ─── Upcoming events ────────────────────────────────────────────────────────
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function DateTile({ date }: { date: string }) {
  const d = new Date(date);
  const today = sameDay(d, new Date());
  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        flexShrink: 0,
        background: "var(--surface-hi)",
        border: "1px solid #303A2D",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", lineHeight: 1 }}>
        {d.toLocaleDateString(undefined, { month: "short" })}
      </span>
      <span style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-space-grotesk)", color: today ? "var(--blue)" : "var(--text)", lineHeight: 1.1 }}>
        {d.getDate()}
      </span>
    </div>
  );
}

export function EventsCard({ events }: { events: EventItem[] }) {
  const router = useRouter();
  const shown = events.slice(0, 3);
  return (
    <section aria-labelledby="home-events" style={CARD}>
      <CardHeader id="home-events" title="Upcoming events" />
      {shown.length === 0 ? (
        <div style={{ ...ROW, color: "var(--muted)", fontSize: 13 }}>
          No upcoming events yet.{" "}
          <Link href="/explore" prefetch={false} style={{ color: "var(--blue)", textDecoration: "none" }}>
            Explore
          </Link>
        </div>
      ) : (
        <div role="list" style={{ display: "flex", flexDirection: "column" }}>
          {shown.map((e, i) => {
            const venue = e.place?.trim();
            const metaParts = [e.communityName];
            if (venue && venue.toLowerCase() !== e.communityName.toLowerCase()) metaParts.push(venue);
            const meta = metaParts.filter(Boolean).join(" · ");
            return (
              <button
                key={e.id}
                type="button"
                role="listitem"
                onClick={() => router.push(`/c/${e.communitySlug}/events`)}
                className="home-row"
                style={{
                  ...ROW,
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  borderBottom: i < shown.length - 1 ? DIVIDER : "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <DateTile date={e.date} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 15,
                      fontWeight: 600,
                      fontFamily: "var(--font-space-grotesk)",
                      color: "var(--text)",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {e.title}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {meta}
                  </p>
                </div>
                {e.time && (
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      border: "1px solid var(--border)",
                      borderRadius: 999,
                      padding: "2px 8px",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {e.time}
                  </span>
                )}
              </button>
            );
          })}
          {events.length > 3 && (
            <Link
              href="/explore"
              prefetch={false}
              style={{ ...ROW, color: "var(--blue)", fontSize: 13, textDecoration: "none" }}
            >
              See all events
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

// ─── New from your school ───────────────────────────────────────────────────
export function NewSchoolCard({ students }: { students: StudentPerson[] }) {
  const router = useRouter();
  const { sent, mark } = useSentSet("square:saidHi");
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? students.slice(0, 8) : students.slice(0, 8);
  const hasMore = students.length > 8;

  const sayHi = (s: StudentPerson) => {
    mark(s.id);
    const name = formatUsername(s.displayName || s.username);
    router.push(`/dm/${s.id}?prefill=${encodeURIComponent(`Hi ${name}! 👋`)}`);
  };

  return (
    <section aria-labelledby="home-new-school" style={CARD}>
      <div style={{ ...HEADER, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id="home-new-school" style={TITLE}>
            New from your school
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--muted)" }}>People who just joined. Say hi.</p>
        </div>
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            style={{ background: "transparent", border: "none", color: "var(--blue)", fontSize: 13, cursor: "pointer", padding: 0 }}
          >
            {expanded ? "See less" : "See more"}
          </button>
        )}
      </div>
      <div className="new-school-grid" role="list" style={{ padding: 16, gap: 12 }}>
        {shown.map(s => {
          const done = sent.has(s.id);
          return (
            <div
              key={s.id}
              role="listitem"
              style={{
                background: "var(--surface-hi)",
                border: "1px solid #303A2D",
                borderRadius: 12,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 8,
                minWidth: 0,
              }}
            >
              <RobotAvatar id={s.id} pictureUrl={s.avatarUrl} size={40} />
              <div style={{ minWidth: 0, width: "100%" }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: "var(--font-space-grotesk)",
                    color: "var(--name-other)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {formatUsername(s.username)}
                </p>
              </div>
              <PillButton
                onClick={() => sayHi(s)}
                done={done}
                doneLabel="Sent"
                ariaLabel={done ? `Sent to ${formatUsername(s.username)}` : `Say hi to ${formatUsername(s.username)}`}
              >
                Say hi
              </PillButton>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── The family layout (responsive 12-col grid) ─────────────────────────────
export function HomeFamily({
  events,
  birthdays,
  newStudents,
  currentUserId,
}: {
  events: EventItem[];
  birthdays: BirthdayPerson[];
  newStudents: StudentPerson[];
  currentUserId?: string;
}) {
  return (
    <div className="home-family">
      <div className="col-events">
        <EventsCard events={events} />
      </div>
      <div className="col-birthdays">
        <CelebratingCard people={birthdays} currentUserId={currentUserId} />
      </div>
      <div className="col-newschool">
        <NewSchoolCard students={newStudents} />
      </div>
    </div>
  );
}