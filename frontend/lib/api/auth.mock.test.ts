import { describe, expect, it } from "vitest";
import { mockApi } from "./mock";

describe("mock authentication contract", () => {
  it("does not distinguish known and unknown email addresses when requesting a code", async () => {
    const known = await mockApi.requestCode("amaka@example.com");
    const unknown = await mockApi.requestCode("new-person@example.com");
    expect(known).toEqual({ ok: true });
    expect(unknown).toEqual(known);
  });

  it("determines account status only after a valid code", async () => {
    const existing = await mockApi.verifyCode("amaka@example.com", "123456");
    const newAccount = await mockApi.verifyCode("not-registered@example.com", "123456");
    if (existing.isNewUser) throw new Error("Registered email was treated as a new account");
    expect(existing.user).toMatchObject({ username: "amaka-eze", profileComplete: true });
    expect(existing.user).not.toHaveProperty("dob");
    expect(existing.user).not.toHaveProperty("email");
    if (!newAccount.isNewUser) throw new Error("Unregistered email unexpectedly signed in");
    expect(newAccount.signupTicket).toEqual(expect.any(String));
  });
});
