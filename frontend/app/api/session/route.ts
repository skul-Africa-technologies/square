import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const COOKIE = "sq_session";

export async function POST() {
  // Dev/mock-only helper to establish an httpOnly session cookie without exposing tokens to JS.
  // Real auth must set cookies server-side on the auth API domain/response.
  const jar = await cookies();
  jar.set(COOKIE, "1", {
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
