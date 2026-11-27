"use client";

import { Button } from "./button";

/**
 * Consistent error state for data sections. Replaces endless skeletons/spinners
 * with a short message and a Retry button so a failed request can never hang
 * silently.
 */
export function QueryError({
  message = "Something went wrong loading this.",
  onRetry,
  className = "",
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-start gap-2 rounded-lg border border-border bg-surface p-3 text-sm ${className}`} role="alert">
      <p className="text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} aria-label="Retry">
          Retry
        </Button>
      )}
    </div>
  );
}