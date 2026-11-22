import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC = ["/api/session", "/api/health"];
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/signup/setup") || pathname.startsWith("/_next") || pathname.includes(".")) {
    return NextResponse.next();
  }
  const token = req.cookies.get("sq_session")?.value;
  const isAuthRoute = pathname === "/login" || pathname === "/signup";
  if (token && isAuthRoute) {
    const url = req.nextUrl.clone();
    url.pathname = "/home";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (isAuthRoute || PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
