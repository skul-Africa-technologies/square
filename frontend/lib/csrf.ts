// CSRF header expected by backend (placeholder name; align with backend contract).
export const CSRF_HEADER = "x-csrf-token";
export function getCsrfToken(): string | null {
  // Non-httpOnly CSRF cookie/token pattern is common; if backend provides it via cookie/meta, read here.
  // No secrets; token is not a session credential.
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )sq_csrf=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}
