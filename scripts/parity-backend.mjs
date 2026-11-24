import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const composeArgs = [
  "compose",
  "--env-file", "/dev/null",
  "--project-name", "square-parity",
  "--file", "infra/docker/docker-compose.yml",
];
const seedSql = `
BEGIN;
INSERT INTO identity.accounts (id, email)
VALUES ('parity-login', 'amaka@example.com')
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
INSERT INTO users.profiles (
  id, username, display_name, school_id, school_name, education_status, verified_student, date_of_birth
)
VALUES ('parity-login', 'amaka-eze', 'Amaka Eze', 'fut-minna', 'FUT Minna', 'student', false, '2000-01-01')
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  display_name = EXCLUDED.display_name,
  school_id = EXCLUDED.school_id,
  school_name = EXCLUDED.school_name,
  education_status = EXCLUDED.education_status,
  verified_student = EXCLUDED.verified_student,
  date_of_birth = EXCLUDED.date_of_birth,
  deleted_at = NULL;
INSERT INTO identity.accounts (id, email)
VALUES ('parity-tunde', 'tunde@example.com')
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
INSERT INTO users.profiles (
  id, username, display_name, school_id, school_name, education_status, verified_student, date_of_birth
)
VALUES ('parity-tunde', 'tunde-ade', 'Tunde Ade', 'fut-minna', 'FUT Minna', 'student', false, '1999-03-15')
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  display_name = EXCLUDED.display_name,
  school_id = EXCLUDED.school_id,
  school_name = EXCLUDED.school_name,
  education_status = EXCLUDED.education_status,
  verified_student = EXCLUDED.verified_student,
  date_of_birth = EXCLUDED.date_of_birth,
  deleted_at = NULL;
INSERT INTO identity.accounts (id, email)
VALUES ('parity-kemi', 'kemi@example.com')
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
INSERT INTO users.profiles (
  id, username, display_name, school_id, school_name, education_status, verified_student, date_of_birth
)
VALUES ('parity-kemi', 'kemi-obi', 'Kemi Obi', 'unilag', 'University of Lagos', 'student', false, '2001-07-22')
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  display_name = EXCLUDED.display_name,
  school_id = EXCLUDED.school_id,
  school_name = EXCLUDED.school_name,
  education_status = EXCLUDED.education_status,
  verified_student = EXCLUDED.verified_student,
  date_of_birth = EXCLUDED.date_of_birth,
  deleted_at = NULL;
INSERT INTO communities.communities (id, slug, name, blurb, category, school_name, avatar)
VALUES ('parity-community', 'parity-community', 'Parity Community', 'Parity fixture', 'Web2', 'FUT Minna', 'PC')
ON CONFLICT (id) DO UPDATE SET deleted_at = NULL;
INSERT INTO communities.memberships (community_id, user_id, role)
VALUES ('parity-community', 'parity-login', 'owner'), ('parity-community', 'parity-tunde', 'member')
ON CONFLICT (community_id, user_id) DO UPDATE SET role = EXCLUDED.role;
INSERT INTO assets.assets (id, community_id, catalog_key, name, slug, kind, category, is_default)
VALUES ('parity-asset', 'parity-community', 'general', 'General', 'general', 'chat', 'Community', true)
ON CONFLICT (id) DO UPDATE SET deleted_at = NULL;
INSERT INTO chat.messages (id, asset_id, author_id, body, content, seq)
SELECT 'parity-chat-' || sequence, 'parity-asset', 'parity-tunde', 'Unread parity message', 'Unread parity message', sequence
FROM generate_series(1, 18) AS sequence
ON CONFLICT (id) DO NOTHING;
INSERT INTO chat.read_cursors (asset_id, user_id, seq)
VALUES ('parity-asset', 'parity-login', 0)
ON CONFLICT (asset_id, user_id) DO UPDATE SET seq = 0;
INSERT INTO chat.mentions (id, message_id, user_id, asset_id)
SELECT 'parity-chat-mention-' || sequence, 'parity-chat-' || sequence, 'parity-login', 'parity-asset'
FROM generate_series(16, 18) AS sequence
ON CONFLICT (message_id, user_id) DO NOTHING;
INSERT INTO dm.conversations (id, pair_key)
VALUES ('parity-dm', 'parity-login:parity-tunde')
ON CONFLICT (id) DO NOTHING;
INSERT INTO dm.participants (conversation_id, user_id)
VALUES ('parity-dm', 'parity-login'), ('parity-dm', 'parity-tunde')
ON CONFLICT (conversation_id, user_id) DO NOTHING;
INSERT INTO dm.messages (id, conversation_id, sender_id, content, author_id, body, seq)
SELECT 'parity-dm-message-' || sequence, 'parity-dm', 'parity-tunde', 'Unread parity DM',
       'parity-tunde', 'Unread parity DM', sequence
FROM generate_series(1, 5) AS sequence
ON CONFLICT (id) DO NOTHING;
INSERT INTO dm.read_cursors (conversation_id, user_id, seq)
VALUES ('parity-dm', 'parity-login', 0)
ON CONFLICT (conversation_id, user_id) DO UPDATE SET seq = 0;
INSERT INTO dm.mentions (id, message_id, user_id, conversation_id)
SELECT 'parity-dm-mention-' || sequence, 'parity-dm-message-' || sequence, 'parity-login', 'parity-dm'
FROM generate_series(3, 5) AS sequence
ON CONFLICT (message_id, user_id) DO NOTHING;
COMMIT;`;

function compose(args, environment = process.env) {
  const result = spawnSync("docker", [...composeArgs, ...args], {
    cwd: root,
    env: environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function testEnvironment() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    ...process.env,
    NODE_ENV: "test",
    GATEWAY_HOST_PORT: "4400",
    POSTGRES_HOST_PORT: "55432",
    REDIS_HOST_PORT: "56379",
    AUTH_TEST_MODE: "true",
    AUTH_CODE_PEPPER: "parity-only-auth-code-pepper-32",
    JWT_PUBLIC_KEY: publicKey.export({ type: "spki", format: "pem" }).toString(),
    JWT_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

async function waitForReadiness() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:4400/readyz");
      if (response.ok) return;
    } catch {
      // The gateway may still be starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }
  throw new Error("Gateway did not become ready at http://127.0.0.1:4400/readyz within 120 seconds");
}

async function startBackend(reset) {
  if (reset) compose(["down", "--volumes"]);
  compose(["up", "--detach", "--build"], testEnvironment());
  await waitForReadiness();
  compose([
    "exec", "--no-TTY", "postgres", "psql",
    "-v", "ON_ERROR_STOP=1",
    "-U", "square",
    "-d", "square",
    "-c", seedSql,
  ]);
}

const operation = process.argv[2];
if (operation === "up") {
  await startBackend(false);
} else if (operation === "reset") {
  await startBackend(true);
} else if (operation === "down") {
  compose(["down"]);
} else {
  throw new Error("Usage: node scripts/parity-backend.mjs <up|reset|down>");
}
