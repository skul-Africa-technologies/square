"use client";

import { useEffect, useState } from "react";
import { appConfig } from "@/lib/config";

/**
 * When the real backend is selected but unreachable, show a small banner so the
 * app never spins forever with no explanation. The API URL is shown in dev only.
 */
export function ServerBanner() {
  const [down, setDown] = useState(false);

  useEffect(() => {
    if (appConfig.useMock) return;
    let cancelled = false;
    const check = () => {
      fetch(`${appConfig.apiUrl}/health`, { credentials: "include", cache: "no-store" })
        .then(() => { if (!cancelled) setDown(false); })
        .catch(() => { if (!cancelled) setDown(true); });
    };
    check();
    const id = window.setInterval(check, 15_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  if (!down) return null;
  const showUrl = process.env.NODE_ENV === "development" && appConfig.apiUrl;
  return (
    <div
      role="status"
      className="fixed bottom-2 left-1/2 z-[100] -translate-x-1/2 rounded-lg border border-red-500/40 bg-red-950/90 px-3 py-1.5 text-xs text-red-200"
    >
      Cannot reach the server{showUrl ? ` (${appConfig.apiUrl})` : ""}
    </div>
  );
}