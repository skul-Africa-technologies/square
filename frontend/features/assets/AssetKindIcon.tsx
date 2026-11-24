"use client";

import { CalendarDays, Columns3, Hash, List, LockKeyhole, Megaphone, MessageSquareText, ShieldCheck, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getAssetCatalogEntry, type Asset, type AssetKind } from "@square/shared";

const catalogIcons: Record<string, LucideIcon> = {
  announcements: Megaphone,
  guidelines: ShieldCheck,
  events: CalendarDays,
  campaigns: Trophy,
  "mods-only": LockKeyhole,
};

const kindIcons: Record<AssetKind, LucideIcon> = {
  chat: Hash,
  feed: MessageSquareText,
  rules: ShieldCheck,
  events: CalendarDays,
  board: Columns3,
  list: List,
  campaigns: Trophy,
};

export function AssetKindIcon({ asset, className = "h-4 w-4" }: { asset: Pick<Asset, "catalogKey" | "kind">; className?: string }) {
  const entry = getAssetCatalogEntry(asset.catalogKey);
  const Icon = (entry && catalogIcons[entry.key]) || kindIcons[entry?.kind ?? asset.kind];
  return <Icon className={className} aria-hidden="true" />;
}
