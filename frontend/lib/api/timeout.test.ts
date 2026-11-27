import { describe, expect, it } from "vitest";
import { withTimeout } from "./timeout";
import { ClientApiError } from "./errors";

describe("withTimeout", () => {
  it("rejects a never-resolving promise with a timeout error within the window", async () => {
    const hanging = withTimeout({ never: () => new Promise(() => {}) }, 50);
    const start = Date.now();
    await expect(hanging.never()).rejects.toMatchObject({ code: "timeout" });
    expect(Date.now() - start).toBeLessThan(500);
  });

  it("passes through a resolving promise unchanged", async () => {
    const api = withTimeout({ ok: async () => 42 }, 1000);
    await expect(api.ok()).resolves.toBe(42);
  });

  it("passes through non-promise methods (e.g. unsubscribe) unchanged", () => {
    const fn = () => "unsubscribe";
    const api = withTimeout({ subscribe: fn }, 50);
    expect(api.subscribe()).toBe("unsubscribe");
  });

  it("rejects with a ClientApiError instance", async () => {
    const api = withTimeout({ never: () => new Promise(() => {}) }, 20);
    await expect(api.never()).rejects.toBeInstanceOf(ClientApiError);
  });
});