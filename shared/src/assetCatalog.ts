import type { AssetCatalogEntry, AssetCategory } from "./types";

const ALL = ["owner", "moderator", "member"] as const;
const MODS = ["owner", "moderator"] as const;

const perms = (
  canRead: readonly ("owner" | "moderator" | "member")[],
  canPost: readonly ("owner" | "moderator" | "member")[] = canRead,
  canPin: readonly ("owner" | "moderator" | "member")[] = MODS,
) => ({
  canRead: [...canRead] as ("owner" | "moderator" | "member")[],
  canPost: [...canPost] as ("owner" | "moderator" | "member")[],
  canPin: [...canPin] as ("owner" | "moderator" | "member")[],
});

export const ASSET_CATEGORY_ORDER: AssetCategory[] = ["Information", "Community", "Resources", "Build"];

/** The four assets every community is created with. They cannot be deleted. */
export const DEFAULT_ASSETS: AssetCatalogEntry[] = [
  { key: "announcements", name: "announcements", description: "Official updates from the owners and moderators.", kind: "feed", category: "Information", permissions: perms(ALL, MODS), unique: true, isDefault: true },
  { key: "guidelines", name: "guidelines", description: "The rules and expectations for this community.", kind: "rules", category: "Information", permissions: perms(ALL, MODS), unique: true, isDefault: true },
  { key: "events", name: "events", description: "Meetups, workshops, and dates to remember.", kind: "events", category: "Information", permissions: perms(ALL, MODS), unique: true, isDefault: true },
  { key: "general", name: "general", description: "The main conversation for everyone in the community.", kind: "chat", category: "Community", permissions: perms(ALL), unique: true, isDefault: true },
];

/** Optional suggestions offered in the Add an asset dialog. One instance per entry per community. */
export const ASSET_CATALOG: AssetCatalogEntry[] = [
  { key: "support", name: "support", description: "Ask questions and get help from members.", kind: "chat", category: "Community", permissions: perms(ALL), unique: true },
  { key: "introductions", name: "introductions", description: "Say hello and meet the community.", kind: "chat", category: "Community", permissions: perms(ALL), unique: true },
  { key: "off-topic", name: "off-topic", description: "Everything that is not on topic.", kind: "chat", category: "Community", permissions: perms(ALL), unique: true },
  { key: "showcase", name: "showcase", description: "Share what you built.", kind: "feed", category: "Community", permissions: perms(ALL), unique: true },
  { key: "resources", name: "resources", description: "Links, guides, and tools worth keeping.", kind: "list", category: "Resources", permissions: perms(ALL), unique: true },
  { key: "opportunities", name: "opportunities", description: "Internships, grants and jobs with deadlines.", kind: "list", category: "Resources", permissions: perms(ALL), unique: true },
  { key: "feedback", name: "feedback", description: "Get feedback on work in progress.", kind: "feed", category: "Community", permissions: perms(ALL), unique: true },
  { key: "projects", name: "projects", description: "Ideas, builds and launches with teams.", kind: "board", category: "Build", permissions: perms(ALL), unique: true },
  { key: "campaigns", name: "campaigns", description: "Community campaigns with tasks and a leaderboard.", kind: "campaigns", category: "Build", permissions: perms(MODS), unique: true },
  { key: "hackathons", name: "hackathons", description: "Run and track hackathon projects.", kind: "board", category: "Build", permissions: perms(MODS), unique: true },
  { key: "mods-only", name: "mods-only", description: "Private space for owners and moderators.", kind: "chat", category: "Community", permissions: perms(MODS), unique: true, hiddenFromMembers: true },
];

export const FULL_CATALOG: AssetCatalogEntry[] = [...DEFAULT_ASSETS, ...ASSET_CATALOG];
const catalogByKey = new Map(FULL_CATALOG.map((entry) => [entry.key, entry]));

export function getAssetCatalogEntry(key: string | undefined): AssetCatalogEntry | undefined {
  return key ? catalogByKey.get(key) : undefined;
}

export const ADD_ASSET_ROLES = ["owner", "moderator"] as const;
export const ALLOW_CUSTOM_ASSETS = false;
