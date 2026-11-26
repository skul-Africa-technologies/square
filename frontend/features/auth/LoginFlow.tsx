"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/lib/api";
import { establishMockSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateUsername, toDisplayUsername } from "@square/shared";
import type { AuthUser, AuthVerifyCodeResponse, School } from "@square/shared";
import { appConfig } from "@/lib/config";
import { copy } from "@/lib/copy";
import { ClientApiError } from "@/lib/api/errors";
import { VerificationEmail } from "./VerificationEmail";

type Mode = "login" | "signup";
type Step = "email" | "code" | "no-account" | "setup";
type FlowState = { mode: Mode; email: string; ticket?: string; ticketExpiresAt?: number };
const FLOW_KEY = "square.auth-flow.v1";
const LAST_EMAIL_KEY = "square.last-login-email.v1";
const emailSchema = z.object({ email: z.string().email("Enter a valid email") });
const GENERIC_ERROR = "We couldn't complete that request. Please try again.";

function readFlow(): FlowState | null {
  try {
    const raw = sessionStorage.getItem(FLOW_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as FlowState;
    return value && (value.mode === "login" || value.mode === "signup") && typeof value.email === "string" ? value : null;
  } catch {
    return null;
  }
}

function saveFlow(flow: FlowState | null) {
  try {
    if (flow) sessionStorage.setItem(FLOW_KEY, JSON.stringify(flow));
    else sessionStorage.removeItem(FLOW_KEY);
  } catch {
    // The current page can complete the flow even when session storage is disabled.
  }
}

function errorMessage(error: unknown): string {
  const code = error instanceof ClientApiError ? error.code.toUpperCase() : "";
  if (code === "CODE_EXPIRED" || code === "CODE_INVALID" || code === "INVALID_CODE" || code === "INVALID") return "That code is wrong or expired. Try again.";
  if (code === "TOO_MANY_ATTEMPTS") return "Too many attempts. Request a new code.";
  if (code === "RESEND_TOO_SOON" || code === "RATE_LIMITED") return "Please wait before requesting another code.";
  if (code === "TICKET_EXPIRED" || code === "SIGNUP_TICKET_INVALID") return "Start again to verify your email.";
  if (code === "USERNAME_TAKEN") return "That username is already taken.";
  if (code === "INVALID_USERNAME") return "Choose a valid username.";
  if (code === "AGE_NOT_ALLOWED" || code === "INVALID_SIGNUP") return "You can't create an account with those details.";
  return GENERIC_ERROR;
}

function isAllowedAge(value: string) {
  const birth = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || birth > new Date()) return false;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 16);
  return birth <= cutoff;
}

