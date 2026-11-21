"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/lib/api";
import { establishMockSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateUsername, toDisplayUsername } from "@square/shared";
import type { School } from "@square/shared";
import { appConfig } from "@/lib/config";
import { copy } from "@/lib/copy";

const emailSchema = z.object({ email: z.string().email("Enter a valid email") });
const AUTH_ERROR = "We couldn't complete that request. Please try again.";

export function LoginFlow() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const router = useRouter();

  async function completeAuth(token?: string) {
    // Session tokens only in httpOnly Secure cookies (server-set). In mock mode we establish a server cookie;
    // real mode must rely on backend-set httpOnly cookie on auth responses.
    if (appConfig.useMock) await establishMockSession();
    void token;
    router.push("/home");
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex relative flex-col justify-end p-10 bg-bg-2 border-r overflow-hidden">
        <Image src="/hero-mascot.jpg" alt="Square mascot" fill className="object-cover opacity-80" priority sizes="50vw" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
        <div className="relative z-10 max-w-md">
          <div className="flex items-center gap-2 mb-6">
            <Image src="/logo-mark.png" alt="Square" width={36} height={36} className="rounded-lg" />
            <span className="font-heading font-semibold text-xl">Square</span>
          </div>
          <h1 className="font-heading text-4xl font-semibold leading-tight">{copy.login.heroTitle}</h1>
          <p className="mt-3 text-muted">{copy.login.heroSubtitle}</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Image src="/logo-mark.png" alt="Square" width={32} height={32} className="rounded-lg" />
              <span className="font-heading font-semibold text-lg">Square</span>
            </div>
            <h1 className="font-heading text-3xl font-semibold">{copy.login.heroTitle}</h1>
            <p className="mt-2 text-muted text-sm">{copy.login.heroSubtitle}</p>
          </div>
          {step === 1 && <EmailStep onSent={(e) => { setEmail(e); setStep(2); }} />}
          {step === 2 && <CodeStep email={email} onVerified={(res) => { if (res.hasAccount) { void completeAuth(res.token); } else { setStep(3); } }} onBack={() => setStep(1)} />}
          {step === 3 && <DetailsStep onDone={(tok) => { void completeAuth(tok); }} />}
        </div>
      </div>
    </div>
  );
}

function EmailStep({ onSent }: { onSent: (email: string, retryAfter?: number) => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ email: string }>({ resolver: zodResolver(emailSchema) });
  const [err, setErr] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (cooldown <= 0) return; const t = setInterval(() => setCooldown(c => c - 1), 1000); return () => clearInterval(t); }, [cooldown]);
  return (
    <form className="space-y-4" onSubmit={handleSubmit(async (v) => {
      setErr(null);
      try {
        const res = await api.requestCode(v.email);
        const retry = typeof res.retryAfter === "number" ? res.retryAfter : 0;
        if (retry > 0) setCooldown(retry);
        onSent(v.email, retry);
      } catch { setErr(AUTH_ERROR); }
    })}>
      <div>
        <h2 className="font-heading text-2xl font-semibold">{copy.login.welcome}</h2>
        <p className="text-muted text-sm mt-1">Sign in or create an account with your email.</p>
      </div>
      <div>
        <label className="text-sm mb-1 block">Email</label>
        <Input type="email" placeholder="you@school.edu" autoComplete="email" {...register("email")} error={errors.email?.message} />
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting || cooldown > 0}>{isSubmitting ? "Sending..." : cooldown > 0 ? `Send code in ${cooldown}s` : "Send code"}</Button>
      {err && <p className="text-sm text-red-400" role="alert">{err}</p>}
      <p className="text-xs text-muted">No wallet needed. Add one later.</p>
    </form>
  );
}

function CodeStep({ email, onVerified, onBack }: { email: string; onVerified: (res: { hasAccount: boolean; token?: string }) => void; onBack: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  useEffect(() => { if (cooldown <= 0) return; const t = setInterval(() => setCooldown(c => c - 1), 1000); return () => clearInterval(t); }, [cooldown]);
  const code = digits.join("");
  const setAt = (i: number, val: string) => {
    const v = val.replace(/\D/g, "").slice(-1);
    const next = [...digits]; next[i] = v; setDigits(next);
    if (v && i < 5) refs.current[i + 1]?.focus();
  };
  const onPaste = (e: React.ClipboardEvent) => {
    const t = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (t.length) { e.preventDefault(); const next = Array(6).fill(""); t.split("").forEach((c, i) => next[i] = c); setDigits(next); refs.current[Math.min(t.length, 5)]?.focus(); }
  };
  const verify = async () => {
    setErr(null); setLoading(true);
    try { const res = await api.verifyCode(email, code); onVerified(res); }
    catch { setErr(AUTH_ERROR); }
    finally { setLoading(false); }
  };
  const resend = async () => {
    if (cooldown > 0 || loading) return;
    setErr(null); setLoading(true);
    try {
      const res = await api.requestCode(email);
      const retry = typeof res.retryAfter === "number" ? res.retryAfter : 60;
      setCooldown(Math.max(1, retry));
    } catch { setErr(AUTH_ERROR); }
    finally { setLoading(false); }
  };
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-2xl font-semibold">Enter code</h2>
        <p className="text-muted text-sm mt-1">We sent a 6-digit code to {email}</p>
      </div>
      <div className="flex gap-2" onPaste={onPaste}>
        {digits.map((d, i) => (
          <input key={i} ref={el => { refs.current[i] = el; }} value={d} onChange={e => setAt(i, e.target.value)}
            onKeyDown={e => { if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus(); }}
            inputMode="numeric" aria-label={`Digit ${i + 1}`} maxLength={1} autoComplete="one-time-code"
            className="h-12 w-12 rounded-lg border bg-bg-2 text-center text-lg focus:border-blue-strong focus:outline-none" />
        ))}
      </div>
      {err && <p className="text-sm text-red-400" role="alert">{err}</p>}
      <Button onClick={verify} className="w-full" disabled={code.length !== 6 || loading}>{loading ? "Verifying..." : "Verify"}</Button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onBack} className="text-muted hover:text-text" disabled={loading}>Change email</button>
        <button type="button" onClick={resend} disabled={cooldown > 0 || loading} className="text-muted hover:text-text disabled:opacity-50">{cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}</button>
      </div>
    </div>
  );
}

