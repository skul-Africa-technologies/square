import { randomUUID } from "node:crypto";
import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthenticatedUser } from "@square/kernel";
import { ApiException, DatabaseService, Public, RedisService } from "@square/kernel";
import {
  authRequestCodeRequestSchema,
  authSignupRequestSchema,
  authVerifyCodeRequestSchema,
  schoolSchema,
  usernameAvailableQuerySchema,
  userSchema,
} from "@square/shared";

type IdentityRequest = FastifyRequest & { user?: AuthenticatedUser };

function userFromRow(row: Record<string, unknown>) {
  return userSchema.parse({
    id: row.id,
    username: row.username,
    displayName: row.display_name || undefined,
    schoolId: row.school_id || undefined,
    schoolName: row.school_name || undefined,
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

function setDevSession(reply: FastifyReply, userId: string) {
  const csrf = randomUUID().replace(/-/g, "");
  reply.header("Set-Cookie", [
    `__Host-sq_access=dev_${userId}; HttpOnly; Secure; SameSite=Lax; Path=/`,
    `__Host-sq_csrf=${csrf}; Secure; SameSite=Lax; Path=/`,
  ]);
}

@Controller()
export class IdentityController {
  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  @Post("auth/request-code")
  @Public()
  @HttpCode(202)
  async requestCode(@Body() body: unknown) {
    const { email } = authRequestCodeRequestSchema.parse(body);
    const normalized = email.trim().toLowerCase();
    const hmac = await this.redis.client.hget("auth:codes", normalized);
    void hmac;
    const code = "123456";
    await this.redis.client.setex(`auth:code:${normalized}`, 600, code);
    await this.redis.client.incr(`auth:requests:${normalized}`);
    return { ok: true };
  }

  @Post("auth/verify-code")
  @Public()
  async verifyCode(@Body() body: unknown) {
    const { email, code } = authVerifyCodeRequestSchema.parse(body);
    const normalized = email.trim().toLowerCase();
    const stored = await this.redis.client.get(`auth:code:${normalized}`);
    if (!stored || stored !== code) throw new ApiException(400, "code_invalid", "That code is invalid", "code");
    await this.redis.client.del(`auth:code:${normalized}`);
    const account = await this.database.pool.query<{ id: string }>(
      "SELECT id FROM auth.accounts WHERE email = $1",
      [normalized],
    );
    if (!account.rows[0]) {
      const signupTicket = randomUUID();
      await this.redis.client.setex(`auth:ticket:${signupTicket}`, 900, normalized);
      return { isNewUser: true, signupTicket };
    }
    const profile = await this.database.pool.query<Record<string, unknown>>(
      "SELECT * FROM users.profiles WHERE id = $1",
      [account.rows[0].id],
    );
    if (!profile.rows[0]) throw new ApiException(404, "not_found", "User profile not found");
    const user = userFromRow(profile.rows[0]);
    return { isNewUser: false, user: { ...user, profileComplete: true } };
  }

  @Post("auth/signup")
  @Public()
  async signup(@Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const request = authSignupRequestSchema.parse(body);
    const email = await this.redis.client.get(`auth:ticket:${request.signupTicket}`);
    if (!email) throw new ApiException(400, "signup_ticket_invalid", "Signup ticket is invalid");
    await this.redis.client.del(`auth:ticket:${request.signupTicket}`);
    const birth = new Date(`${request.dateOfBirth}T00:00:00Z`);
    if (Number.isNaN(birth.getTime())) throw new ApiException(400, "validation_failed", "Invalid date of birth", "dateOfBirth");
    const age = new Date();
    age.setFullYear(age.getFullYear() - 16);
    if (birth > age) throw new ApiException(400, "age_not_allowed", "Age requirement not met");

    const normalizedUsername = request.username.replace(/^#/, "").toLowerCase();
    const id = randomUUID();
    await this.database.transaction(async (client) => {
      await client.query("INSERT INTO auth.accounts (id, email) VALUES ($1, $2)", [id, email]);
      await client.query(
        `INSERT INTO users.profiles (
          id, username, school_id, school_name, verified_student, joined_at,
          birthday_md, date_of_birth
        ) VALUES ($1, $2, $3, (SELECT name FROM users.schools WHERE id=$3), false, now(), $4, $5)`,
        [id, normalizedUsername, request.schoolId, `${String(birth.getUTCMonth() + 1).padStart(2, "0")}-${String(birth.getUTCDate()).padStart(2, "0")}`, request.dateOfBirth],
      );
    });
    setDevSession(reply, id);
    const row = (await this.database.pool.query<Record<string, unknown>>("SELECT * FROM users.profiles WHERE id=$1", [id])).rows[0];
    return { user: { ...userFromRow(row), profileComplete: true } };
  }

  @Get("users/username-available")
  @Public()
  async usernameAvailable(@Query("u") username: string) {
    const query = usernameAvailableQuerySchema.parse({ u: username });
    const normalized = query.u.replace(/^#/, "").toLowerCase();
    const result = await this.database.pool.query(
      "SELECT 1 FROM users.profiles WHERE lower(username)=lower($1)",
      [normalized],
    );
    return { available: result.rowCount === 0 };
  }

  @Get("schools")
  @Public()
  async schools(@Query("q") query?: string) {
    const search = (query || "").trim();
    const result = await this.database.pool.query<{ id: string; name: string }>(
      search
        ? "SELECT id, name FROM users.schools WHERE name ILIKE $1 ORDER BY name LIMIT 30"
        : "SELECT id, name FROM users.schools ORDER BY name LIMIT 30",
      search ? [`%${search}%`] : [],
    );
    return result.rows.map(row => schoolSchema.parse(row));
  }

  @Get("me")
  async me(@Req() request: IdentityRequest) {
    const result = await this.database.pool.query<Record<string, unknown>>(
      "SELECT * FROM users.profiles WHERE id=$1",
      [request.user?.id],
    );
    if (!result.rows[0]) throw new ApiException(404, "not_found", "User profile not found");
    return userFromRow(result.rows[0]);
  }

  @Patch("me")
  async updateMe(@Req() request: IdentityRequest, @Body() body: unknown) {
    const allowed = userSchema.partial().parse(body);
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
    };
    for (const [key, column] of Object.entries(mappings)) {
      if (key in allowed) {
        values.push((allowed as Record<string, unknown>)[key]);
        fields.push(`${column}=$${values.length}`);
      }
    }
    if (fields.length) {
      values.push(request.user?.id);
      await this.database.pool.query(
        `UPDATE users.profiles SET ${fields.join(", ")} WHERE id=$${values.length}`,
        values,
      );
    }
    return this.me(request);
  }

  @Get("me/settings")
  async settings(@Req() request: IdentityRequest) {
    const result = await this.database.pool.query<Record<string, unknown>>(
      "SELECT birthday_opt_in, appear_offline, show_communities, dm_privacy, timezone FROM users.profiles WHERE id=$1",
      [request.user?.id],
    );
    if (!result.rows[0]) throw new ApiException(404, "not_found", "User settings not found");
    return result.rows[0];
  }

  @Patch("me/settings")
  async updateSettings(@Req() request: IdentityRequest, @Body() body: unknown) {
    const input = body as Record<string, unknown>;
    await this.database.pool.query(
      `UPDATE users.profiles SET
        birthday_opt_in=COALESCE($1,birthday_opt_in),
        appear_offline=COALESCE($2,appear_offline),
        show_communities=COALESCE($3,show_communities),
        dm_privacy=COALESCE($4,dm_privacy),
        timezone=COALESCE($5,timezone)
       WHERE id=$6`,
      [input.birthdayOptIn, input.appearOffline, input.showCommunities, input.dmPrivacy, input.timezone, request.user?.id],
    );
    return this.settings(request);
  }

  @Post("auth/logout")
  @HttpCode(204)
  async logout(@Res({ passthrough: true }) reply: FastifyReply): Promise<void> {
    reply.header("Set-Cookie", "__Host-sq_access=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
  }

  @Delete("me")
  @HttpCode(202)
  async deleteMe(@Req() request: IdentityRequest) {
    await this.database.pool.query(
      "UPDATE users.profiles SET deleted_at=now() WHERE id=$1",
      [request.user?.id],
    );
    return { ok: true };
  }
}
