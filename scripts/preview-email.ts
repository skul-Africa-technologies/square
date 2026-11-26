import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { verificationEmailHtml, verificationEmailText } from "../backend/gateway/src/emails/verification-code";

const outDir = resolve(__dirname, "preview");
mkdirSync(outDir, { recursive: true });

const data = {
  code: "123456",
  email: "ada@school.edu",
  expiresInMinutes: 10,
  assetBaseUrl: "http://localhost:3000",
};

const html = verificationEmailHtml(data);
const text = verificationEmailText(data);

writeFileSync(resolve(outDir, "verification-code.html"), html, "utf8");
writeFileSync(resolve(outDir, "verification-code.txt"), text, "utf8");

console.log(`wrote ${resolve(outDir, "verification-code.html")} (${Buffer.byteLength(html)} bytes)`);
console.log(`wrote ${resolve(outDir, "verification-code.txt")} (${Buffer.byteLength(text)} bytes)`);