export function LoginFlow({ mode = "login", initialStep = "email" }: { mode?: Mode; initialStep?: Step }) {
  const [step, setStep] = useState<Step>(initialStep);
  const [flow, setFlow] = useState<FlowState>({ mode, email: "" });
  const [toast, setToast] = useState("");
  const router = useRouter();

  useEffect(() => {
    const stored = readFlow();
    if (initialStep === "setup") {
      if (!stored?.ticket || stored.mode !== "signup" || !stored.ticketExpiresAt || stored.ticketExpiresAt <= Date.now()) {
        saveFlow(null);
        router.replace("/signup?message=start-again");
        return;
      }
      setFlow(stored);
      setStep("setup");
    } else if (stored?.mode === mode) {
      setFlow(stored);
      setStep(stored.ticket ? "no-account" : stored.email ? "code" : "email");
    } else if (mode === "login") {
      try {
        const lastEmail = localStorage.getItem(LAST_EMAIL_KEY);
        if (lastEmail) setFlow({ mode, email: "" });
      } catch {
        // Login remains available when local storage is disabled.
      }
    }

    const message = new URLSearchParams(window.location.search).get("message");
    if (message === "start-again") setToast("Start again to verify your email");
  }, [initialStep, mode, router]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const updateFlow = (next: FlowState | null) => {
    setFlow(next || { mode, email: "" });
    saveFlow(next);
  };

  const finishSignIn = useCallback(async (user?: AuthUser, accountExistsToast = false) => {
    if (appConfig.useMock) {
      if (!user) throw new Error("Mock authentication response did not include a user");
      await establishMockSession(user.id);
    }
    saveFlow(null);
    let destination = "/home";
    if (accountExistsToast) {
      destination = "/home?toast=account-exists";
    } else if (mode === "login") {
      try {
        const next = new URLSearchParams(window.location.search).get("next");
        if (next?.startsWith("/") && !next.startsWith("//") && !next.includes("\\")) {
          const parsed = new URL(next, window.location.origin);
          if (parsed.origin === window.location.origin) destination = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
      } catch {
        destination = "/home";
      }
    }
    router.replace(destination);
  }, [mode, router]);

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-end overflow-hidden border-r bg-bg-2 p-10 lg:flex">
        <Image src="/hero-mascot.jpg" alt="Square mascot" fill className="object-cover opacity-80" priority sizes="50vw" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
        <div className="relative z-10 max-w-md">
          <div className="mb-6 flex items-center gap-2">
            <Image src="/logo-mark.png" alt="Square" width={36} height={36} className="rounded-lg" />
            <span className="font-heading text-xl font-semibold">Square</span>
          </div>
          <h1 className="font-heading text-4xl font-semibold leading-tight">{copy.login.heroTitle}</h1>
          <p className="mt-3 text-muted">{copy.login.heroSubtitle}</p>
        </div>
      </div>
      <div className="flex min-h-screen items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="mb-4 flex items-center gap-2">
              <Image src="/logo-mark.png" alt="Square" width={32} height={32} className="rounded-lg" />
              <span className="font-heading text-lg font-semibold">Square</span>
            </div>
            <h1 className="font-heading text-3xl font-semibold">{copy.login.heroTitle}</h1>
            <p className="mt-2 text-sm text-muted">{copy.login.heroSubtitle}</p>
          </div>
          {toast && <p className="mb-4 rounded-lg border border-lime/40 bg-surface px-3 py-2 text-sm" role="status">{toast}</p>}
          {step === "email" && (
            <EmailStep mode={mode} initialEmail={flow.email} onSent={(email) => {
              const next = { mode, email };
              updateFlow(next);
              if (mode === "login") {
                try { localStorage.setItem(LAST_EMAIL_KEY, email); } catch { /* Optional convenience only. */ }
              }
              setStep("code");
            }} />
          )}
          {step === "code" && flow.email && (
            <CodeStep mode={mode} email={flow.email} onChangeEmail={() => { updateFlow(null); setStep("email"); }}
              onVerified={async (result) => {
                if (!result.isNewUser) {
                  await finishSignIn(result.user, mode === "signup");
                  return;
                }
                if (!result.signupTicket) throw new Error("Signup verification response did not include a ticket");
                const next: FlowState = { mode, email: flow.email, ticket: result.signupTicket, ticketExpiresAt: Date.now() + 15 * 60 * 1000 };
                updateFlow(next);
                if (mode === "login") setStep("no-account");
                else router.replace("/signup/setup");
              }} />
          )}
          {step === "no-account" && (
            <section className="space-y-4" aria-live="polite">
              <div>
                <h2 className="font-heading text-2xl font-semibold">No account for this email yet</h2>
                <p className="mt-1 text-sm text-muted">Create an account to join your campus on Square.</p>
              </div>
              <Button className="min-h-11 w-full" onClick={() => {
                if (!flow.ticket || (flow.ticketExpiresAt || 0) <= Date.now()) {
                  updateFlow(null);
                  setToast("Start again to verify your email");
                  setStep("email");
                  return;
                }
                const next = { ...flow, mode: "signup" as const };
                updateFlow(next);
                router.push("/signup/setup");
              }}>Create account</Button>
              <button type="button" className="min-h-11 w-full text-sm text-muted hover:text-text" onClick={() => { updateFlow(null); setStep("email"); }}>Use a different email</button>
            </section>
          )}
          {step === "setup" && flow.ticket && (
            <SetupStep ticket={flow.ticket} onDone={async (userId) => {
              try {
                if (appConfig.useMock) await establishMockSession(userId);
                saveFlow(null);
                router.replace("/home");
              } catch {
                setToast(GENERIC_ERROR);
              }
            }} onExpired={() => {
              saveFlow(null);
              router.replace("/signup?message=start-again");
            }} />
          )}
          {step === "email" && (
            <p className="mt-6 text-center text-sm text-muted">
              {mode === "login" ? <>New to Square? <Link href="/signup" className="text-text underline">Sign up</Link></> : <>Already have an account? <Link href="/login" className="text-text underline">Log in</Link></>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function EmailStep({ mode, initialEmail, onSent }: { mode: Mode; initialEmail: string; onSent: (email: string) => void }) {
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<{ email: string }>({ resolver: zodResolver(emailSchema), defaultValues: { email: initialEmail } });
  const [error, setError] = useState<string | null>(null);
  const [lastEmail, setLastEmail] = useState("");

  useEffect(() => {
    if (mode !== "login" || initialEmail) return;
    try {
      const last = localStorage.getItem(LAST_EMAIL_KEY) || "";
      setLastEmail(last);
      if (last) setValue("email", last);
    } catch { /* Optional convenience only. */ }
  }, [initialEmail, mode, setValue]);

  return (
    <form className="space-y-4" onSubmit={handleSubmit(async ({ email }) => {
      setError(null);
      try {
        await api.requestCode(email);
        onSent(email.trim());
      } catch (reason) { setError(errorMessage(reason)); }
    })}>
      <div>
        <h2 className="font-heading text-2xl font-semibold">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
        <p className="mt-1 text-sm text-muted">{mode === "login" ? "Log in with your email" : "Join your campus on Square"}</p>
      </div>
      <div>
        <label htmlFor="auth-email" className="mb-1 block text-sm">Email</label>
        <Input id="auth-email" type="email" placeholder="you@school.edu" autoComplete="email" autoFocus error={errors.email?.message} {...register("email")} />
        {lastEmail && mode === "login" && (
          <button type="button" className="mt-1 min-h-11 text-xs text-muted underline hover:text-text" onClick={() => { setValue("email", ""); setLastEmail(""); }}>
            Not you?
          </button>
        )}
        {appConfig.useMock && <p className="mt-2 text-xs text-muted">Mock mode: any 6-digit code works; amaka@example.com is an existing account</p>}
      </div>
      <Button type="submit" className="min-h-11 w-full" disabled={isSubmitting}>{isSubmitting ? "Sending..." : "Send code"}</Button>
      {error && <p className="text-sm text-red-400" role="alert" aria-live="polite">{error}</p>}
    </form>
  );
}

function CodeStep({ mode, email, onChangeEmail, onVerified }: {
  mode: Mode;
  email: string;
  onChangeEmail: () => void;
  onVerified: (result: AuthVerifyCodeResponse) => void | Promise<void>;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const [shake, setShake] = useState(false);
  const [demoCode] = useState(() => String(Math.floor(100000 + Math.random() * 900000)));
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const attemptedCode = useRef("");
  const code = digits.join("");

  useEffect(() => { refs.current[0]?.focus(); }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const verify = useCallback(async () => {
    if (loading || code.length !== 6) return;
    setError(null);
    setLoading(true);
    try {
      const result = await api.verifyCode(email, code);
      await onVerified(result);
    } catch (reason) {
      const message = errorMessage(reason);
      setError(message);
      if (message.startsWith("That code")) {
        setDigits(Array(6).fill(""));
        setShake(true);
        window.setTimeout(() => setShake(false), 350);
        refs.current[0]?.focus();
      }
    } finally { setLoading(false);  }
  }, [code, email, loading, onVerified]);

  useEffect(() => {
    if (code.length === 6 && code !== attemptedCode.current) {
      attemptedCode.current = code;
      void verify();
    }
  }, [code, verify]);

  const submit = (event: React.FormEvent) => { event.preventDefault(); void verify(); };
  const paste = (event: React.ClipboardEvent) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    attemptedCode.current = "";
    setDigits(Array.from({ length: 6 }, (_, index) => pasted[index] || ""));
    refs.current[Math.min(pasted.length, 5)]?.focus();
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div>
        <h2 className="font-heading text-2xl font-semibold">{mode === "login" ? "Verify and log in" : "Verify and continue"}</h2>
        <p className="mt-1 text-sm text-muted">We sent a 6-digit code to {email}</p>
      </div>
      {appConfig.useMock && <VerificationEmail code={demoCode} email={email} />}
      <div className={`grid grid-cols-6 gap-1 sm:gap-2 ${shake ? "animate-[auth-shake_.3s_ease-in-out]" : ""}`} onPaste={paste}>
        {digits.map((digit, index) => (
          <input key={index} ref={(element) => { refs.current[index] = element; }} value={digit} onChange={(event) => {
            const value = event.target.value.replace(/\D/g, "").slice(-1);
            attemptedCode.current = "";
            setDigits((current) => current.map((item, position) => position === index ? value : item));
            if (value && index < 5) refs.current[index + 1]?.focus();
          }} onKeyDown={(event) => { if (event.key === "Backspace" && !digits[index] && index > 0) refs.current[index - 1]?.focus(); }}
            inputMode="numeric" aria-label={`Digit ${index + 1}`} maxLength={1} autoComplete={index === 0 ? "one-time-code" : "off"}
            className="h-12 min-w-0 flex-1 rounded-lg border bg-bg-2 text-center text-lg focus:border-blue-strong focus:outline-none" />
        ))}
      </div>
      {error && <p className="text-sm text-red-400" role="alert" aria-live="polite">{error}</p>}
      <Button type="submit" className="min-h-11 w-full" disabled={code.length !== 6 || loading}>{loading ? "Verifying..." : mode === "login" ? "Verify and log in" : "Verify and continue"}</Button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onChangeEmail} className="min-h-11 text-muted hover:text-text" disabled={loading}>Use a different email</button>
        <button type="button" onClick={async () => {
          setError(null);
          try {
            const result = await api.requestCode(email);
            setCooldown(result.retryAfter || 60);
            attemptedCode.current = "";
            setDigits(Array(6).fill(""));
          } catch (reason) { setError(errorMessage(reason)); }
        }} disabled={cooldown > 0 || loading} className="min-h-11 text-muted hover:text-text disabled:opacity-50">
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}

function SetupStep({ ticket, onDone, onExpired }: { ticket: string; onDone: (userId: string) => void; onExpired: () => void }) {
  const [username, setUsername] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [schoolQuery, setSchoolQuery] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [showSchools, setShowSchools] = useState(false);
  const [educationStatus, setEducationStatus] = useState<"student" | "alumni">("student");
  const [dob, setDob] = useState("");
  const [availability, setAvailability] = useState<"idle" | "checking" | "free" | "taken" | "invalid" | "error">("idle");
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ticketCheck = readFlow();
  const completed = useRef(false);

  useEffect(() => {
    if (!completed.current && (!ticketCheck?.ticket || ticketCheck.ticket !== ticket || (ticketCheck.ticketExpiresAt || 0) <= Date.now())) onExpired();
  }, [onExpired, ticket, ticketCheck?.ticket, ticketCheck?.ticketExpiresAt]);

  useEffect(() => {
    if (!ticketCheck?.ticketExpiresAt) return;
    const timer = window.setTimeout(() => { if (!completed.current) onExpired(); }, Math.max(0, ticketCheck.ticketExpiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [onExpired, ticketCheck?.ticketExpiresAt]);

  useEffect(() => {
    const search = schoolQuery.trim();
    if (search.length < 2) {
      setSchools([]);
      setSchoolsLoading(false);
      return;
    }

    let active = true;
    setSchoolsLoading(true);
    const timer = window.setTimeout(() => {
      api.listSchools(search).then((result) => {
        if (active) setSchools(result);
      }).catch(() => {
        if (active) setError("Institutions couldn't be loaded. Please try again.");
      }).finally(() => {
        if (active) setSchoolsLoading(false);
      });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [schoolQuery]);

  useEffect(() => {
    if (!username) { setAvailability("idle"); setAvailabilityMessage(""); return; }
    const valid = validateUsername(username);
    if (!valid.ok) { setAvailability("invalid"); setAvailabilityMessage(valid.reason); return; }
    setAvailability("checking");
    setAvailabilityMessage("Checking availability...");
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.usernameAvailable(valid.stored);
        setAvailability(result.available ? "free" : "taken");
        setAvailabilityMessage(result.available ? `${toDisplayUsername(valid.stored)} is available` : `${toDisplayUsername(valid.stored)} is taken`);
      } catch {
        setAvailability("error");
        setAvailabilityMessage("Couldn't check username availability. Try again.");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [username]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const valid = validateUsername(username);
    if (!valid.ok) { setError(valid.reason); return; }
    if (availability !== "free") { setError(availability === "taken" ? "That username is already taken." : "Choose an available username."); return; }
    if (!schoolId) { setError("Select an institution from the search suggestions."); return; }
    if (!dob || !isAllowedAge(dob)) { setError("You can't create an account with those details."); return; }
    setLoading(true);
    try {
      const result = await api.signup({
        signupTicket: ticket,
        username: valid.stored,
        schoolId,
        educationStatus,
        dateOfBirth: dob,
      });
      completed.current = true;
      await onDone(result.user.id);
    } catch (reason) {
      if (reason instanceof ClientApiError && ["TICKET_EXPIRED", "SIGNUP_TICKET_INVALID"].includes(reason.code.toUpperCase())) onExpired();
      else setError(errorMessage(reason));
    } finally { setLoading(false); }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div>
        <p className="mb-1 text-xs text-lime">Step 3 of 3</p>
        <h2 className="font-heading text-2xl font-semibold">Set up your profile</h2>
      </div>
      <div>
        <label htmlFor="auth-username" className="mb-1 block text-sm">Username</label>
        <div className="flex min-h-11 items-center rounded-lg border bg-bg-2 px-3 focus-within:border-blue-strong">
          <span className="mr-1 text-muted" aria-hidden="true">#</span>
          <input id="auth-username" value={username.replace(/^#/, "")} onChange={(event) => setUsername(event.target.value)} className="w-full bg-transparent py-2.5 text-sm outline-none" placeholder="your-name" autoComplete="username" />
        </div>
        <p className={`mt-1 min-h-4 text-xs ${availability === "free" ? "text-lime" : availability === "taken" || availability === "invalid" || availability === "error" ? "text-red-400" : "text-muted"}`} aria-live="polite">{availabilityMessage}</p>
      </div>
      <div className="relative">
        <label htmlFor="auth-school" className="mb-1 block text-sm">School or institution</label>
        <Input id="auth-school" value={schoolQuery} onChange={(event) => { setSchoolQuery(event.target.value); setSchoolId(""); setShowSchools(true); }} onFocus={() => setShowSchools(true)} placeholder="Type to search institutions" autoComplete="organization" role="combobox" aria-expanded={showSchools} aria-controls="school-options" />
        {showSchools && schools.length > 0 && (
          <div id="school-options" role="listbox" className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border bg-surface">
            {schools.map((school) => <button type="button" role="option" aria-selected={school.id === schoolId} key={school.id} className="min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-surface-hi" onClick={() => { setSchoolId(school.id); setSchoolQuery(school.name); setShowSchools(false); }}>
              <span className="block">{school.name}</span>
              <span className="block text-xs capitalize text-muted">{school.ownership} · {school.institutionType.replaceAll("_", " ")}</span>
            </button>)}
          </div>
        )}
        {showSchools && schoolQuery.trim().length >= 2 && !schoolsLoading && schools.length === 0 && (
          <p className="mt-1 text-xs text-muted" role="status">No matching institutions found.</p>
        )}
        {schoolsLoading && <p className="mt-1 text-xs text-muted" role="status">Searching institutions…</p>}
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm">Education status</legend>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="radio" name="education-status" value="student" checked={educationStatus === "student"} onChange={() => setEducationStatus("student")} />
          Current student
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="radio" name="education-status" value="alumni" checked={educationStatus === "alumni"} onChange={() => setEducationStatus("alumni")} />
          Alumni
        </label>
      </fieldset>
      <div>
        <label htmlFor="auth-dob" className="mb-1 block text-sm">Date of birth <span className="text-muted">(private)</span></label>
        <Input id="auth-dob" type="date" value={dob} onChange={(event) => setDob(event.target.value)} />
      </div>
      {error && <p className="text-sm text-red-400" role="alert" aria-live="polite">{error}</p>}
      <Button type="submit" className="min-h-11 w-full" disabled={loading || availability === "checking"}>{loading ? "Creating account..." : "Create account"}</Button>
    </form>
  );
}
