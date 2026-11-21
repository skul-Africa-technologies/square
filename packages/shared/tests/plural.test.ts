import { describe, it, expect } from "vitest";
import { plural, pluralWord } from "../src/plural";

describe("plural (Intl.PluralRules)", () => {
  it("singular for one", () => {
    expect(plural(1, "community")).toBe("1 community");
    expect(plural(1, "member")).toBe("1 member");
    expect(plural(1, "person")).toBe("1 person");
  });

  it("regular plural by appending s", () => {
    expect(plural(2, "member")).toBe("2 members");
    expect(plural(4, "member")).toBe("4 members");
    expect(plural(0, "member")).toBe("0 members");
  });

  it("irregular plural requires explicit pluralForm", () => {
    expect(plural(2, "community", "communities")).toBe("2 communities");
    expect(plural(4, "community", "communities")).toBe("4 communities");
    expect(plural(1, "community", "communities")).toBe("1 community");
    expect(plural(2, "person", "people")).toBe("2 people");
  });

  it("pluralWord returns just the word", () => {
    expect(pluralWord(1, "community")).toBe("community");
    expect(pluralWord(2, "community", "communities")).toBe("communities");
    expect(pluralWord(1, "member", "members")).toBe("member");
    expect(pluralWord(2, "member", "members")).toBe("members");
  });

  it("never produces 'communitys' when pluralForm supplied", () => {
    expect(plural(4, "community", "communities")).not.toBe("4 communitys");
    expect(pluralWord(4, "community", "communities")).not.toBe("communitys");
  });
});
