"use client";

import { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CommunityStrip } from "./CommunityStrip";
import { AppSidebar } from "./AppSidebar";
import { MessagesPanel } from "@/features/dm/MessagesPanel";
import { MobileHub } from "@/features/dm/MobileHub";
import { MobileHomeHub } from "@/features/home/MobileHomeHub";
import { useEffect, useRef, useState } from "react";

export function AppShell({ children, rightRail }: { children: ReactNode; rightRail?: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

const isHub = pathname === "/home" || pathname === "/dm" || pathname === "/inbox";
const isConversation = /^\/dm\/[^/]+$/.test(pathname);
const isAssetView = /^\/c\/[^/]+\/[^/]+$/.test(pathname);
const isProfileView = /^\/u\/[^/]+$/.test(pathname);
const showMessagesPanel = pathname === "/home" || pathname.startsWith("/dm") || isProfileView;
const fullScreenMobile = isConversation || isAssetView || isProfileView;

const [isMobile, setIsMobile] = useState(false);
useEffect(() => {
  const check = () => setIsMobile(window.innerWidth < 768);
  check();
  window.addEventListener("resize", check);
  return () => window.removeEventListener("resize", check);
}, []);

  // Track scroll position for back navigation
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
    <div className="bg-bg text-text">
      {/* Desktop shell */}
      <div className={`shell-grid ${rightRail ? "with-right-rail" : ""}`}>
        {/* Community Strip - fixed, only icons scroll */}
        <div className="strip-fixed">
          <CommunityStrip />
        </div>

        {/* Left Panel - fixed header/search/user, only content scrolls */}
        <div className="left-panel-fixed">
          {showMessagesPanel ? <MessagesPanel /> : <AppSidebar />}
        </div>

        {/* Main Area - fixed header bar, only content scrolls */}
        <main className="main-area min-w-0 min-h-0">
          <div className="main-content min-h-0 min-w-0">{!isMobile && children}</div>
        </main>

        {/* Right Rail - only shows on xl+ when provided */}
        {rightRail ? <aside className="right-rail h-[100dvh] overflow-y-auto border-l bg-bg-2 p-4">{rightRail}</aside> : null}
      </div>

      {/* Mobile shell */}
      <div className="mobile-shell">
        {fullScreenMobile ? (
          <div className="min-h-[100dvh] bg-bg-2 flex flex-col">
            <div className="sticky top-0 z-30 flex items-center gap-1 border-b bg-bg-2/95 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur">
              <button type="button" onClick={() => router.back()} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
              </button>
              <span className="text-sm text-muted">{isConversation ? "Conversation" : "Asset"}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">{isMobile && children}</div>
          </div>
        ) : (
          <div className="flex h-[100dvh] overflow-hidden">
            <div className="mobile-strip">
              <CommunityStrip />
            </div>
            <div className="mobile-sheet flex-1 min-w-0 overflow-hidden flex-col">
              {/* Sheet content scrolls; header and user bar (rendered by page) stick top/bottom */}
              <div className="mobile-sheet-content flex-1 min-h-0 overflow-y-auto">
                {pathname === "/home" ? <MobileHomeHub /> : isHub ? <MobileHub /> : children}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
