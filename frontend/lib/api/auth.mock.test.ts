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
    expect(existing).toMatchObject({ isNewUser: false, user: { username: "amaka-eze" } });
    expect(newAccount.isNewUser).toBe(true);
    expect(newAccount.signupTicket).toEqual(expect.any(String));
  });
});
