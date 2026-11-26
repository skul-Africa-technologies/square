import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { importPKCS8, SignJWT } from "jose";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { verificationEmailHtml, verificationEmailText } from "./emails/verification-code";
import type { AuthenticatedUser, BackendConfig } from "@square/kernel";
import {
  ApiException,
  authCookieNames,
  cookieValue,
  DatabaseService,
  Public,
  RedisRateLimiter,
  RedisService,
} from "@square/kernel";
import {
  authRequestCodeRequestSchema,
  authSignupRequestSchema,
  authVerifyCodeRequestSchema,
  schoolSchema,
  schoolSearchQuerySchema,
  usernameAvailableQuerySchema,
  userSchema,
} from "@square/shared";
import { BACKEND_CONFIG } from "./tokens";

type IdentityRequest = FastifyRequest & { user?: AuthenticatedUser };

const settingsUpdateSchema = z.object({
  birthdayOptIn: z.boolean().optional(),
  appearOffline: z.boolean().optional(),
  showCommunities: z.boolean().optional(),
  dmPrivacy: z.enum(["everyone", "shared", "none"]).optional(),
  timezone: z.string().min(1).max(64).optional(),
}).strict();
interface CodeState {
  hash: string;
  createdAt: number;
}

function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function constantTimeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function parseCodeState(value: string | null): CodeState | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      parsed &&
      typeof parsed === "object" &&
      "hash" in parsed &&
      typeof parsed.hash === "string" &&
      "createdAt" in parsed &&
      typeof parsed.createdAt === "number"
    ) {
      return { hash: parsed.hash, createdAt: parsed.createdAt };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function userFromRow(row: Record<string, unknown>) {
  return userSchema.parse({
    id: row.id,
    username: row.username,
    displayName: row.display_name || undefined,
    schoolId: row.school_id || undefined,
    schoolName: row.school_name || undefined,
    educationStatus: row.education_status === "alumni" ? "alumni" : "student",
    avatarUrl: row.avatar_url || undefined,
    bannerUrl: row.banner_url || undefined,
    verifiedStudent: row.verified_student === true,
    joinedAt: row.joined_at instanceof Date ? row.joined_at.toISOString() : String(row.joined_at),
    bio: row.bio || undefined,
    skills: [],
    badgeIds: [],
    birthdayToday: false,
    showBirthday: row.birthday_opt_in === true,
    status: row.status || undefined,
    department: row.department || undefined,
    level: row.level || undefined,
    location: row.location || undefined,
    languages: [],
  });
}

function cookieOptions(config: BackendConfig, path: string, httpOnly: boolean, maxAge: number): string[] {
  const attributes = [
    `Path=${path}`,
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    ...(httpOnly ? ["HttpOnly"] : []),
  ];
  if (config.COOKIE_DOMAIN) attributes.push(`Domain=${config.COOKIE_DOMAIN}`);
  return attributes;
}

function setSessionCookies(
  reply: FastifyReply,
  config: BackendConfig,
  values: { access: string; refresh?: string },
): void {
  const names = authCookieNames(config);
  const csrf = randomBytes(32).toString("base64url");
  const refreshPath = config.COOKIE_DOMAIN ? "/v1/auth/refresh" : "/";
  const cookies = [
    `${names.access}=${encodeURIComponent(values.access)}; ${cookieOptions(config, "/", true, 600).join("; ")}`,
    `${names.csrf}=${csrf}; ${cookieOptions(config, "/", false, 30 * 24 * 60 * 60).join("; ")}`,
  ];
  if (values.refresh) {
    cookies.push(
      `${names.refresh}=${encodeURIComponent(values.refresh)}; ${cookieOptions(config, refreshPath, true, 30 * 24 * 60 * 60).join("; ")}`,
    );
  }
  reply.header("Set-Cookie", cookies);
}

function clearSessionCookies(reply: FastifyReply, config: BackendConfig): void {
  const names = authCookieNames(config);
  const refreshPath = config.COOKIE_DOMAIN ? "/v1/auth/refresh" : "/";
  const cookies = [
    `${names.access}=; ${cookieOptions(config, "/", true, 0).join("; ")}`,
    `${names.csrf}=; ${cookieOptions(config, "/", false, 0).join("; ")}`,
    `${names.refresh}=; ${cookieOptions(config, refreshPath, true, 0).join("; ")}`,
  ];
  reply.header("Set-Cookie", cookies);
}

@Controller()
export class IdentityController {
  private readonly logger = new Logger(IdentityController.name);
  private readonly codePepper: string;

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly rateLimiter: RedisRateLimiter,
    @Inject(BACKEND_CONFIG) private readonly config: BackendConfig,
  ) {
    this.codePepper = config.AUTH_CODE_PEPPER ?? (config.NODE_ENV === "test" ? "test-only-auth-code-pepper" : "");
  }

  @Post("auth/request-code")
  @Public()
  @HttpCode(202)
  async requestCode(@Body() body: unknown, @Req() request: IdentityRequest) {
    const { email } = authRequestCodeRequestSchema.parse(body);
    const normalizedEmail = email.trim().toLowerCase();
    const emailHash = hmac(this.codePepper, normalizedEmail);
    const ipHash = hmac(this.codePepper, request.ip || "unknown");

    const cooldownKey = `auth:cooldown:${emailHash}`;
    const cooldown = await this.redis.client.set(cooldownKey, "1", "EX", 60, "NX");
    if (!cooldown) return { ok: true };

    await this.consumeLimit("auth_code_email", emailHash, 5, 60 * 60 * 1000);
    await this.consumeLimit("auth_code_ip", ipHash, 10, 60 * 60 * 1000);

    const code = this.config.AUTH_TEST_MODE
      ? "123456"
      : String(randomInt(0, 1_000_000)).padStart(6, "0");
    const state: CodeState = {
      hash: hmac(this.codePepper, `${normalizedEmail}:${code}`),
      createdAt: Date.now(),
    };
    const codeKey = `auth:code:${emailHash}`;
    await this.redis.client.set(codeKey, JSON.stringify(state), "EX", 600);
    await this.redis.client.del(`auth:attempts:${emailHash}`);

    try {
      await this.sendVerificationCode(normalizedEmail, code);
      await this.writeLoginEvent(emailHash, ipHash, "code_requested", true);
    } catch (error) {
      await Promise.all([
        this.redis.client.del(codeKey),
        this.redis.client.del(cooldownKey),
      ]);
      await this.writeLoginEvent(emailHash, ipHash, "code_delivery_failed", false);
      throw error;
    }

    return { ok: true };
  }

  @Post("auth/verify-code")
  @Public()
  async verifyCode(
    @Body() body: unknown,
    @Req() request: IdentityRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { email, code } = authVerifyCodeRequestSchema.parse(body);
    const normalizedEmail = email.trim().toLowerCase();
    const emailHash = hmac(this.codePepper, normalizedEmail);
    const ipHash = hmac(this.codePepper, request.ip || "unknown");
    const codeKey = `auth:code:${emailHash}`;
    const state = parseCodeState(await this.redis.client.get(codeKey));
    const suppliedHash = hmac(this.codePepper, `${normalizedEmail}:${code}`);

    if (!state || !constantTimeHexEqual(state.hash, suppliedHash)) {
      const attempts = await this.redis.client.incr(`auth:attempts:${emailHash}`);
      if (attempts === 1) await this.redis.client.expire(`auth:attempts:${emailHash}`, 600);
      if (attempts >= 5) {
        await this.redis.client.del(codeKey);
        await this.writeLoginEvent(emailHash, ipHash, "code_verification", false);
        throw new ApiException(429, "too_many_attempts", "Too many attempts. Request a new code.", "code");
      }
      await this.writeLoginEvent(emailHash, ipHash, "code_verification", false);
      throw new ApiException(400, "code_invalid", "That code is invalid", "code");
    }

    const consumed = parseCodeState(await this.redis.client.getdel(codeKey));
    if (!consumed || !constantTimeHexEqual(consumed.hash, suppliedHash)) {
      await this.writeLoginEvent(emailHash, ipHash, "code_verification", false);
      throw new ApiException(400, "code_invalid", "That code is invalid", "code");
    }
    await this.redis.client.del(`auth:attempts:${emailHash}`);

    const account = await this.database.pool.query<{ id: string }>(
      `SELECT account.id
       FROM identity.accounts account
       JOIN users.profiles profile ON profile.id = account.id
       WHERE account.email = $1 AND profile.deleted_at IS NULL`,
      [normalizedEmail],
    );
    if (!account.rows[0]) {
      const signupTicket = randomBytes(32).toString("base64url");
      await this.redis.client.set(`auth:ticket:${hash(signupTicket)}`, normalizedEmail, "EX", 900, "NX");
      await this.writeLoginEvent(emailHash, ipHash, "new_account_code_verified", true);
      return { isNewUser: true, signupTicket };
    }

    const profile = await this.getProfileRow(account.rows[0].id);
    if (!profile) throw new ApiException(404, "not_found", "User profile not found");
    const user = userFromRow(profile);
    const profileComplete = Boolean(profile.school_id && profile.date_of_birth);
    await this.createSession(request, reply, user.id, user.verifiedStudent ? 1 : 0);
    await this.writeLoginEvent(emailHash, ipHash, "login", true);
    return { isNewUser: false, user: { ...user, profileComplete } };
  }

  @Post("auth/signup")
  @Public()
  async signup(
    @Body() body: unknown,
    @Req() request: IdentityRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    if (!this.config.SIGNUP_ENABLED) {
      throw new ApiException(403, "signup_disabled", "Signups are temporarily unavailable");
    }
    const input = authSignupRequestSchema.parse(body);
    const normalizedUsername = input.username.replace(/^#/, "").normalize("NFC").toLowerCase();
    const ticketKey = `auth:ticket:${hash(input.signupTicket)}`;
    const ticketEmail = await this.redis.client.get(ticketKey);
    if (!ticketEmail) throw new ApiException(400, "signup_ticket_invalid", "Signup ticket is invalid");

    const birth = new Date(`${input.dateOfBirth}T00:00:00Z`);
    if (Number.isNaN(birth.getTime()) || birth.toISOString().slice(0, 10) !== input.dateOfBirth) {
      throw new ApiException(400, "validation_failed", "Invalid date of birth", "dateOfBirth");
    }
    const age = new Date();
    age.setUTCFullYear(age.getUTCFullYear() - 16);
    if (birth > age) throw new ApiException(400, "age_not_allowed", "Age requirement not met");

    const school = await this.database.pool.query<{ name: string }>(
      "SELECT name FROM users.schools WHERE id = $1",
      [input.schoolId],
    );
    const schoolName = school.rows[0]?.name;
    if (!schoolName) throw new ApiException(400, "validation_failed", "Choose a valid school", "schoolId");

    const email = await this.redis.client.getdel(ticketKey);
    if (email !== ticketEmail) {
      throw new ApiException(400, "signup_ticket_invalid", "Signup ticket is invalid");
    }

    const id = randomBytes(16).toString("hex");
    const dateOfBirth = input.dateOfBirth;
    const birthdayMd = `${String(birth.getUTCMonth() + 1).padStart(2, "0")}-${String(birth.getUTCDate()).padStart(2, "0")}`;
    try {
      await this.database.transaction(async (client) => {
        await client.query("INSERT INTO identity.accounts (id, email) VALUES ($1, $2)", [id, email]);
        await client.query(
          `INSERT INTO users.profiles (
            id, username, school_id, school_name, education_status, verified_student, joined_at,
            birthday_md, date_of_birth
          ) VALUES ($1, $2, $3, $4, $5, false, now(), $6, $7)`,
          [
            id,
            normalizedUsername,
            input.schoolId,
            schoolName,
            input.educationStatus,
            birthdayMd,
            dateOfBirth,
          ],
        );
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new ApiException(409, "username_taken", "That username or email is already in use");
      }
      throw error;
    }

    const profile = await this.getProfileRow(id);
    if (!profile) throw new ApiException(500, "internal_error", "Could not load the created profile");
    const user = userFromRow(profile);
    await this.createSession(request, reply, user.id, 0);
    await this.writeLoginEvent(
      hmac(this.codePepper, email),
      hmac(this.codePepper, request.ip || "unknown"),
      "signup",
      true,
    );
    return { user: { ...user, profileComplete: true } };
  }

  @Post("auth/refresh")
  @Public()
  async refresh(@Req() request: IdentityRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const names = authCookieNames(this.config);
    const token = cookieValue(request.headers.cookie, names.refresh);
    if (!token) throw new ApiException(401, "unauthenticated", "Sign in to continue");
    const tokenHash = hash(token);

    const result = await this.database.transaction(async (client) => {
      const history = await client.query<{
        session_id: string;
        family_id: string;
        used_at: Date | null;
        expires_at: Date;
        account_id: string;
        revoked_at: Date | null;
      }>(
        `SELECT history.session_id, history.family_id, history.used_at, history.expires_at,
                session.account_id, session.revoked_at
         FROM identity.refresh_token_history history
         JOIN identity.sessions session ON session.id = history.session_id
         WHERE history.token_hash = $1
         FOR UPDATE OF history, session`,
        [tokenHash],
      );
      const previous = history.rows[0];
      if (!previous) return { kind: "invalid" as const };
      if (previous.used_at) {
        const revoked = await client.query<{ id: string }>(
          `UPDATE identity.sessions SET revoked_at = COALESCE(revoked_at, now())
           WHERE family_id = $1 RETURNING id`,
          [previous.family_id],
        );
        return { kind: "reused" as const, sessionIds: revoked.rows.map((row) => row.id) };
      }
      if (previous.revoked_at || previous.expires_at.getTime() <= Date.now()) {
        return { kind: "invalid" as const };
      }

      const nextToken = randomBytes(32).toString("base64url");
      const nextTokenHash = hash(nextToken);
      await client.query(
        "UPDATE identity.refresh_token_history SET used_at = now() WHERE token_hash = $1",
        [tokenHash],
      );
      await client.query(
        `UPDATE identity.sessions
         SET refresh_hash = $1, last_used_at = now(), expires_at = now() + interval '30 days'
         WHERE id = $2`,
        [nextTokenHash, previous.session_id],
      );
      await client.query(
        `INSERT INTO identity.refresh_token_history (token_hash, session_id, family_id, expires_at)
         VALUES ($1, $2, $3, now() + interval '30 days')`,
        [nextTokenHash, previous.session_id, previous.family_id],
      );
      return {
        kind: "rotated" as const,
        sessionId: previous.session_id,
        accountId: previous.account_id,
        familyId: previous.family_id,
        refreshToken: nextToken,
      };
    });

    if (result.kind === "reused") {
      await this.denySessions(result.sessionIds);
      clearSessionCookies(reply, this.config);
      throw new ApiException(401, "session_revoked", "Sign in to continue");
    }
    if (result.kind !== "rotated") {
      clearSessionCookies(reply, this.config);
      throw new ApiException(401, "unauthenticated", "Sign in to continue");
    }

    const profile = await this.getProfileRow(result.accountId);
    if (!profile) throw new ApiException(401, "unauthenticated", "Sign in to continue");
    const user = userFromRow(profile);
    const access = await this.createAccessToken(
      result.accountId,
      result.sessionId,
      user.verifiedStudent ? 1 : 0,
    );
    setSessionCookies(reply, this.config, { access, refresh: result.refreshToken });
    return { ok: true };
  }

  @Get("auth/sessions")
  async sessions(@Req() request: IdentityRequest) {
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT id, created_at, last_used_at, expires_at, user_agent_hash, ip_hash
       FROM identity.sessions
       WHERE account_id = $1 AND revoked_at IS NULL AND expires_at > now()
       ORDER BY last_used_at DESC NULLS LAST`,
      [request.user?.id],
    );
    return result.rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
      current: row.id === request.user?.sessionId,
    }));
  }

  @Delete("auth/sessions/:id")
  @HttpCode(204)
  async revokeSession(@Param("id") id: string, @Req() request: IdentityRequest) {
    const result = await this.database.pool.query<{ id: string }>(
      `UPDATE identity.sessions SET revoked_at = now()
       WHERE id = $1 AND account_id = $2 AND revoked_at IS NULL
       RETURNING id`,
      [id, request.user?.id],
    );
    if (!result.rowCount) throw new ApiException(404, "not_found", "Session not found");
    await this.denySessions([id]);
  }

  @Post("auth/logout-all")
  @HttpCode(204)
  async logoutAll(@Req() request: IdentityRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const sessions = await this.database.pool.query<{ id: string }>(
      `UPDATE identity.sessions SET revoked_at = now()
       WHERE account_id = $1 AND revoked_at IS NULL
       RETURNING id`,
      [request.user?.id],
    );
    await this.denySessions(sessions.rows.map((row) => row.id));
    clearSessionCookies(reply, this.config);
  }

  @Get("users/username-available")
  @Public()
  async usernameAvailable(@Query("u") username: string, @Req() request: IdentityRequest) {
    const query = usernameAvailableQuerySchema.parse({ u: username });
    const ipHash = hmac(this.codePepper, request.ip || "unknown");
    await this.consumeLimit("username_available_ip", ipHash, 30, 60 * 60 * 1000);
    const normalized = query.u.replace(/^#/, "").normalize("NFC").toLowerCase();
    const result = await this.database.pool.query(
      "SELECT 1 FROM users.profiles WHERE lower(username)=lower($1) AND deleted_at IS NULL",
      [normalized],
    );
    return { available: result.rowCount === 0 };
  }

  @Get("schools")
  @Public()
  async schools(@Query("q") query?: string) {
    if (!query?.trim()) return [];
    const { q } = schoolSearchQuerySchema.parse({ q: query });
    const search = q.toLowerCase();
    const result = await this.database.pool.query<{
      id: string;
      name: string;
      institutionType: string;
      ownership: string;
    }>(
      `SELECT school.id, school.name,
              school.institution_type AS "institutionType", school.ownership
       FROM users.schools school
       WHERE lower(school.name) LIKE $1
          OR EXISTS (
            SELECT 1
            FROM users.school_aliases alias
            WHERE alias.school_id = school.id AND alias.normalized_alias LIKE $1
          )
       ORDER BY CASE
         WHEN lower(school.name) = $2 THEN 0
         WHEN lower(school.name) LIKE $3 THEN 1
         ELSE 2
       END, school.name
       LIMIT 20`,
      [`%${search}%`, search, `${search}%`],
    );
    return result.rows.map((row) => schoolSchema.parse(row));
  }

  @Get("me")
  async me(@Req() request: IdentityRequest) {
    const row = await this.getProfileRow(request.user?.id ?? "");
    if (!row) throw new ApiException(404, "not_found", "User profile not found");
    return userFromRow(row);
  }

  @Patch("me")
  async updateMe(@Req() request: IdentityRequest, @Body() body: unknown) {
    const allowed = userSchema.pick({
      displayName: true,
      avatarUrl: true,
      bannerUrl: true,
      bio: true,
      status: true,
      department: true,
      level: true,
      location: true,
      educationStatus: true,
    }).partial().strict().parse(body);
    const fields: string[] = [];
    const values: unknown[] = [];
    const mappings: Record<string, string> = {
      displayName: "display_name",
      avatarUrl: "avatar_url",
      bannerUrl: "banner_url",
      bio: "bio",
      status: "status",
      department: "department",
      level: "level",
      location: "location",
      educationStatus: "education_status",
    };
    for (const [key, column] of Object.entries(mappings)) {
      if (key in allowed) {
        values.push(allowed[key as keyof typeof allowed]);
        fields.push(`${column}=$${values.length}`);
      }
    }
    if (fields.length) {
      values.push(request.user?.id);
      await this.database.pool.query(
        `UPDATE users.profiles SET ${fields.join(", ")} WHERE id=$${values.length} AND deleted_at IS NULL`,
        values,
      );
    }
    return this.me(request);
  }

  @Get("me/settings")
  async settings(@Req() request: IdentityRequest) {
    const result = await this.database.pool.query<Record<string, unknown>>(
      "SELECT birthday_opt_in, appear_offline, show_communities, dm_privacy, timezone FROM users.profiles WHERE id=$1 AND deleted_at IS NULL",
      [request.user?.id],
    );
    if (!result.rows[0]) throw new ApiException(404, "not_found", "User settings not found");
    const row = result.rows[0];
    return {
      birthdayOptIn: row.birthday_opt_in,
      appearOffline: row.appear_offline,
      showCommunities: row.show_communities,
      dmPrivacy: row.dm_privacy,
      timezone: row.timezone,
    };
  }

  @Patch("me/settings")
  async updateSettings(@Req() request: IdentityRequest, @Body() body: unknown) {
    const input = settingsUpdateSchema.parse(body);
    await this.database.pool.query(
      `UPDATE users.profiles SET
        birthday_opt_in=COALESCE($1,birthday_opt_in),
        appear_offline=COALESCE($2,appear_offline),
        show_communities=COALESCE($3,show_communities),
        dm_privacy=COALESCE($4,dm_privacy),
        timezone=COALESCE($5,timezone)
       WHERE id=$6 AND deleted_at IS NULL`,
      [input.birthdayOptIn, input.appearOffline, input.showCommunities, input.dmPrivacy, input.timezone, request.user?.id],
    );
    return this.settings(request);
  }

  @Get("me/blocks")
  async listBlockedUsers(@Req() request: IdentityRequest) {
    const result = await this.database.pool.query<{ id: string; username: string }>(
      `SELECT profile.id,profile.username
       FROM users.blocks block
       JOIN users.profiles profile ON profile.id=block.blocked_id
       WHERE block.blocker_id=$1 AND profile.deleted_at IS NULL
       ORDER BY profile.username`,
      [request.user?.id],
    );
    return result.rows;
  }

  @Post("me/blocks")
  async blockUser(@Body() body: unknown, @Req() request: IdentityRequest) {
    const input = z.object({ username: z.string().trim().min(1).max(64) }).strict().safeParse(body);
    if (!input.success) {
      const issue = input.error.issues[0];
      throw new ApiException(400, "validation_failed", issue?.message ?? "Invalid username", issue?.path.join(".") || null);
    }
    const target = await this.database.pool.query<{ id: string }>(
      "SELECT id FROM users.profiles WHERE lower(username)=lower($1) AND deleted_at IS NULL",
      [input.data.username.replace(/^#/, "")],
    );
    const targetId = target.rows[0]?.id;
    if (!targetId) throw new ApiException(404, "not_found", "User not found");
    if (targetId === request.user?.id) throw new ApiException(400, "validation_failed", "You cannot block yourself");
    await this.database.pool.query(
      "INSERT INTO users.blocks (blocker_id,blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [request.user?.id, targetId],
    );
    return { ok: true };
  }

  @Delete("me/blocks/:username")
  async unblockUser(@Param("username") username: string, @Req() request: IdentityRequest) {
    const result = await this.database.pool.query(
      `DELETE FROM users.blocks block
       USING users.profiles profile
       WHERE block.blocker_id=$1 AND block.blocked_id=profile.id
         AND lower(profile.username)=lower($2)`,
      [request.user?.id, username.replace(/^#/, "")],
    );
    if (!result.rowCount) throw new ApiException(404, "not_found", "Blocked user not found");
    return { ok: true };
  }

  @Post("auth/logout")
  @HttpCode(204)
  async logout(
    @Req() request: IdentityRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const sessionId = request.user?.sessionId;
    if (sessionId && sessionId !== "dev-session") {
      await this.database.pool.query(
        "UPDATE identity.sessions SET revoked_at = now() WHERE id = $1 AND account_id = $2 AND revoked_at IS NULL",
        [sessionId, request.user?.id],
      );
      await this.denySessions([sessionId]);
    }
    clearSessionCookies(reply, this.config);
  }

  @Delete("me")
  @HttpCode(202)
  async deleteMe(@Req() request: IdentityRequest) {
    const revoked = await this.database.transaction(async (client) => {
      await client.query(
        "UPDATE users.profiles SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL",
        [request.user?.id],
      );
      return client.query<{ id: string }>(
        `UPDATE identity.sessions SET revoked_at=now()
         WHERE account_id=$1 AND revoked_at IS NULL RETURNING id`,
        [request.user?.id],
      );
    });
    await this.denySessions(revoked.rows.map((row) => row.id));
    return { ok: true };
  }

  private async consumeLimit(family: string, key: string, limit: number, windowMs: number): Promise<void> {
    const result = await this.rateLimiter.consume(family, key, { limit, windowMs });
    if (!result.allowed) {
      throw new ApiException(429, "rate_limited", "Too many requests. Try again later.");
    }
  }

  private async sendVerificationCode(email: string, code: string): Promise<void> {
    const exposeCode = this.config.DEV_EXPOSE_AUTH_CODE;
    if (this.config.NODE_ENV === "test") {
      if (exposeCode) this.logger.log(`Test sign-in verification code: ${code}`);
      return;
    }
    if (this.config.NODE_ENV === "development" && !this.config.RESEND_API_KEY) {
      if (exposeCode) this.logger.log(`Development sign-in verification code: ${code}`);
      return;
    }
    if (!this.config.RESEND_API_KEY || !this.config.RESEND_SENDER_EMAIL) {
      throw new ApiException(503, "service_unavailable", "Email delivery is not configured");
    }
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${this.config.RESEND_SENDER_NAME} <${this.config.RESEND_SENDER_EMAIL}>`,
          to: [email],
          subject: "Your Square sign-in code",
          text: verificationEmailText({ code, email, expiresInMinutes: 10, assetBaseUrl: this.config.ASSET_BASE_URL ?? "http://localhost:3000" }),
          html: verificationEmailHtml({ code, email, expiresInMinutes: 10, assetBaseUrl: this.config.ASSET_BASE_URL ?? "http://localhost:3000" }),
        }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new ApiException(503, "service_unavailable", "Email delivery is temporarily unavailable");
    }
    if (!response.ok) {
      this.logger.error(`Resend rejected an auth email with status ${response.status}`);
      throw new ApiException(503, "service_unavailable", "Email delivery is temporarily unavailable");
    }
  }

  private async writeLoginEvent(
    emailHash: string,
    ipHash: string,
    kind: string,
    succeeded: boolean,
  ): Promise<void> {
    await this.database.pool.query(
      `INSERT INTO identity.login_events (id, email_hash, ip_hash, kind, succeeded)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomBytes(16).toString("hex"), emailHash, ipHash, kind, succeeded],
    );
  }

  private async getProfileRow(id: string): Promise<Record<string, unknown> | undefined> {
    const result = await this.database.pool.query<Record<string, unknown>>(
      `SELECT id, username, display_name, school_id, school_name, avatar_url, banner_url,
              education_status, verified_student, joined_at, bio, status, department, level, location,
              birthday_opt_in, date_of_birth
       FROM users.profiles
       WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return result.rows[0];
  }

  private async createSession(
    request: IdentityRequest,
    reply: FastifyReply,
    userId: string,
    trustLevel: number,
  ): Promise<void> {
    if (this.config.AUTH_DEV_BYPASS && this.config.NODE_ENV !== "production" && !this.config.JWT_PRIVATE_KEY) {
      setSessionCookies(reply, this.config, { access: `dev_${userId}` });
      return;
    }
    const sessionId = randomBytes(16).toString("hex");
    const familyId = randomBytes(16).toString("hex");
    const refreshToken = randomBytes(32).toString("base64url");
    const refreshHash = hash(refreshToken);
    const emailHashResult = await this.database.pool.query<{ email: string }>(
      "SELECT email FROM identity.accounts WHERE id=$1",
      [userId],
    );
    const emailHash = hmac(this.codePepper, emailHashResult.rows[0]?.email ?? "");
    const ipHash = hmac(this.codePepper, request.ip || "unknown");
    const userAgentHash = hmac(this.codePepper, String(request.headers["user-agent"] ?? ""));

    await this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO identity.sessions (
          id, account_id, refresh_hash, family_id, last_used_at, expires_at, user_agent_hash, ip_hash
        ) VALUES ($1,$2,$3,$4,now(),now()+interval '30 days',$5,$6)`,
        [sessionId, userId, refreshHash, familyId, userAgentHash, ipHash],
      );
      await client.query(
        `INSERT INTO identity.refresh_token_history (token_hash, session_id, family_id, expires_at)
         VALUES ($1,$2,$3,now()+interval '30 days')`,
        [refreshHash, sessionId, familyId],
      );
    });
    const access = await this.createAccessToken(userId, sessionId, trustLevel);
    setSessionCookies(reply, this.config, { access, refresh: refreshToken });
  }

  private async createAccessToken(userId: string, sessionId: string, trustLevel: number): Promise<string> {
    if (!this.config.JWT_PRIVATE_KEY) {
      throw new ApiException(503, "service_unavailable", "Authentication is not configured");
    }
    const key = await importPKCS8(this.config.JWT_PRIVATE_KEY, "EdDSA");
    return new SignJWT({ sid: sessionId, tl: trustLevel, v: 1 })
      .setProtectedHeader({ alg: "EdDSA", typ: "JWT", kid: this.config.JWT_KEY_ID })
      .setSubject(userId)
      .setIssuer(this.config.JWT_ISSUER)
      .setAudience(this.config.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(key);
  }

  private async denySessions(sessionIds: string[]): Promise<void> {
    await Promise.all(
      sessionIds.map((id) => this.redis.client.set(`sid:deny:${id}`, "1", "EX", 600)),
    );
  }
}
