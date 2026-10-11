import { expect, test } from "@playwright/test";
import { mockApi } from "./mockApi";

test.describe("Mobile navigation", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test.beforeEach(async ({ page }) => {
    await mockApi(page, { authenticated: true });
  });

  test("shows a 5-tab bottom nav with ≥48px targets and hides the desktop links", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation", { name: "เมนูด้านล่าง" });
    await expect(nav).toBeVisible();
    await expect(page.getByRole("navigation", { name: "เมนูหลัก", exact: true })).toBeHidden();

    const links = nav.getByRole("link");
    await expect(links).toHaveCount(5);
    await expect(links).toHaveText(["หน้าแรก", "ชุมชน", "แจ้งซ่อม", "ของหาย", "ฉัน"]);

    for (let i = 0; i < 5; i++) {
      const box = await links.nth(i).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(48);
    }

    await expect(nav.getByRole("link", { name: "หน้าแรก" })).toHaveAttribute("aria-current", "page");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0); // no horizontal scroll on phones
  });

  test("navigates between tabs", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation", { name: "เมนูด้านล่าง" });
    await nav.getByRole("link", { name: "แจ้งซ่อม" }).tap();
    await expect(page).toHaveURL(/\/repairs$/);
    await expect(nav.getByRole("link", { name: "แจ้งซ่อม" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 1, name: "แจ้งซ่อม" })).toBeVisible();

    await nav.getByRole("link", { name: "ฉัน" }).tap();
    await expect(page).toHaveURL(/\/profile$/);
  });

  test("the accessible mobile menu opens and closes with Escape", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "เปิดเมนู" }).tap();
    const menu = page.getByRole("dialog", { name: "เมนูหลัก" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("link", { name: "ชุมชน" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "ประวัติโพสต์" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("desktop shows the centred top navigation instead", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/dashboard");
    await expect(page.getByRole("navigation", { name: "เมนูด้านล่าง" })).toBeHidden();
    const top = page.getByRole("navigation", { name: "เมนูหลัก", exact: true });
    await expect(top).toBeVisible();
    await expect(top.getByRole("link")).toHaveText(["หน้าแรก", "ชุมชน", "แจ้งซ่อม", "ของหาย & พบของ", "ปฏิทิน"]);
    await expect(top.getByRole("link", { name: "หน้าแรก" })).toHaveAttribute("aria-current", "page");
  });
});
