import { z } from "zod";
import { USERNAME_RULES, validateUsername } from "./username";

export const usernameSchema = z.string().superRefine((v, ctx) => {
  const r = validateUsername(v);
  if (!r.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.reason });
});

export const emailSchema = z.string().email("Enter a valid email");
export const codeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code");
export const dobSchema = z.string().min(1, "Date of birth is required");
