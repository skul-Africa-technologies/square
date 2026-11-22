import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "../src/cursor";

describe("cursor helpers", () => {
  it("round-trips an opaque keyset cursor", () => {
    const cursor = { id: "01JAZZ", score: 0.75 };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("rejects tampered, oversized and unknown-field cursors", () => {
    expect(() => decodeCursor("%%%")).toThrow("Invalid cursor");
    expect(() => decodeCursor("a".repeat(513))).toThrow("Invalid cursor");
    expect(() => decodeCursor(Buffer.from('{"id":"x","extra":true}').toString("base64url"))).toThrow("Invalid cursor");
  });
});
