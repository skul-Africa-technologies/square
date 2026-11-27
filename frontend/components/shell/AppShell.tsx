"use client";

import { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CommunityStrip } from "./CommunityStrip";
import { MobileShell } from "./MobileShell";
import { AppSidebar } from "./AppSidebar";
import { MessagesPanel } from "@/features/dm/MessagesPanel";
import { MobileHub } from "@/features/dm/MobileHub";
import { MobileHomeHub } from "@/features/home/MobileHomeHub";
import { ServerBanner } from "./ServerBanner";
import { markNavigation } from "@/lib/navigation";
import { useEffect, useRef, useState } from "react";

export function AppShell({ children, rightRail }: { children: ReactNode; rightRail?: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const isHub = pathname === "/home" || pathname === "/dm" || pathname === "/messages" || pathname === "/inbox";
  const isProfileView = /^\/u\/[^/]+$/.test(pathname);
  const showMessagesPanel = pathname === "/home" || pathname === "/messages" || pathname.startsWith("/dm") || isProfileView;
  const [isMobile, setIsMobile] = useState(false);
  const [toast, setToast] = useState("");
  const [profileBanner, setProfileBanner] = useState("");
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (pathname === "/home" && params.get("toast") === "account-exists") {
      setToast("You already have an account. We signed you in.");
      router.replace("/home");
      const timer = window.setTimeout(() => setToast(""), 4000);
      return () => window.clearTimeout(timer);
    }
    if (pathname === "/settings/profile" && params.get("banner") === "profile-incomplete") {
      setProfileBanner("Your profile is missing required information. Please complete it here.");
      router.replace("/settings/profile");
    }
  }, [pathname, router]);

  // Track in-app navigation for the shared back mechanism.
  useEffect(() => {
    markNavigation();
  }, [pathname]);

  const scrollPositionsRef = useRef<Map<string, number>>(new Map());
  const isBackNavigation = useRef(false);
  const lastPathnameRef = useRef(pathname);

  useEffect(() => {
    const handlePopState = () => {
      isBackNavigation.current = true;
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (pathname !== lastPathnameRef.current) {
      if (!isBackNavigation.current) {
        const mainContent = document.querySelector(".main-content");
        if (mainContent) {
          scrollPositionsRef.current.set(lastPathnameRef.current, (mainContent as HTMLElement).scrollTop);
        }
        setTimeout(() => {
          const newMainContent = document.querySelector(".main-content");
          if (newMainContent) {
            (newMainContent as HTMLElement).scrollTop = 0;
          }
        }, 0);
      } else {
        const savedPosition = scrollPositionsRef.current.get(pathname);
        if (savedPosition !== undefined) {
          setTimeout(() => {
            const mainContent = document.querySelector(".main-content");
            if (mainContent) {
              (mainContent as HTMLElement).scrollTop = savedPosition;
            }
          }, 0);
        }
        isBackNavigation.current = false;
      }
      lastPathnameRef.current = pathname;
    }
  }, [pathname]);

  return (
    <div className="bg-bg text-text" suppressHydrationWarning>
      <ServerBanner />
      {toast && <div role="status" aria-live="polite" className="fixed left-1/2 top-4 z-[100] -translate-x-1/2 rounded-lg border border-lime/40 bg-surface px-4 py-3 text-sm shadow-xl">{toast}</div>}
      {profileBanner && <div role="status" aria-live="polite" className="fixed left-1/2 top-4 z-[100] -translate-x-1/2 rounded-lg border border-lime/40 bg-surface px-4 py-3 text-sm shadow-xl">{profileBanner}</div>}
      {!isMobile ? (
        <div className={`shell-grid ${rightRail ? "with-right-rail" : ""}`}>
          <div className="strip-fixed">
            <CommunityStrip />
          </div>
          <div className="left-panel-fixed">
            {showMessagesPanel ? <MessagesPanel /> : <AppSidebar />}
          </div>
          <main className="main-area min-w-0 min-h-0">
            <div className="main-content min-h-0 min-w-0">{children}</div>
          </main>
          {rightRail ? <aside className="right-rail h-[100dvh] overflow-y-auto border-l bg-bg-2 p-4">{rightRail}</aside> : null}
        </div>
      ) : (
        <MobileShell>
          {pathname === "/home" ? <MobileHomeHub /> : isHub ? <MobileHub /> : children}
        </MobileShell>
      )}
    </div>
  );
}
