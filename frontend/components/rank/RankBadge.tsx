"use client";

import {
  Atom,
  BadgeCheck,
  Binary,
  CircleDot,
  Compass,
  Crown,
  Grid3x3,
  Infinity as InfinityIcon,
  Network,
  Orbit,
  ShieldCheck,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { getRank, type RankIconName } from "@square/shared";

const ICONS: Record<RankIconName, LucideIcon> = {
  "circle-dot": CircleDot,
  network: Network,
  binary: Binary,
  "grid-3x3": Grid3x3,
  compass: Compass,
  "shield-check": ShieldCheck,
  "badge-check": BadgeCheck,
  workflow: Workflow,
  orbit: Orbit,
  zap: Zap,
  atom: Atom,
  crown: Crown,
  infinity: InfinityIcon,
};

export function RankBadge({
  rankKey,
  size = 28,
  showName = false,
}: {
  rankKey: string;
  size?: number;
  showName?: boolean;
}) {
  const rank = getRank(rankKey);
  if (!rank) return null;
  const Icon = ICONS[rank.icon] ?? CircleDot;
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0" title={`${rank.name} rank`}>
      <span
        className="inline-flex items-center justify-center rounded-md"
        style={{
          width: size,
          height: size,
          color: rank.color,
          background: `${rank.color}1f`,
          boxShadow: `inset 0 0 0 1px ${rank.color}55`,
        }}
      >
        <Icon size={Math.round(size * 0.6)} strokeWidth={2.2} />
      </span>
      {showName && <span className="text-xs font-medium" style={{ color: rank.color }}>{rank.name}</span>}
    </span>
  );
}

export function RankName({ rankKey, className = "" }: { rankKey: string; className?: string }) {
  const rank = getRank(rankKey);
  if (!rank) return null;
  return (
    <span className={className} style={{ color: rank.color }}>
      {rank.name}
    </span>
  );
}