import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "@square/kernel";
import { PlatformController } from "../src/platform.controller";

const request = {
  user: { id: "owner-1", sessionId: "session-1", trustLevel: 1, sessionVersion: 1 },
} as never;

function makeController() {
  const query = vi.fn(async (..._args: unknown[]) => ({
    rows: [] as Record<string, unknown>[],
    rowCount: 0,
  }));
  const transactionQuery = vi.fn(async (..._args: unknown[]) => ({
    rows: [] as Record<string, unknown>[],
    rowCount: 0,
  }));
  const database = {
    pool: { query },
    transaction: vi.fn(async (work: (client: unknown) => Promise<unknown>) => work({ query: transactionQuery })),
  } as unknown as DatabaseService;
  return { controller: new PlatformController(database), query, transactionQuery };
}

describe("PlatformController", () => {
  it("supports public, cursor-paged community exploration", async () => {
    const { controller, query } = makeController();
    query.mockResolvedValueOnce({
      rows: [{
        id: "community-1",
        slug: "club",
        name: "Club",
        blurb: "A club",
        member_count: "12",
        category: "Build",
        school_name: null,
        avatar: null,
        banner_url: null,
        is_public: true,
        role: null,
      }],
      rowCount: 1,
    });

    await expect(controller.exploreCommunities(request, { q: "club", sort: "new", cursor: "previous" }))
      .resolves.toMatchObject({
        items: [{ id: "community-1", memberCount: 12, relation: "none" }],
        nextCursor: null,
      });
    expect(query.mock.calls[0][1]).toEqual(["club", null, null, "new", "previous", "owner-1", 31]);
  });

  it("creates opaque, expiring community invite codes", async () => {
    const { controller, query, transactionQuery } = makeController();
    query.mockResolvedValueOnce({ rows: [{ id: "community-1", role: "owner" }], rowCount: 1 });

    const invite = await controller.createInvite("club", request, {});

    expect(invite.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(invite.expiresAt).toBeTruthy();
    const inserted = transactionQuery.mock.calls[0][1] as unknown[];
    expect(inserted[2]).not.toBe(invite.code);
    expect(String(inserted[2])).toMatch(/^[a-f0-9]{64}$/);
  });

  it("limits community editing to owners", async () => {
    const { controller, query } = makeController();
    await expect(controller.updateCommunity("club", request, { name: "Updated Club" }))
      .rejects.toMatchObject({ status: 404, code: "not_found" });
    expect(query.mock.calls[0][0]).toContain("membership.role='owner'");
  });

  it("does not allow a member to change an owner's role", async () => {
    const { controller, query } = makeController();
    await expect(controller.updateCommunityMember("club", "owner-2", request, { role: "member" }))
      .rejects.toMatchObject({ status: 404, code: "not_found" });
    expect(query.mock.calls[0][0]).toContain("target.role<>'owner'");
  });

  it("rejects asset order requests containing duplicate IDs", async () => {
    const { controller, transactionQuery } = makeController();
    transactionQuery
      .mockResolvedValueOnce({ rows: [{ id: "community-1" }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          { id: "general", is_default: true, sort_order: 0 },
          { id: "resources", is_default: true, sort_order: 1 },
        ],
        rowCount: 2,
      });

    await expect(controller.reorderAssets("club", request, { assetIds: ["general", "general"] }))
      .rejects.toMatchObject({ status: 400, code: "validation_failed" });
    expect(transactionQuery).toHaveBeenCalledTimes(2);
  });

  it("prevents owners from removing themselves through the moderation endpoint", async () => {
    const { controller, transactionQuery } = makeController();
    await expect(controller.removeCommunityMember("club", "owner-1", request))
      .rejects.toMatchObject({ status: 409, code: "conflict" });
    expect(transactionQuery).not.toHaveBeenCalled();
  });

  it("approves a pending request and records the join in one transaction", async () => {
    const { controller, transactionQuery } = makeController();
    transactionQuery
      .mockResolvedValueOnce({ rows: [{ id: "community-1", role: "moderator" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ user_id: "member-2" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(controller.decideJoinRequest("club", "request-1", request, { approve: true }))
      .resolves.toEqual({ ok: true });

    expect(transactionQuery).toHaveBeenCalledTimes(7);
    expect(transactionQuery.mock.calls[3][0]).toContain("INSERT INTO communities.memberships");
    expect(transactionQuery.mock.calls[6][0]).toContain("moderation.community_audit_log");
  });
});
