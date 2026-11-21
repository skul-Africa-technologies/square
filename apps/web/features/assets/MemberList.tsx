"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toDisplayUsername, getInitials } from "@square/shared";
import type { CommunityMember } from "@square/shared";
import { PresenceDot } from "@/components/shell/PresenceDot";
import clsx from "clsx";

function roleChip(role: CommunityMember["role"]) {
  if (role === "owner") return <span className="rounded bg-lime-tint px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-lime">Owner</span>;
  if (role === "moderator") return <span className="rounded bg-surface-hi px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-text">Mod</span>;
  return null;
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <div className="mb-3">
      <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{title} — {count}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export function MemberList({ communityId, onClose }: { communityId: string; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<CommunityMember | null>(null);
  const [showOffline, setShowOffline] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["members", communityId], queryFn: () => api.listCommunityMembers(communityId), staleTime: 30_000 }); // PROPOSED

  async function message(username: string) {
    const c = await api.getOrCreateConversation(username); // PROPOSED
    await qc.invalidateQueries({ queryKey: ["conversations"] });
    router.push(`/dm/${c.id}`);
  }

  const Row = ({ m }: { m: CommunityMember }) => (
    <button type="button" onClick={() => setSelected(m)} className={clsx("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface", selected?.id === m.id && "bg-surface")}>
      <span className="relative shrink-0">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-hi text-[10px] font-semibold">{getInitials(m.username)}</span>
        <PresenceDot status={m.presence} className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 border-bg-2" />
      </span>
      <span className={clsx("min-w-0 flex-1 truncate text-sm", m.id === "u1" ? "text-name-self" : "text-name-other")}>{toDisplayUsername(m.username)}</span>
      {roleChip(m.role)}
    </button>
  );

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-l bg-bg-2">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Members</span>
        <button type="button" onClick={onClose} aria-label="Hide members" className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface hover:text-text">×</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {isLoading && <p className="px-2 py-2 text-sm text-muted">Loading…</p>}
        {data && (
          <>
            <Group title="Owners" count={data.owners.length}>{data.owners.map(m => <Row key={m.id} m={m} />)}</Group>
            <Group title="Moderators" count={data.moderators.length}>{data.moderators.map(m => <Row key={m.id} m={m} />)}</Group>
            <Group title="Online" count={data.online.length}>{data.online.map(m => <Row key={m.id} m={m} />)}</Group>
            {data.offline.length > 0 && (
              <div className="mb-3">
                <button type="button" onClick={() => setShowOffline(v => !v)} className="flex w-full items-center gap-1 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-text">
                  <span className="text-[9px]">{showOffline ? "▾" : "▸"}</span> Offline — {data.offline.length}
                </button>
                {showOffline && <div className="space-y-0.5">{data.offline.map(m => <Row key={m.id} m={m} />)}</div>}
              </div>
            )}
          </>
        )}
      </div>
      {selected && (
        <div className="border-t bg-surface p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-hi text-xs font-semibold">{getInitials(selected.username)}</span>
            <div className="min-w-0">
              <div className={clsx("truncate text-sm", selected.id === "u1" ? "text-name-self" : "text-name-other")}>{toDisplayUsername(selected.username)}</div>
              <div className="text-[11px] capitalize text-muted">{selected.role}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href={`/u/${selected.username}`} prefetch={false} className="flex-1 rounded-lg border px-2 py-1.5 text-center text-xs hover:border-lime hover:text-lime">View profile</Link>
            {selected.id !== "u1" && <button type="button" onClick={() => message(selected.username)} className="flex-1 rounded-lg bg-lime px-2 py-1.5 text-xs font-medium text-bg hover:bg-lime-hover">Message</button>}
          </div>
        </div>
      )}
    </aside>
  );
}
