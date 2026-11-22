import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sourcePath = require.resolve("unicode-emoji-json/data-by-emoji.json");
const rows = await import(sourcePath, { with: { type: "json" } });
const emojis = Object.keys(rows.default).sort();
const generated = `// Generated from unicode-emoji-json 0.9.0 (Unicode RGI emoji data).\nexport const RGI_BASE_EMOJI = new Set([\n${emojis.map(emoji => `  ${JSON.stringify(emoji)},`).join("\n")}\n]);\n`;
const outputPath = resolve(fileURLToPath(new URL(".", import.meta.url)), "../src/emojiAllowlist.ts");
await writeFile(outputPath, generated);
