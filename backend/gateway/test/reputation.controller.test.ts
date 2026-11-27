import { describe, expect, it, vi } from "vitest";
import type { DatabaseService, RedisService } from "@square/kernel";
import { ReputationController } from "../src/reputation.controller";
import { ReputationService } from "../src/reputation.service";
import { DEFAULT_SCORING } from "../src/reputation.config";

const request = {
  user: { id: "user-1", sessionId: "s", trustLevel: 1, sessionVersion: 1 },
} as never;

function makeController(handlers: {
  query?: (sql: string) => { rows: Record<string, unknown>[]; rowCount: number } | undefined;
  tx?: (sql: string) => { rows: Record<string, unknown>[]; rowCount: number } | undefined;
}) {
  const query = vi.fn(async (sql: string) => handlers.query?.(sql) ?? { rows: [], rowCount: 0 });
  const tx = vi.fn(async (sql: string) => handlers.tx?.(sql) ?? { rows: [], rowCount: 0 });
  const database = {
    pool: { query },
    transaction: vi.fn(async (work: (client: unknown) => Promise<unknown>) => work({ query: tx })),
  } as unknown as DatabaseService;
  const set = vi.fn(async () => "OK");
  const redis = { client: { set } } as unknown as RedisService;
  const service = new ReputationService(DEFAULT_SCORING);
  return { controller: new ReputationController(service, database, redis, DEFAULT_SCORING), query, tx, set };
}

const defsRows = {
  rows: [
    { key: "nobis", position: 1, min_xp: "0" },
    { key: "node", position: 2, min_xp: "100" },
  ],
  rowCount: 2,
};

describe("ReputationController", () => {
  it("returns the public rank key only", async () => {
    const { controller, query } = makeController({
      query: (sql) => {
        if (sql.includes("users.profiles")) return { rows: [{ id: "user-2" }], rowCount: 1 };
        if (sql.includes("member_progress")) return { rows: [{ rank_key: "node" }], rowCount: 1 };
        return undefined;
      },
    });
    await expect(controller.publicRank("Node")).resolves.toEqual({ rank: "node" });
    expect(query.mock.calls[0][1]).toEqual(["node"]);
  });

  it("404s for an unknown username", async () => {
    const { controller } = makeController({ query: () => ({ rows: [], rowCount: 0 }) });
    await expect(controller.publicRank("ghost")).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("computes progress from defs + xp", async () => {
    const { controller } = makeController({
      tx: (sql) => {
        if (sql.includes("rank_definitions")) return defsRows;
        if (sql.includes("member_progress")) return { rows: [{ xp_total: "120", rank_key: "node", rank_achieved_at: null, xp_frozen_until: null }], rowCount: 1 };
        return undefined;
      },
    });
    const progress = (await controller.myRank(request)) as Record<string, unknown>;
    expect(progress.rank).toBe("node");
    expect(progress.nextRank).toBeNull(); // only 2 defs
    expect(progress.xpTotal).toBe(120);
  });

  it("marks the seen rank in redis", async () => {
    const { controller, query, set } = makeController({
      query: () => ({ rows: [{ rank_key: "node" }], rowCount: 1 }),
    });
    await expect(controller.markSeen(request)).resolves.toEqual({ rank: "node" });
    expect(set).toHaveBeenCalledWith("rank:seen:user-1", "node");
  });
});