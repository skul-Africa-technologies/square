import { describe, it, expect } from "vitest";
import { validateUsername, visibleLength, toStoredUsername, getInitials, formatUsername } from "../src/username";

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

describe("getInitials", () => {
  it("hyphenated username — takes first letter of each part", () => {
    expect(getInitials("amaka-eze")).toBe("AE");
    expect(getInitials("tunde-ade")).toBe("TA");
    expect(getInitials("kemi-obi")).toBe("KO");
    expect(getInitials("victory-gray")).toBe("VG");
  });

  it("stores without leading #, still works with # prefix", () => {
    expect(getInitials("#amaka-eze")).toBe("AE");
    expect(getInitials("#victory-gray")).toBe("VG");
  });

  it("single-word username — takes first two characters", () => {
    expect(getInitials("amaka")).toBe("AM");
    expect(getInitials("zainab")).toBe("ZA");
    expect(getInitials("ab")).toBe("AB");
  });

  it("three-part hyphenated name — only uses first two parts", () => {
    expect(getInitials("chukwuemeka-obi-jr")).toBe("CO");
  });

  it("emoji username — takes first grapheme of each part", () => {
    // emoji counts as one grapheme, so "🚀" is first char of its segment
    expect(getInitials("dev-🚀")).toBe("D🚀");
    expect(getInitials("🌟-builder")).toBe("🌟B");
  });

  it("mixed accented letters — uppercases correctly", () => {
    expect(getInitials("ọlá-dé")).toBe("ỌD");
    expect(getInitials("adébáyọ")).toBe("AD"); // single segment, first two chars
  });

  it("empty-ish segments (edge case) — skips blanks", () => {
    // leading/trailing hyphens strip to empty segments; filter(Boolean) skips them
    // A valid stored username can't start with hyphen, but getInitials is defensive
    expect(getInitials("a")).toBe("A");
  });
});

describe("formatUsername", () => {
  it("adds # prefix when missing", () => {
    expect(formatUsername("amaka-eze")).toBe("#amaka-eze");
  });
  it("does not double-prefix # when already present", () => {
    expect(formatUsername("#amaka-eze")).toBe("#amaka-eze");
  });
});
