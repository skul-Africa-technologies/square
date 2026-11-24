import { describe, expect, it } from "vitest";
import { mockApi } from "./mock";

describe("mock reaction realtime contract", () => {
  it("does not fabricate reaction updates without a real toggle", async () => {
    const events: unknown[] = [];
    const unsubscribe = mockApi.subscribeReactionEvents(
      "asset",
      "wc-general",
      event => events.push(event),
    );

    await new Promise(resolve => setTimeout(resolve, 550));
    unsubscribe();

    expect(events).toEqual([]);
  });
});
