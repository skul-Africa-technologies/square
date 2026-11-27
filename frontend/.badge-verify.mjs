import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:3000";
const VIEWPORTS = [[320, 568], [360, 740], [390, 844]];
const browser = await chromium.launch();
let allPass = true;

const evalBadges = () => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const badges = [...document.querySelectorAll(".badge-corner > span, [data-testid=unread-badge]")];
  const clipAncestor = (el) => {
    let p = el.parentElement;
    while (p) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)) return p;
      p = p.parentElement;
    }
    return null;
  };
  const inter = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const contain = (a, b) => a.left >= b.left - 0.5 && a.top >= b.top - 0.5 && a.right <= b.right + 0.5 && a.bottom <= b.bottom + 0.5;
  const bad = [];
  for (const b of badges) {
    const r = b.getBoundingClientRect();
    const anc = clipAncestor(b);
    if (anc) {
      const ar = anc.getBoundingClientRect();
      // only consider badges that intersect the clipping box (visible area)
      if (inter(r, ar) && !contain(r, ar)) bad.push({ reason: "clipped-by-ancestor", text: b.textContent, anc: anc.className.slice(0, 30) });
    } else {
      // no clip ancestor (e.g. header icon): must be in viewport
      if (!(r.left >= -0.5 && r.top >= -0.5 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5)) bad.push({ reason: "out-of-viewport", text: b.textContent });
    }
  }
  return { count: badges.length, bad };
};

for (const [vw, vh] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
  await ctx.request.post(`${BASE}/api/session`, { data: { userId: "me" } });
  const page = await ctx.newPage();
  for (const route of ["/messages", "/home"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    let res = await page.evaluate(evalBadges);
    // scroll the Recent scroller to both ends and re-check first/last items
    const scroller = page.locator(".overflow-x-auto").first();
    if (await scroller.count()) {
      await scroller.evaluate((el) => (el.scrollLeft = 0));
      await page.waitForTimeout(150);
      res = await page.evaluate(evalBadges);
      await scroller.evaluate((el) => (el.scrollLeft = el.scrollWidth));
      await page.waitForTimeout(150);
      const resEnd = await page.evaluate(evalBadges);
      res.bad = res.bad.concat(resEnd.bad);
    }
    const ok = res.bad.length === 0;
    if (!ok) allPass = false;
    console.log(`${ok ? "PASS" : "FAIL"} ${vw}x${vh} ${route} badges=${res.count} bad=${JSON.stringify(res.bad)}`);
    await page.screenshot({ path: `/tmp/kilo/badge-${vw}-${route.replace(/\//g, "_")}.png` });
  }
  await ctx.close();
}
await browser.close();
console.log(allPass ? "\nALL PASS" : "\nSOME FAILED");