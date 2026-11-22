import { test, expect } from "@playwright/test";

test.use({ deviceScaleFactor: 3 });
import * as fs from "fs";
import * as zlib from "zlib";

const DPR = 3;
const CLIP = { x: 0, y: 0, width: 160, height: 160 };
const OUT_DIR = "/tmp/kilo/mobile-sheet";
const PHASE = process.env.PHASE || "dev";

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
];

const SCREENS = [
  { name: "home", path: "/home" },
  { name: "messages", path: "/dm" },
  { name: "community-assets", path: "/c/web3-club" },
  { name: "asset-page", path: "/c/web3-club/general" },
  { name: "profile", path: "/u/amaka-eze" },
];

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buf: Buffer): { width: number; height: number; data: Buffer } {
  if (!buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("not a PNG");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatParts: Buffer[] = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatParts.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`unsupported PNG: bitDepth=${bitDepth} colorType=${colorType}`);
  }
  const raw = zlib.inflateSync(Buffer.concat(idatParts));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const prev = y === 0 ? Buffer.alloc(stride) : out.subarray((y - 1) * stride, y * stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const x = raw[pos++];
      const left = i >= bpp ? cur[i - bpp] : 0;
      const up = prev[i];
      const upLeft = i >= bpp ? prev[i - bpp] : 0;
      let v: number;
      if (filter === 0) v = x;
      else if (filter === 1) v = (x + left) & 0xff;
      else if (filter === 2) v = (x + up) & 0xff;
      else if (filter === 3) v = (x + ((left + up) >> 1)) & 0xff;
      else v = (x + paeth(left, up, upLeft)) & 0xff;
      cur[i] = v;
    }
  }
  return { width, height, data: out };
}

function assertColor(img: { width: number; height: number; data: Buffer }, x: number, y: number, expected: number[]) {
  const idx = (y * img.width + x) * 4;
  const actual = [img.data[idx], img.data[idx + 1], img.data[idx + 2]];
  for (let c = 0; c < 3; c++) {
    expect(actual[c]).toBeGreaterThanOrEqual(expected[c] - 12);
    expect(actual[c]).toBeLessThanOrEqual(expected[c] + 12);
  }
}

test.describe("mobile sheet curved top-left corner", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([{ name: "sq_session", value: "test", url: "http://localhost:3100" }]);
    page.on("dialog", (d) => d.dismiss().catch(() => {}));
  });

  for (const vp of VIEWPORTS) {
    test.describe(`${vp.width}x${vp.height} @${DPR}x`, () => {
      for (const screen of SCREENS) {
        test(`${screen.name}: corner arc, computed styles, no horizontal overflow`, async ({ page }) => {
          await page.setViewportSize(vp);
          await page.goto(screen.path);
          await page.waitForLoadState("networkidle");
          await page.waitForSelector(".mobile-sheet-paper");
          await page.waitForSelector(".mobile-strip");

          // Computed style assertions on every screen.
          const styles = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) throw new Error("sheet not found");
            const cs = getComputedStyle(el);
            return { borderTopLeftRadius: cs.borderTopLeftRadius, overflow: cs.overflow };
          }, ".mobile-sheet-paper");
          expect(styles.borderTopLeftRadius).toBe("24px");
          expect(styles.overflow).toBe("hidden");

          const noOverflow = await page.evaluate(() => {
            const w = window.innerWidth;
            return { docScrollWidth: document.documentElement.scrollWidth, innerWidth: w, ok: document.documentElement.scrollWidth <= w + 2 };
          });
          expect(noOverflow.ok).toBe(true);

          // Screenshot the top-left corner region for evidence.
          const buffer = await page.screenshot({ clip: CLIP });
          fs.mkdirSync(OUT_DIR, { recursive: true });
          fs.writeFileSync(`${OUT_DIR}/${PHASE}-${screen.name}-${vp.width}x${vp.height}.png`, buffer);

          const img = decodePng(buffer);
          expect(img.width).toBe(CLIP.width * DPR);
          expect(img.height).toBe(CLIP.height * DPR);

          // Corner area outside the arc must show the strip color (#0B0D0B), never sheet bg.
          assertColor(img, Math.round(73 * DPR), Math.round(1 * DPR), [0x0b, 0x0d, 0x0b]);
          assertColor(img, Math.round(74 * DPR), Math.round(12 * DPR), [0x0b, 0x0d, 0x0b]);
          // Center of the 24px arc and a clearly-inside point must show sheet bg (#101410).
          assertColor(img, Math.round(96 * DPR), Math.round(24 * DPR), [0x10, 0x14, 0x10]);
          assertColor(img, Math.round(100 * DPR), Math.round(10 * DPR), [0x10, 0x14, 0x10]);
        });
      }
    });
  }
});
