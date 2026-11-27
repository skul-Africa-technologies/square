import { ClientApiError } from "./errors";

export const DEFAULT_TIMEOUT_MS = 10_000;

function timeoutError(ms: number): ClientApiError {
  return new ClientApiError({ code: "timeout", message: `Request timed out after ${Math.round(ms / 1000)}s` });
}

/**
 * Wrap an API client so every promise-returning method rejects with a clear
 * ClientApiError after `ms`, instead of hanging forever. Non-promise methods
 * (e.g. subscribeReactionEvents, which returns an unsubscribe function) are
 * passed through unchanged.
 */
export function withTimeout<T extends object>(client: T, ms = DEFAULT_TIMEOUT_MS): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(client)) {
    if (typeof value !== "function") {
      out[key] = value;
      continue;
    }
    out[key] = (...args: unknown[]) => {
      const result = (value as (...a: unknown[]) => unknown)(...args);
      if (result && typeof (result as PromiseLike<unknown>).then === "function") {
        let timer: ReturnType<typeof setTimeout>;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(timeoutError(ms)), ms);
        });
        return Promise.race([result as Promise<unknown>, timeout]).finally(() => clearTimeout(timer));
      }
      return result;
    };
  }
  return out as T;
}