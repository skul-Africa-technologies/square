import { z } from "zod";

const optionalNonEmpty = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

const boolFromEnv = (fallback: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === "") return fallback;
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  }, z.boolean());

const backendConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  SERVICES: z.string().trim().min(1).default("all"),
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"), {
      message: "DATABASE_URL must use the postgres or postgresql protocol",
    })
    .default("postgresql://square:square@127.0.0.1:5432/square"),
  REDIS_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith("redis://") || value.startsWith("rediss://"), {
      message: "REDIS_URL must use the redis or rediss protocol",
    })
    .default("redis://127.0.0.1:6379"),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(6),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean))
    .pipe(
      z.array(
        z.url().refine((value) => {
          try {
            const parsed = new URL(value);
            return ["http:", "https:"].includes(parsed.protocol) && parsed.origin === value;
          } catch {
            return false;
          }
        }, "CORS values must be exact http(s) origins"),
      ).min(1),
    ),
  DUMMY_SERVICE_URL: z.string().url().default("http://127.0.0.1:4010"),
  JWT_ISSUER: z.string().trim().min(1).default("square"),
  JWT_AUDIENCE: z.string().trim().min(1).default("square-api"),
  JWT_PUBLIC_KEY: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z
      .string()
      .refine((value) => value.includes("-----BEGIN PUBLIC KEY-----") && value.includes("-----END PUBLIC KEY-----"), {
        message: "JWT_PUBLIC_KEY must be an SPKI PEM public key",
      })
      .optional(),
  ),
  METRICS_TOKEN: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(32, "METRICS_TOKEN must contain at least 32 characters").optional(),
  ),
  BREVO_API_KEY: optionalNonEmpty,
  BREVO_SENDER_EMAIL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.email().optional(),
  ),
  BREVO_SENDER_NAME: z.string().trim().min(1).default("Square"),
  CLOUDINARY_CLOUD_NAME: optionalNonEmpty,
  CLOUDINARY_API_KEY: optionalNonEmpty,
  CLOUDINARY_API_SECRET: optionalNonEmpty,
  CLOUDINARY_UPLOAD_FOLDER: z.string().trim().min(1).default("square"),
  SIGNUP_ENABLED: boolFromEnv(true),
  DM_ENABLED: boolFromEnv(true),
  UPLOADS_ENABLED: boolFromEnv(true),
  ENABLE_TYPING: boolFromEnv(false),
  ENABLE_PUSH: boolFromEnv(false),
}).superRefine((config, context) => {
  const brevoConfigured = Boolean(config.BREVO_API_KEY || config.BREVO_SENDER_EMAIL);
  if (brevoConfigured && (!config.BREVO_API_KEY || !config.BREVO_SENDER_EMAIL)) {
    context.addIssue({
      code: "custom",
      path: ["BREVO_API_KEY"],
      message: "BREVO_API_KEY and BREVO_SENDER_EMAIL must be configured together",
    });
  }

  const cloudinaryValues = [
    config.CLOUDINARY_CLOUD_NAME,
    config.CLOUDINARY_API_KEY,
    config.CLOUDINARY_API_SECRET,
  ];
  if (cloudinaryValues.some(Boolean) && cloudinaryValues.some((value) => !value)) {
    context.addIssue({
      code: "custom",
      path: ["CLOUDINARY_API_SECRET"],
      message: "Cloudinary cloud name, API key and API secret must be configured together",
    });
  }

  if (config.NODE_ENV === "production") {
    if (config.CORS_ORIGINS.some((origin) => {
      const { protocol, hostname } = new URL(origin);
      return protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(hostname);
    })) {
      context.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "Production CORS origins must be public HTTPS origins" });
    }
    if (!config.METRICS_TOKEN) {
      context.addIssue({ code: "custom", path: ["METRICS_TOKEN"], message: "METRICS_TOKEN is required in production" });
    }
    if (!["require", "verify-ca", "verify-full"].includes(new URL(config.DATABASE_URL).searchParams.get("sslmode") ?? "")) {
      context.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "Production DATABASE_URL must require SSL" });
    }
    if (!config.REDIS_URL.startsWith("rediss://")) {
      context.addIssue({ code: "custom", path: ["REDIS_URL"], message: "Production REDIS_URL must use TLS (rediss)" });
    }
  }
});

export type BackendConfig = z.infer<typeof backendConfigSchema>;

export function parseBackendConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): BackendConfig {
  const parsed = backendConfigSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid backend configuration: ${details}`);
  }
  return parsed.data;
}
