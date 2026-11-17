import { describe, it, expect } from "vitest";
import { validateUsername, visibleLength, toStoredUsername } from "../src/username";

describe("username rules", () => {
  it("accepts basic names", () => {
    expect(validateUsername("#amaka-eze").ok).toBe(true);
    expect(validateUsername("amaka-eze").ok).toBe(true);
  });
  it("rejects digits, spaces, underscores, symbols", () => {
    for (const v of ["#amaka1", "#amaka eze", "#amaka_eze", "#amaka!", "#amaka.eze"]) {
      expect(validateUsername(v).ok).toBe(false);
    }
  });
  it("allows single hyphen between words only", () => {
    expect(validateUsername("#amaka--eze").ok).toBe(false);
    expect(validateUsername("#-amaka").ok).toBe(false);
    expect(validateUsername("#amaka-").ok).toBe(false);
  });
  it("enforces 3-24 visible chars including #", () => {
    expect(validateUsername("#ab").ok).toBe(false);
    expect(validateUsername("#abc").ok).toBe(true);
  });
  it("accepts accented letters (Yoruba etc)", () => {
    expect(validateUsername("#ọlá-dé").ok).toBe(true);
    expect(validateUsername("#Adébáyọ̀").ok).toBe(true);
  });
  it("accepts emoji and counts as one visible char", () => {
    expect(validateUsername("#dev-🚀").ok).toBe(true);
    expect(validateUsername("#👍🏽-builder").ok).toBe(true); // skin tone
    expect(visibleLength("#👍🏽")).toBe(2); // # + one grapheme
  });
  it("stores lowercase without #", () => {
    expect(toStoredUsername("#Amaka-Eze")).toBe("amaka-eze");
  });
});
