import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const COOKIE = "sq_session";

export async function POST(request: Request) {
  // Dev/mock-only helper to establish an httpOnly session cookie without exposing tokens to JS.
  // Real auth must set cookies server-side on the auth API domain/response.
  const jar = await cookies();
  const body = await request.json() as { userId?: string };
  if (!body.userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  jar.set(COOKIE, body.userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.set(COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return NextResponse.json({ ok: true });
}
