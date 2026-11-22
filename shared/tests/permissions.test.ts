import { describe, it, expect } from "vitest";
import type { Role, AssetPermissions } from "../src/types";
import { ASSET_CATALOG, DEFAULT_ASSETS, FULL_CATALOG } from "../src/assetCatalog";

function canPost(role: Role, p: AssetPermissions) { return p.canPost.includes(role); }
function canRead(role: Role, p: AssetPermissions) { return p.canRead.includes(role); }

describe("asset permission logic", () => {
  const general: AssetPermissions = { canRead: ["owner","moderator","member"], canPost: ["owner","moderator","member"], canPin: ["owner","moderator"] };
  const announcements: AssetPermissions = { canRead: ["owner","moderator","member"], canPost: ["owner","moderator"], canPin: ["owner","moderator"] };
  it("general allows all members to post", () => {
    expect(canPost("member", general)).toBe(true);
  });
  it("announcements restricts posting to owners and moderators", () => {
    expect(canPost("member", announcements)).toBe(false);
    expect(canPost("moderator", announcements)).toBe(true);
  });
  it("mods-only is hidden from members", () => {
    const modsOnly = FULL_CATALOG.find(a => a.key === "mods-only");
    expect(modsOnly).toBeTruthy();
    expect(modsOnly!.hiddenFromMembers).toBe(true);
    expect(canRead("member", modsOnly!.permissions)).toBe(false);
  });
  it("ships four non-deletable defaults and unique suggestions", () => {
    expect(DEFAULT_ASSETS.map(a => a.key)).toEqual(["announcements", "guidelines", "events", "general"]);
    expect(DEFAULT_ASSETS.every(a => a.isDefault)).toBe(true);
    expect(DEFAULT_ASSETS.filter(a => a.key !== "general").every(a =>
      a.permissions.canRead.includes("member") && !a.permissions.canPost.includes("member"),
    )).toBe(true);
    const keys = ASSET_CATALOG.map(a => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
