# Email Redesign — Logic Changes

Only the **appearance** of transactional emails changed. Sending logic, subjects,
recipients, code generation/hashing/expiry, resend/rate-limit rules, provider
(Resend), env vars, and template inputs are unchanged. The only additive changes:

| File | What changed | Why |
|---|---|---|
| `backend/kernel/src/config.ts` | Added optional `ASSET_BASE_URL` env var. | Email images must be loaded from absolute HTTPS URLs; no prior public-base-URL var existed. Optional; falls back to `http://localhost:3000`. |
| `backend/gateway/src/emails/verification-code.ts` | New file: `codeCells()` helper + `verificationEmailHtml()` + `verificationEmailText()`. | Renders the redesigned HTML and plain-text verification email. `codeCells` splits a 6-digit code into six boxes; non-6-digit input falls back to one box (code value untouched). |
| `backend/gateway/src/identity.controller.ts` | `sendVerificationCode` now also passes `html` to Resend (built from the new template). `text`, `subject`, `from`, `to` unchanged. | Adds the HTML part while keeping the existing plain-text part. No change to when/who/how codes are sent. |
| `frontend/public/email/square-logo.png`, `frontend/public/email/robot-verify.png` | New PNG assets (108×120, 216×216; <30 KB each). | Email clients block SVG/data-URIs; PNGs at absolute URLs are required. |
| `scripts/preview-email.ts` | New dev-only script rendering sample HTML/text to `scripts/preview/`. | Local preview only; no runtime route. |
| `.env.example`, `backend/.env.example` | Documented `ASSET_BASE_URL`. | New optional var. |

## Remove in-page code preview (security hardening)

The verification code must never be shown in the UI or returned by any API in any
non-development environment. Changes:

| File | What changed | Why |
|---|---|---|
| `frontend/features/auth/VerificationEmail.tsx` | **Deleted.** | Removed the fake "inbox" card that displayed the real code with a Copy button. |
| `frontend/features/auth/LoginFlow.tsx` | Removed the `VerificationEmail` import/render and the `demoCode` state. The verify screen now shows only the heading, "We sent a 6-digit code to <email>", the six boxes, Verify, "Use a different email" and the resend timer. | Code is no longer rendered in the UI. |
| `backend/kernel/src/config.ts` | Added `DEV_EXPOSE_AUTH_CODE` flag (default `false`); config validation rejects it when `NODE_ENV=production`. | Opt-in gate for ever logging the code; safe by default. |
| `backend/gateway/src/identity.controller.ts` | `sendVerificationCode` only logs the code when `DEV_EXPOSE_AUTH_CODE=true` (dev/test). Never logs in production. The HTTP response is unchanged (`{ ok: true }`) and never contains the code. | Prevents code exposure via logs/UI/API. |
| `backend/gateway/test/identity.controller.test.ts` | Added a test proving the request-code response contains no 6-digit code while the email does; enabled the flag in the two log-asserting tests. | Regression coverage. |
| `.env.example`, `backend/.env.example` | Documented `DEV_EXPOSE_AUTH_CODE`. | New opt-in var. |

Code generation, hashing, expiry, resend timer, rate limits, routes and validation
are unchanged. Production already fails fast at startup if Resend is not configured
(`config.ts`), so the real email is always sent through the provider.

No other behaviour changed.