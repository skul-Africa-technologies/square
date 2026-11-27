"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Single source of truth for back navigation.
 *
 * Parent fallback map — used when there is no in-app history to go back to
 * (deep link, refresh, shared link, new tab). Order matters: most specific
 * patterns first.
 */
export function getParentPath(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean);

  // DM thread /dm/[id] -> Messages list
  if (seg[0] === "dm" && seg[1]) return "/messages";
  // Messages list -> Home
  if (seg[0] === "messages") return "/home";

  // Item/detail /c/[community]/[asset]/[item] -> its asset page
  if (seg[0] === "c" && seg[1] && seg[2] && seg[3]) return `/c/${seg[1]}/${seg[2]}`;
  // Asset page /c/[community]/[asset] -> community assets page
  if (seg[0] === "c" && seg[1] && seg[2]) return `/c/${seg[1]}`;
  // Community assets page -> Home (Explore if opened from Explore is handled by history)
  if (seg[0] === "c" && seg[1]) return "/home";

  // Profile of another user -> the screen it was opened from, fallback Home
  if (seg[0] === "u" && seg[1]) return "/home";

  // Settings subpages -> Settings; Settings -> previous, fallback Home
  if (seg[0] === "settings" && seg[1]) return "/settings";
  if (seg[0] === "settings") return "/home";

  return "/home";
}

// ─── In-app history tracking (session counter, not document.referrer) ───────
const COUNT_KEY = "square:navCount";

function readCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(sessionStorage.getItem(COUNT_KEY) || "0") || 0;
  } catch {
    return 0;
  }
}

/** Call on every completed in-app navigation (push/replace). */
export function markNavigation(): void {
  if (typeof window === "undefined") return;
  try {
    const next = readCount() + 1;
    sessionStorage.setItem(COUNT_KEY, String(next));
  } catch {}
}

/** True when the user arrived from inside the app (safe to router.back()). */
export function canGoBack(): boolean {
  if (typeof window === "undefined") return false;
  // A reload/refresh is not in-app history even if the counter survived.
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (nav && nav.type === "reload") return false;
  return readCount() > 1;
}

/**
 * Shared back hook. Goes back one step when there is in-app history (restoring
 * the exact previous screen, scroll, filters, tab, drafts); otherwise pushes the
 * screen's logical parent from the fallback map.
 */
export function useBack(fallback?: string) {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (event?: { preventDefault?: () => void }) => {
      event?.preventDefault?.();
      if (canGoBack()) {
        router.back();
      } else {
        router.push(fallback ?? getParentPath(pathname));
      }
    },
    [router, pathname, fallback],
  );
}

/** Map of top-level tabs that never show a back arrow. */
export const TOP_LEVEL_TABS = ["/home", "/explore", "/messages", "/settings/profile"] as const;

export function isTopLevelTab(pathname: string): boolean {
  return (TOP_LEVEL_TABS as readonly string[]).includes(pathname);
}

/** Active top-level tab for nav highlighting (DM thread highlights Messages). */
export function activeTopLevelTab(pathname: string): "home" | "explore" | "messages" | "profile" {
  if (pathname.startsWith("/dm") || pathname === "/messages") return "messages";
  if (pathname.startsWith("/explore") || pathname.startsWith("/channels")) return "explore";
  if (pathname.startsWith("/u/") || pathname.startsWith("/settings")) return "profile";
  return "home";
}