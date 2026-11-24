import { afterEach, describe, expect, it, vi } from "vitest";
import { realApi } from "./real";

function jsonResponse(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("realApi session refresh", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes once and retries an authenticated request after a 401", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "unauthenticated", message: "Expired" } }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
      .mockResolvedValueOnce(jsonResponse(200, []));
    vi.stubGlobal("fetch", fetchMock);

    await expect(realApi.listCommunityAssets("community-1")).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/auth/refresh");
    expect(String(fetchMock.mock.calls[2][0])).toContain("/communities/community-1/assets");
  });
});

describe("realApi authentication errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("unwraps the backend error envelope for invalid verification codes", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(400, {
      error: {
        code: "code_invalid",
        message: "That code is invalid",
        field: "code",
        requestId: "request-1",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(realApi.verifyCode("person@example.com", "000000")).rejects.toMatchObject({
      code: "code_invalid",
      message: "That code is invalid",
      field: "code",
    });
  });
});

describe("realApi institution search", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("searches the database-backed institution directory", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, [{
        id: "fut-minna",
        name: "FUT Minna",
        institutionType: "university",
        ownership: "federal",
      }]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(realApi.listSchools(" FUT ")).resolves.toEqual([{
      id: "fut-minna",
      name: "FUT Minna",
      institutionType: "university",
      ownership: "federal",
    }]);

    expect(String(fetchMock.mock.calls[0][0])).toContain("/schools?q=FUT");
  });
});

describe("realApi profile privacy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps birthday privacy to the validated profile settings endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(200, {
      birthdayOptIn: true,
      appearOffline: false,
      showCommunities: true,
      dmPrivacy: "shared",
      timezone: "Africa/Lagos",
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(realApi.updatePrivacy({ showBirthday: true })).resolves.toEqual({ ok: true });

    expect(String(fetchMock.mock.calls[0][0])).toContain("/me/settings");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ birthdayOptIn: true });
  });
});

describe("realApi sessions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists sessions and calls the revocation and logout endpoints", async () => {
    const sessions = [{
      id: "session-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastUsedAt: null,
      expiresAt: "2026-02-01T00:00:00.000Z",
      current: true,
    }];
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, sessions))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(realApi.listSessions()).resolves.toEqual(sessions);
    await expect(realApi.revokeSession("session-1")).resolves.toBeUndefined();
    await expect(realApi.logout()).resolves.toBeUndefined();
    await expect(realApi.logoutAll()).resolves.toBeUndefined();

    expect(String(fetchMock.mock.calls[0][0])).toContain("/auth/sessions");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/auth/sessions/session-1");
    expect(String(fetchMock.mock.calls[2][0])).toContain("/auth/logout");
    expect(String(fetchMock.mock.calls[3][0])).toContain("/auth/logout-all");
    for (const [, init] of fetchMock.mock.calls.slice(1)) {
      expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
    }
  });
});
