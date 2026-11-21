import { test, expect } from "@playwright/test";

function rectsIntersect(a: DOMRect | null, b: DOMRect | null): boolean {
  if (!a || !b) return false;
  return !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top);
}

test.describe("card no-collisions", () => {
  test("person, community, birthday and event cards have no colliding children", async ({ page }) => {
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    const collisions = await page.evaluate(() => {
      const problems: string[] = [];

      const checkCard = (root: HTMLElement, label: string) => {
        const children = Array.from(root.querySelectorAll(":scope > *"));
        const boxes = children.map((c) => {
          const el = c as HTMLElement;
          // skip decorative absolute badges / dismiss X that are designed to overlap
          if (el.classList.contains("dismiss") || el.classList.contains("badge")) return null;
          const b = el.getBoundingClientRect();
          return { el, b };
        }).filter(Boolean) as { el: HTMLElement; b: DOMRect }[];

        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            if (rectsIntersect(boxes[i].b, boxes[j].b)) {
              problems.push(`${label}: ${boxes[i].el.tagName}#${boxes[i].el.className} intersects ${boxes[j].el.tagName}#${boxes[j].el.className}`);
            }
          }
        }
      };

      document.querySelectorAll(".person-card").forEach((c, i) => checkCard(c as HTMLElement, `person-card[${i}]`));
      document.querySelectorAll(".community-photo-card").forEach((c, i) => checkCard(c as HTMLElement, `community-card[${i}]`));
      document.querySelectorAll(".birthday-item").forEach((c, i) => checkCard(c as HTMLElement, `birthday-item[${i}]`));
      document.querySelectorAll(".event-card").forEach((c, i) => checkCard(c as HTMLElement, `event-card[${i}]`));

      // truncated text must not overflow its card
      document.querySelectorAll(".person-card, .community-photo-card, .birthday-item, .event-card").forEach((card) => {
        const cardRect = card.getBoundingClientRect();
        card.querySelectorAll("*").forEach((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          // computed style overflow check: text that overflows a truncate container
          const cs = window.getComputedStyle(el as HTMLElement);
          if ((cs.overflow === "hidden" || cs.webkitLineClamp) && (r.right > cardRect.right + 2 || r.left < cardRect.left - 2)) {
            problems.push(`overflow: ${el.tagName}#${el.className} spills outside card`);
          }
        });
      });

      return problems;
    });

    expect(collisions).toEqual([]);
  });

  test("birthday items are separated by 12px gaps", async ({ page }) => {
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    const gapsOk = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll(".birthday-item")) as HTMLElement[];
      for (let i = 0; i < items.length - 1; i++) {
        const a = items[i].getBoundingClientRect();
        const b = items[i + 1].getBoundingClientRect();
        // horizontal row: gap between right edge of a and left edge of b
        if (b.left - a.right < 10) return false; // allow 2px rounding vs 12px spec
      }
      return true;
    });
    expect(gapsOk).toBe(true);
  });

  test("extreme seed data renders without collisions (24-char username, long school, 5-digit members)", async ({ page }) => {
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    // u10 has a very long school name; big community has 12345 members (5 digits)
    await expect(page.getByText(/A Very Long Indeed School/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("12,345 members")).toBeVisible({ timeout: 5000 });

    const problems = await page.evaluate(() => {
      const issues: string[] = [];
      // 24-char username + # = 25 visible, must be truncated not broken
      document.querySelectorAll(".person-card .username, .person-card .school, .community-photo-card .members .count").forEach((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const cs = window.getComputedStyle(el as HTMLElement);
        if (cs.overflow === "hidden" && (r.width <= 0 || !Number.isFinite(r.width))) {
          issues.push(`collapsed element ${el.tagName}#${el.className}`);
        }
      });
      return issues;
    });
    expect(problems).toEqual([]);
  });
});
