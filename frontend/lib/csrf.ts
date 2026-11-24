export const CSRF_HEADER = "X-Square-CSRF";
export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )(?:__Host-sq_csrf|sq_csrf)=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}
