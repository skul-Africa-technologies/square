import { describe, expect, it } from "vitest";
import {
  authVerifyCodeResponseSchema,
  mentionSeenRequestSchema,
  mentionableQuerySchema,
  reactionStreamEventSchema,
  unreadSummarySchema,
  userSchema,
} from "../src/schemas";
import { ASSET_CATALOG, DEFAULT_ASSETS } from "../src/assetCatalog";

describe("shared API contract schemas", () => {
  it("uses exactly the blueprint's default and fixed catalog assets", () => {
    expect(DEFAULT_ASSETS.map(asset => asset.key)).toEqual([
      "announcements",
      "guidelines",
      "events",
      "general",
    ]);
    expect(DEFAULT_ASSETS.every(asset => asset.isDefault)).toBe(true);
    expect(ASSET_CATALOG.map(asset => asset.key).sort()).toEqual([
      "feedback",
      "hackathons",
      "introductions",
      "mods-only",
      "off-topic",
      "opportunities",
      "projects",
      "resources",
      "showcase",
      "support",
      "campaigns",
    ].sort());
  });
  it("accepts reaction stream events and rejects malformed or extra fields", () => {
    const event = {
      type: "reaction.updated",
      scope: "asset",
      roomId: "asset-1",
      messageId: "message-1",
      emoji: "👍",
      count: 0,
      op: "remove",
      userId: "user-1",
    };
    expect(reactionStreamEventSchema.safeParse(event).success).toBe(true);
    expect(reactionStreamEventSchema.safeParse({ ...event, count: -1 }).success).toBe(false);
    expect(reactionStreamEventSchema.safeParse({ ...event, unexpected: true }).success).toBe(false);
  });

  it("uses a discriminated auth result and rejects private DOB or email fields", () => {
    const user = {
      id: "user-1",
      username: "square-user",
      verifiedStudent: true,
      joinedAt: "2026-01-01",
      profileComplete: true,
    };
    expect(authVerifyCodeResponseSchema.safeParse({ isNewUser: false, user }).success).toBe(true);
    expect(authVerifyCodeResponseSchema.safeParse({ isNewUser: true, signupTicket: "ticket-1" }).success).toBe(true);
    expect(authVerifyCodeResponseSchema.safeParse({ isNewUser: false, user, signupTicket: "ticket-1" }).success).toBe(false);
    expect(authVerifyCodeResponseSchema.safeParse({
      isNewUser: false,
      user: { ...user, dob: "2000-01-01" },
    }).success).toBe(false);
    expect(userSchema.safeParse({ ...user, email: "private@example.com" }).success).toBe(false);
  });

  it("requires a seen update to target message IDs or all mentions, but not both", () => {
    expect(mentionSeenRequestSchema.safeParse({ messageIds: ["message-1"] }).success).toBe(true);
    expect(mentionSeenRequestSchema.safeParse({ all: true }).success).toBe(true);
    expect(mentionSeenRequestSchema.safeParse({ messageIds: ["message-1"], all: true }).success).toBe(false);
    expect(mentionSeenRequestSchema.safeParse({ messageIds: [] }).success).toBe(false);
  });

  it("coerces and bounds mentionable-member pagination", () => {
    expect(mentionableQuerySchema.parse({ q: "campus", limit: "8" })).toEqual({ q: "campus", limit: 8 });
    expect(mentionableQuerySchema.safeParse({ limit: "1000" }).success).toBe(false);
  });

  it("rejects unread summaries whose mention counts exceed unread counts", () => {
    expect(unreadSummarySchema.safeParse({
      dm: { unread: 2, mentions: 1 },
      assets: [{ assetId: "asset-1", unread: 3, mentions: 2 }],
    }).success).toBe(true);
    expect(unreadSummarySchema.safeParse({
      dm: { unread: 0, mentions: 1 },
      assets: [],
    }).success).toBe(false);
  });
});
