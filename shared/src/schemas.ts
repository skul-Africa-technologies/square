import { z } from "zod";
import { validateUsername } from "./username";

export const usernameSchema = z.string().superRefine((v, ctx) => {
  const r = validateUsername(v);
  if (!r.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.reason });
});

export const emailSchema = z.string().email("Enter a valid email");
export const codeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code");
export const dobSchema = z.string().min(1, "Date of birth is required");

const idSchema = z.string().min(1).max(128);
const cursorSchema = z.string().min(1).max(2048);
export const educationStatusSchema = z.enum(["student", "alumni"]);
export const institutionTypeSchema = z.enum([
  "university",
  "polytechnic",
  "college_of_education",
  "monotechnic",
  "specialized",
  "other",
]);
export const institutionOwnershipSchema = z.enum(["federal", "state", "private", "unknown"]);

export const userSchema = z.object({
  id: idSchema,
  username: z.string().min(1).max(64),
  displayName: z.string().max(100).optional(),
  schoolId: idSchema.optional(),
  schoolName: z.string().max(200).optional(),
  educationStatus: educationStatusSchema.optional(),
  avatarUrl: z.string().url().optional(),
  bannerUrl: z.string().max(2048).optional(),
  verifiedStudent: z.boolean(),
  joinedAt: z.string().min(1),
  bio: z.string().max(500).optional(),
  skills: z.array(z.string().max(64)).optional(),
  badgeIds: z.array(idSchema).optional(),
  presence: z.enum(["online", "offline", "hidden"]).optional(),
  birthdayToday: z.boolean().optional(),
  showBirthday: z.boolean().optional(),
  joinedCommunitySlugs: z.array(z.string().max(100)).optional(),
  status: z.string().max(160).optional(),
  department: z.string().max(120).optional(),
  level: z.string().max(40).optional(),
  links: z.array(z.object({ label: z.string().max(60), url: z.string().url() }).strict()).optional(),
  location: z.string().max(120).optional(),
  languages: z.array(z.string().max(60)).optional(),
}).strict();
export const authUserSchema = userSchema.extend({ profileComplete: z.boolean() }).strict();
export const authRequestCodeRequestSchema = z.object({ email: emailSchema }).strict();
export const authRequestCodeResponseSchema = z.object({ ok: z.literal(true) }).strict();
export const authVerifyCodeRequestSchema = z.object({
  email: emailSchema,
  code: codeSchema,
}).strict();
export const authVerifyCodeResponseSchema = z.discriminatedUnion("isNewUser", [
  z.object({ isNewUser: z.literal(false), user: authUserSchema }).strict(),
  z.object({ isNewUser: z.literal(true), signupTicket: z.string().min(1).max(4096) }).strict(),
]);
export const authSignupRequestSchema = z.object({
  signupTicket: z.string().min(1).max(4096),
  username: usernameSchema,
  schoolId: idSchema,
  educationStatus: educationStatusSchema,
  dateOfBirth: dobSchema,
}).strict();
export const authSignupResponseSchema = z.object({ user: authUserSchema }).strict();
export const authSessionSchema = z.object({
  id: idSchema,
  createdAt: z.string().min(1),
  lastUsedAt: z.string().min(1).nullable(),
  expiresAt: z.string().min(1),
  current: z.boolean(),
}).strict();
export const usernameAvailableQuerySchema = z.object({ u: usernameSchema }).strict();
export const usernameAvailableResponseSchema = z.object({ available: z.boolean() }).strict();
export const schoolSearchQuerySchema = z.object({ q: z.string().trim().min(2).max(100) }).strict();
export const schoolSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(200),
  institutionType: institutionTypeSchema,
  ownership: institutionOwnershipSchema,
}).strict();

