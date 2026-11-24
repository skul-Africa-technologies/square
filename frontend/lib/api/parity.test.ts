import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appConfig } from "../config";
import { api } from "./index";

const target = process.env.PARITY_TARGET;
const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
};

async function signIn(email: string): Promise<void> {
  await api.requestCode(email);
  const verification = await api.verifyCode(email, "123456");
  if (verification.isNewUser) throw new Error(`Expected ${email} to be a registered account`);
}

describe(`API parity (${target ?? "unset"})`, () => {
  const originalFetch = globalThis.fetch;
  const cookieJar = new Map<string, string>();
  let documentCookies = "";

  beforeEach(() => {
    cookieJar.clear();
    documentCookies = "";
    vi.stubGlobal("window", { localStorage: storage(), sessionStorage: storage() });
    vi.stubGlobal("document", {
      get cookie() { return documentCookies; },
      set cookie(value: string) { documentCookies = value; },
    });

    if (target === "real") {
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        headers.set("Origin", "http://localhost:3000");
        if (cookieJar.size > 0) {
          headers.set("Cookie", [...cookieJar.entries()].map(([key, value]) => `${key}=${value}`).join("; "));
        }
        const response = await originalFetch(input, { ...init, headers });
        for (const cookie of response.headers.getSetCookie()) {
          const [pair, ...attributes] = cookie.split(";");
          const separator = pair.indexOf("=");
          if (separator < 0) continue;
          const name = pair.slice(0, separator);
          const value = pair.slice(separator + 1);
          if (attributes.some((attribute) => attribute.trim().toLowerCase() === "max-age=0")) {
            cookieJar.delete(name);
          } else {
            cookieJar.set(name, value);
          }
        }
        documentCookies = [...cookieJar.entries()]
          .filter(([name]) => name.endsWith("_csrf"))
          .map(([name, value]) => `${name}=${value}`)
          .join("; ");
        return response;
      });
    } else {
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/session") return new Response(null, { status: 204 });
        return originalFetch(input, init);
      });
    }

    expect(appConfig.useMock).toBe(target === "mock");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("logs in an existing account with the frontend API contract", async () => {
    await expect(api.requestCode("amaka@example.com")).resolves.toEqual({ ok: true });

    await expect(api.verifyCode("amaka@example.com", "123456")).resolves.toMatchObject({
      isNewUser: false,
      user: { username: "amaka-eze", profileComplete: true },
    });
    await expect(api.me()).resolves.toMatchObject({
      username: "amaka-eze",
      educationStatus: "student",
      verifiedStudent: false,
    });
    const communities = await api.myCommunities();
    expect(communities.length).toBeGreaterThan(0);
    await expect(api.unreadCount()).resolves.toEqual({ unread: 23, mentions: 6 });
  });

  it("uses the same validation helpers during profile setup", async () => {
    await expect(api.usernameAvailable("parity-signup")).resolves.toEqual({ available: true });
    await expect(api.listSchools("FUTMINNA")).resolves.toContainEqual(
      expect.objectContaining({ id: "fut-minna", name: "FUT Minna" }),
    );
  });

  it("signs up a new account through the frontend API contract", async () => {
    await expect(api.requestCode("parity-signup@example.com")).resolves.toEqual({ ok: true });
    const verification = await api.verifyCode("parity-signup@example.com", "123456");
    expect(verification).toMatchObject({ isNewUser: true, signupTicket: expect.any(String) });
    if (!verification.isNewUser) throw new Error("Unregistered email unexpectedly signed in");

    await expect(api.signup({
      signupTicket: verification.signupTicket,
      username: "parity-signup",
      schoolId: "fut-minna",
      educationStatus: "alumni",
      dateOfBirth: "2000-01-01",
    })).resolves.toMatchObject({
      user: {
        username: "parity-signup",
        educationStatus: "alumni",
        verifiedStudent: false,
        profileComplete: true,
      },
    });
    await expect(api.usernameAvailable("parity-signup")).resolves.toEqual({ available: false });
  });

  it("preserves signup tickets when age validation fails", async () => {
    await api.requestCode("parity-retry@example.com");
    const verification = await api.verifyCode("parity-retry@example.com", "123456");
    if (!verification.isNewUser) throw new Error("Unregistered email unexpectedly signed in");
    const signup = {
      signupTicket: verification.signupTicket,
      username: "parity-retry",
      schoolId: "fut-minna",
      educationStatus: "student" as const,
      dateOfBirth: "2015-01-01",
    };

    await expect(api.signup(signup)).rejects.toMatchObject({
      code: "age_not_allowed",
      message: "Age requirement not met",
    });
    await expect(api.signup({ ...signup, dateOfBirth: "2000-01-01" })).resolves.toMatchObject({
      user: { username: "parity-retry" },
    });
  });

  it("reports invalid signup tickets with the backend error contract", async () => {
    await expect(api.signup({
      signupTicket: "invalid-parity-ticket",
      username: "parity-invalid-ticket",
      schoolId: "fut-minna",
      educationStatus: "student",
      dateOfBirth: "2000-01-01",
    })).rejects.toMatchObject({
      code: "signup_ticket_invalid",
      message: "Signup ticket is invalid",
    });
  });

  it("limits invalid verification codes using the same error codes", async () => {
    await api.requestCode("parity-invalid-code@example.com");
    for (let attempt = 0; attempt < 4; attempt++) {
      await expect(api.verifyCode("parity-invalid-code@example.com", "000000"))
        .rejects.toMatchObject({ code: "code_invalid" });
    }
    await expect(api.verifyCode("parity-invalid-code@example.com", "000000"))
      .rejects.toMatchObject({ code: "too_many_attempts" });
  });

  it("isolates sessions by account and protects authenticated routes", async () => {
    await signIn("tunde@example.com");
    const tundeSessions = await api.listSessions();
    expect(tundeSessions).toHaveLength(1);
    expect(tundeSessions[0]).toMatchObject({ current: true });

    await signIn("kemi@example.com");
    const kemiSessions = await api.listSessions();
    expect(kemiSessions).toHaveLength(1);
    expect(kemiSessions[0]).toMatchObject({ current: true });
    await expect(api.revokeSession(tundeSessions[0].id)).rejects.toMatchObject({ code: "not_found" });
    await expect(api.listSessions()).resolves.toHaveLength(1);

    await api.logout();
    await expect(api.listSessions()).rejects.toMatchObject({ code: "unauthenticated" });
  });
});
