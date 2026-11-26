"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Inbox, Mail } from "lucide-react";

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function VerificationEmail({ code, email }: { code: string; email: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const onCopy = useCallback(async () => {
    const ok = await copyText(code);
    if (!ok) return;
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1600);
  }, [code]);

  return (
    <section
      aria-label="Verification email inbox"
      className="overflow-hidden rounded-xl border bg-surface shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
    >
      <header className="flex items-center gap-2 border-b border-border bg-bg-2 px-3 py-2 text-xs text-muted">
        <Inbox className="h-3.5 w-3.5 text-lime" aria-hidden />
        <span className="font-medium uppercase tracking-[0.06em]">Inbox</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-lime-tint px-2 py-0.5 text-[11px] text-lime">
          <Mail className="h-3 w-3" aria-hidden /> New
        </span>
      </header>

      <div className="flex items-start gap-3 p-4">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-lime font-heading text-base font-bold text-bg">
          S
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-sm font-medium text-text">Square</p>
            <p className="truncate text-xs text-muted">&lt;auth@square.app&gt;</p>
            <p className="ml-auto shrink-0 text-[11px] text-muted">now</p>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">to {email}</p>
        </div>
      </div>

      <div className="px-4 pb-4">
        <h3 className="font-heading text-base font-semibold text-text">Your Square sign-in code</h3>
        <p className="mt-1 text-sm text-muted">
          Use this code to finish {email ? "signing in" : "verifying your email"}. It expires in 10 minutes.
        </p>

        <div className="mt-3 flex items-center gap-2 rounded-lg border bg-bg-2 p-2 pl-3">
          <code className="flex-1 select-all font-heading text-2xl font-semibold tracking-[0.3em] text-lime">
            {code}
          </code>
          <button
            type="button"
            onClick={onCopy}
            aria-label={copied ? "Code copied" : "Copy code"}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-xs font-medium text-text transition-colors hover:border-blue-strong hover:text-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)]"
          >
            {copied ? <Check className="h-4 w-4 text-lime" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted">Tap Copy, then paste into the code fields above.</p>
      </div>
    </section>
  );
}