export const reactionScopeSchema = z.enum(["asset", "dm"]);
export const reactionRoomParamsSchema = z.object({
  roomId: idSchema,
}).strict();
export const reactionMessageParamsSchema = z.object({
  messageId: idSchema,
  emoji: z.string().min(1).max(32),
}).strict();
export const reactionMessageIdParamsSchema = z.object({
  messageId: idSchema,
}).strict();
export const reactionPathSchema = z.object({
  scope: reactionScopeSchema,
  roomId: idSchema,
  messageId: idSchema,
  emoji: z.string().min(1).max(32),
}).strict();
export const reactionUsersQuerySchema = z.object({
  cursor: cursorSchema.optional(),
}).strict();
export const reactionSummarySchema = z.object({
  emoji: z.string().min(1).max(32),
  count: z.number().int().positive(),
  me: z.boolean(),
}).strict();
export const reactionUserSchema = z.object({
  id: idSchema,
  username: z.string().min(1).max(64),
  avatarUrl: z.string().url().optional(),
  me: z.boolean(),
}).strict();
export const reactionRequestSchema = z.object({
  scope: reactionScopeSchema,
  roomId: idSchema,
  messageId: idSchema,
  emoji: z.string().min(1).max(32),
  add: z.boolean(),
  clientId: z.string().min(1).max(128),
}).strict();
export const reactionUsersPageSchema = z.object({
  items: z.array(reactionUserSchema),
  nextCursor: cursorSchema.nullable().optional(),
}).strict();
export const reactionUpdatedEventSchema = z.object({
  type: z.literal("reaction.updated"),
  scope: reactionScopeSchema,
  roomId: idSchema,
  messageId: idSchema,
  emoji: z.string().min(1).max(32),
  count: z.number().int().nonnegative(),
  op: z.enum(["add", "remove"]),
  userId: idSchema,
  clientId: z.string().max(128).optional(),
}).strict();
export const reactionResyncEventSchema = z.object({
  type: z.literal("reaction.resync"),
  scope: reactionScopeSchema,
  roomId: idSchema,
  messages: z.array(z.object({
    messageId: idSchema,
    reactions: z.array(reactionSummarySchema),
  }).strict()),
}).strict();
export const reactionStreamEventSchema = z.discriminatedUnion("type", [
  reactionUpdatedEventSchema,
  reactionResyncEventSchema,
]);

export const mentionScopeSchema = z.enum(["asset", "dm"]);
export const mentionRecordSchema = z.object({
  messageId: idSchema,
  seq: z.number().int().positive(),
  createdAt: z.string().datetime(),
}).strict();
export const mentionableMemberSchema = z.object({
  id: idSchema,
  username: z.string().min(1).max(64),
  avatarUrl: z.string().url().optional(),
  schoolName: z.string().max(200).optional(),
  role: z.enum(["owner", "moderator", "member"]).optional(),
  presence: z.enum(["online", "offline", "hidden"]).optional(),
}).strict();
export const mentionSeenRequestSchema = z.union([
  z.object({ messageIds: z.array(idSchema).min(1).max(200) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);
export const mentionableQuerySchema = z.object({
  q: z.string().max(100).optional(),
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
}).strict();
export const mentionableMembersPageSchema = z.object({
  items: z.array(mentionableMemberSchema),
  nextCursor: cursorSchema.nullable().optional(),
}).strict();
export const apiOkResponseSchema = z.object({ ok: z.literal(true) }).strict();
export const unreadCountsSchema = z.object({
  unread: z.number().int().nonnegative(),
  mentions: z.number().int().nonnegative(),
}).strict().refine(({ unread, mentions }) => mentions <= unread, {
  message: "Mention count cannot exceed unread count",
  path: ["mentions"],
});
export const unreadSummarySchema = z.object({
  dm: unreadCountsSchema,
  assets: z.array(z.object({
    assetId: idSchema,
    unread: z.number().int().nonnegative(),
    mentions: z.number().int().nonnegative(),
  }).strict().refine(({ unread, mentions }) => mentions <= unread, {
    message: "Mention count cannot exceed unread count",
    path: ["mentions"],
  })),
}).strict();
