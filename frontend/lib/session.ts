export const SESSION_COOKIE = "sq_session";

// Session token must be stored only in httpOnly Secure cookies (set server-side).
// Client code must not read/write session tokens in JS or localStorage.
export async function establishMockSession(userId: string): Promise<void> {
  const response = await fetch("/api/session", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!response.ok) throw new Error("Could not establish mock session");
}

export async function clearSession(): Promise<void> {
  const response = await fetch("/api/session", { method: "DELETE", credentials: "same-origin" });
  if (!response.ok) throw new Error("Could not clear session");
  try { localStorage.removeItem("square.mock-session-user.v1"); } catch { /* Cookie removal is sufficient. */ }
}
