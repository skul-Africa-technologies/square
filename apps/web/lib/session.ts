export const SESSION_COOKIE = "sq_session";

// Session token must be stored only in httpOnly Secure cookies (set server-side).
// Client code must not read/write session tokens in JS or localStorage.
export async function establishMockSession(): Promise<void> {
  await fetch("/api/session", { method: "POST", credentials: "same-origin" });
}

export async function clearSession(): Promise<void> {
  await fetch("/api/session", { method: "DELETE", credentials: "same-origin" });
}
