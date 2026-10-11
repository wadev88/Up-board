import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fulfillJson, mockApi } from "./mockApi";

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { authenticated: false });
  });

  test("has no WCAG 2.1 A/AA violations (axe)", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "เข้าสู่ระบบ" })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("labelled controls, skip link and @up.ac.th validation", async ({ page }) => {
    await page.goto("/login");
    const email = page.getByLabel("อีเมลมหาวิทยาลัย");
    const password = page.getByLabel("รหัสผ่าน");
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "ข้ามไปยังเนื้อหาหลัก" })).toBeFocused();

    await email.fill("someone@gmail.com");
    await password.fill("password123");
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
    await expect(page.getByText(/ลงท้ายด้วย @up\.ac\.th/)).toBeVisible();
    await expect(email).toHaveAttribute("aria-invalid", "true");
  });

  test("EMAIL_NOT_VERIFIED tells the user to verify with Google", async ({ page }) => {
    await mockApi(page, {
      authenticated: false,
      overrides: {
        "POST /auth/login": (route) =>
          fulfillJson(route, 403, { error: { code: "EMAIL_NOT_VERIFIED", message: "not verified" } }),
      },
    });
    await page.goto("/login");
    await page.getByLabel("อีเมลมหาวิทยาลัย").fill("65000001@up.ac.th");
    await page.getByLabel("รหัสผ่าน").fill("password123");
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
    const alert = page.getByRole("alert").filter({ hasText: "ยังไม่ได้ยืนยันอีเมล" });
    await expect(alert).toContainText("เข้าสู่ระบบด้วย Google (@up.ac.th) ครั้งแรก");
    await expect(page.getByRole("button", { name: /ส่งอีเมลยืนยัน/ })).toHaveCount(0);
  });

  test("new users are told sign-up is closed when password sign-up is off", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByText(/ปิดรับสมัครสมาชิกด้วยตนเอง/)).toBeVisible();
    await expect(page.getByLabel("รหัสผ่าน")).toHaveCount(0);
  });

  test("a rejected Google sign-in explains the @up.ac.th rule and creates no session", async ({ page }) => {
    await page.goto("/auth/callback?error=access_denied&error_description=Email+domain+not+allowed");
    await expect(page.getByRole("alert").filter({ hasText: "Google" })).toContainText("@up.ac.th");
    await page.getByRole("link", { name: "กลับไปหน้าเข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated visit to a protected page redirects to /login?next=", async ({ page }) => {
    await page.goto("/repairs");
    await expect(page).toHaveURL(/\/login\?next=%2Frepairs/);
  });
});
