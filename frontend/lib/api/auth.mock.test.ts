import { afterEach, describe, expect, it, vi } from "vitest";
import { mockApi } from "./mock";

describe("mock authentication contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("uses the backend error codes for invalid and throttled verification attempts", async () => {
    const email = "invalid-code@example.com";
    await mockApi.requestCode(email);
    for (let attempt = 0; attempt < 4; attempt++) {
      await expect(mockApi.verifyCode(email, "000000")).rejects.toMatchObject({
        code: "code_invalid",
      });
    }
    await expect(mockApi.verifyCode(email, "000000")).rejects.toMatchObject({
      code: "too_many_attempts",
    });
  });

  it("finds institutions by their searchable aliases", async () => {
    await expect(mockApi.listSchools("FUTMINNA")).resolves.toContainEqual(
      expect.objectContaining({ id: "fut-minna", name: "FUT Minna" }),
    );
  });

  it("keeps self-reported alumni status separate from student verification", async () => {
    const makeStorage = () => {
      const values = new Map<string, string>();
      return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
      };
    };
    vi.stubGlobal("window", { localStorage: makeStorage(), sessionStorage: makeStorage() });
    const email = "alumni@example.com";
    await mockApi.requestCode(email);
    const verification = await mockApi.verifyCode(email, "123456");
    if (!verification.isNewUser) throw new Error("Unregistered email unexpectedly signed in");

    const result = await mockApi.signup({
      signupTicket: verification.signupTicket,
      username: "alumni-test",
      schoolId: "fut-minna",
      educationStatus: "alumni",
      dateOfBirth: "2000-01-01",
    });

    expect(result.user).toMatchObject({
      educationStatus: "alumni",
      verifiedStudent: false,
    });
  });

  it("keeps a signup ticket available after profile validation fails", async () => {
    const makeStorage = () => {
      const values = new Map<string, string>();
      return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
      };
    };
    vi.stubGlobal("window", { localStorage: makeStorage(), sessionStorage: makeStorage() });
    const email = "retry-signup@example.com";
    await mockApi.requestCode(email);
    const verification = await mockApi.verifyCode(email, "123456");
    if (!verification.isNewUser) throw new Error("Unregistered email unexpectedly signed in");
    const request = {
      signupTicket: verification.signupTicket,
      username: "retry-signup",
      schoolId: "fut-minna",
      educationStatus: "student" as const,
      dateOfBirth: "2015-01-01",
    };

    await expect(mockApi.signup(request)).rejects.toMatchObject({ code: "age_not_allowed" });
    await expect(mockApi.signup({ ...request, dateOfBirth: "2000-01-01" })).resolves.toMatchObject({
      user: { username: "retry-signup" },
    });
  });

  it("lists and revokes mocked sessions", async () => {
    const sessions = await mockApi.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ current: true });

    await mockApi.revokeSession(sessions[0].id);

    await expect(mockApi.listSessions()).rejects.toMatchObject({ code: "unauthenticated" });
  });
});