function DetailsStep({ onDone }: { onDone: (token?: string) => void }) {
  const [username, setUsername] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [schoolQ, setSchoolQ] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [showSchools, setShowSchools] = useState(false);
  const [dob, setDob] = useState("");
  const [avail, setAvail] = useState<"idle" | "checking" | "free" | "taken" | "invalid">("idle");
  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => { let on = true; api.listSchools(schoolQ).then(r => { if (on) setSchools(r); }).catch(() => { }); return () => { on = false; }; }, [schoolQ]);
  useEffect(() => {
    if (!username) { setAvail("idle"); setMsg(""); return; }
    const v = validateUsername(username);
    if (!v.ok) { setAvail("invalid"); setMsg(v.reason); return; }
    setAvail("checking"); setMsg("Checking...");
    const t = setTimeout(async () => {
      try { const r = await api.usernameAvailable(v.stored); setAvail(r.available ? "free" : "taken"); setMsg(r.available ? `${toDisplayUsername(v.stored)} is free` : `${toDisplayUsername(v.stored)} is taken`); }
      catch { setAvail("idle"); setMsg(""); }
    }, 400);
    return () => clearTimeout(t);
  }, [username]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    const v = validateUsername(username);
    if (!v.ok) { setErr(v.reason); return; }
    if (avail !== "free") { setErr("Choose an available username"); return; }
    if (!schoolId) { setErr("Select your school"); return; }
    if (!dob) { setErr("Date of birth is required"); return; }
    setLoading(true);
    try { const res = await api.signup({ emailToken: "opaque", username: v.stored, schoolId, dob }); onDone(res.token); }
    catch { setErr(AUTH_ERROR); }
    finally { setLoading(false); }
  };
  return (
    <form className="space-y-4" onSubmit={submit}>
      <div>
        <p className="text-xs text-lime mb-1">Step 3 of 3 · New here</p>
        <h2 className="font-heading text-2xl font-semibold">Set up your profile</h2>
      </div>
      <div>
        <label className="text-sm mb-1 block">Username</label>
        <div className="flex items-center rounded-lg border bg-bg-2 px-3 focus-within:border-blue-strong">
          <span className="text-muted mr-1">#</span>
          <input value={username.replace(/^#/, "")} onChange={e => setUsername(e.target.value)} className="w-full bg-transparent py-2.5 text-sm outline-none" placeholder="your-name" aria-label="Username" autoComplete="username" />
        </div>
        {msg && <p className={`mt-1 text-xs ${avail === "free" ? "text-lime" : avail === "taken" || avail === "invalid" ? "text-red-400" : "text-muted"}`}>{msg}</p>}
      </div>
      <div className="relative">
        <label className="text-sm mb-1 block">School</label>
        <Input value={schoolQ} onChange={e => { setSchoolQ(e.target.value); setShowSchools(true); }} onFocus={() => setShowSchools(true)} placeholder="Search your school" aria-label="School" autoComplete="organization" />
        {showSchools && schools.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border bg-surface max-h-48 overflow-auto">
            {schools.map(s => (
              <button type="button" key={s.id} className="w-full text-left px-3 py-2 text-sm hover:bg-surface-hi" onClick={() => { setSchoolId(s.id); setSchoolQ(s.name); setShowSchools(false); }}>{s.name}</button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="text-sm mb-1 block">Date of birth <span className="text-muted">(private)</span></label>
        <Input type="date" value={dob} onChange={e => setDob(e.target.value)} aria-label="Date of birth" />
      </div>
      {err && <p className="text-sm text-red-400" role="alert">{err}</p>}
      <Button type="submit" className="w-full" disabled={loading || avail === "checking"}>{loading ? "Creating..." : "Continue"}</Button>
    </form>
  );
}
