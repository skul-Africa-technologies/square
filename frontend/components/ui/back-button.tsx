"use client";

import { useBack } from "@/lib/navigation";

/**
 * One back arrow for every screen. Uses in-app history when available, else the
 * screen's logical parent from the fallback map.
 */
export function BackButton({
  fallback,
  className = "",
  label = "Back",
}: {
  fallback?: string;
  className?: string;
  label?: string;
}) {
  const back = useBack(fallback);
  return (
    <button
      type="button"
      onClick={back}
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text ${className}`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m14 6-6 6 6 6" />
      </svg>
    </button>
  );
}