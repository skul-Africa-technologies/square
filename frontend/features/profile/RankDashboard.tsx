"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getRank } from "@square/shared";
import { RankBadge, RankName } from "@/components/rank/RankBadge";
import { QueryError } from "@/components/ui/query-error";

function pct(n: number): string {
  return `${Math.max(0, Math.min(100, n))}%`;
}

export function RankDashboard() {
  const qc = useQueryClient();
  const rank = useQuery({ queryKey: ["rank", "me"], queryFn: () => api.getMyRank() });
  const history = useQuery({ queryKey: ["rank", "history"], queryFn: () => api.getMyRankHistory() });
  const activity = useQuery({ queryKey: ["rank", "activity"], queryFn: () => api.getMyRankActivity() });
  const reqs = useQuery({ queryKey: ["rank", "requirements"], queryFn: () => api.getMyRankRequirements() });
  const seen = useMutation({
    mutationFn: () => api.markRankSeen(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rank"] }),
  });

  if (rank.isError) return <QueryError onRetry={() => rank.refetch()} />;
  if (!rank.data) return <div className="p-6 text-sm text-muted">Loading your rank…</div>;

  const me = rank.data;
  const def = getRank(me.rank);

  return (
    <div className="mx-auto w-full max-w-2xl p-4 md:p-6 space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold">Rank &amp; Reputation</h1>
          <p className="text-sm text-muted">How you grow on the Square.</p>
        </div>
        {me.frozen && <span className="text-xs rounded-full bg-surface-hi px-2 py-1 text-muted">XP frozen</span>}
      </header>

      <section className="rounded-xl border bg-surface p-5 space-y-4">
        <div className="flex items-center gap-4">
          <RankBadge rankKey={me.rank} size={56} />
          <div className="min-w-0">
            <div className="font-heading text-2xl font-semibold" style={{ color: def?.color }}>
              <RankName rankKey={me.rank} />
            </div>
            <div className="text-sm text-muted">{Number(me.xpTotal ?? 0).toLocaleString()} XP</div>
          </div>
        </div>

        {me.isMaxRank ? (
          <p className="text-sm text-muted">You have reached the highest rank. Infinite possibilities.</p>
        ) : (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted">
              <span>{def?.name ?? me.rank}</span>
              <span>{getRank(me.nextRank ?? "")?.name ?? me.nextRank}</span>
            </div>
            <div className="h-2 rounded-full bg-bg-2 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: pct(me.progressPercent), background: def?.color ?? "#60A5FA" }} />
            </div>
            <div className="text-xs text-muted">{me.xpToNext?.toLocaleString()} XP to next rank</div>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-surface p-5 space-y-3">
        <h2 className="font-heading text-sm font-semibold">Ways to earn XP</h2>
        {reqs.isError ? (
          <QueryError onRetry={() => reqs.refetch()} />
        ) : (
          <ul className="divide-y divide-border/60">
            {(reqs.data?.ways ?? []).map((w) => (
              <li key={w.source} className="flex items-center justify-between py-2 text-sm">
                <span>{w.label}</span>
                <span className="text-muted">
                  +{w.perEventXp} · {w.usedToday}/{w.dailyCap} today
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-surface p-5 space-y-3">
        <h2 className="font-heading text-sm font-semibold">Recent activity</h2>
        {activity.isError ? (
          <QueryError onRetry={() => activity.refetch()} />
        ) : (activity.data?.activity ?? []).length === 0 ? (
          <p className="text-sm text-muted">No XP activity yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {(activity.data?.activity ?? []).map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                <span className={a.revoked ? "line-through text-muted" : ""}>{a.label}</span>
                <span className={a.revoked ? "text-muted" : "text-lime"}>{a.revoked ? "revoked" : `+${a.xp}`}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-surface p-5 space-y-3">
        <h2 className="font-heading text-sm font-semibold">Rank history</h2>
        {history.isError ? (
          <QueryError onRetry={() => history.refetch()} />
        ) : (history.data?.history ?? []).length === 0 ? (
          <p className="text-sm text-muted">Your journey starts at Nobis.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {(history.data?.history ?? []).map((h, i) => (
              <li key={`${h.rank}-${i}`} className="flex items-center justify-between py-2 text-sm">
                <RankName rankKey={h.rank} />
                <span className="text-muted">{new Date(h.achievedAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => seen.mutate()}
          className="text-xs rounded-lg border px-3 py-1.5 hover:bg-surface-hi"
        >
          Mark celebration as seen
        </button>
      </section>
    </div>
  );
}