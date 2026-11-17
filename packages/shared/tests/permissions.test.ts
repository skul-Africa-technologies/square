import { describe, it, expect } from "vitest";
import type { Role, TabPermissions } from "../src/types";

function canPost(role: Role, p: TabPermissions) { return p.canPost.includes(role); }

describe("tab permission logic", () => {
  const general: TabPermissions = { canPost: ["owner","moderator","member"], canPin: ["owner","moderator"], canRemove: ["owner","moderator"] };
  const announcements: TabPermissions = { canPost: ["owner","moderator"], canPin: ["owner","moderator"], canRemove: ["owner","moderator"] };
  it("general allows all members to post", () => {
    expect(canPost("member", general)).toBe(true);
  });
  it("announcements restricts posting to admins", () => {
    expect(canPost("member", announcements)).toBe(false);
    expect(canPost("moderator", announcements)).toBe(true);
  });
});
