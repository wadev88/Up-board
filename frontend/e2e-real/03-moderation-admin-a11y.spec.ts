import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, API, DEMO, apiToken, createVerifiedStudent, login, unique } from "./helpers";

test.describe("Moderation (real backend)", () => {
  test("user reports a post → admin removes the content → reporter follows it under my reports", async ({ browser, request }) => {
    const title = unique("E2E โพสต์ที่จะถูกรายงาน");
    const authorToken = await apiToken(request, DEMO.student);
    const categories = await (await request.get(`${API}/categories`, { headers: { Authorization: `Bearer ${authorToken}` } })).json();
    const post = await (
      await request.post(`${API}/posts`, {
        headers: { Authorization: `Bearer ${authorToken}` },
        data: { type: "general", title, content: "เนื้อหาสแปม", category_id: categories.find((c: { slug: string }) => c.slug === "general").id },
      })
    ).json();

    // reporter files a report from the post page
    const reporterAccount = await createVerifiedStudent(request);
    const reporter = await (await browser.newContext()).newPage();
    await login(reporter, reporterAccount.email, reporterAccount.password);
    await reporter.goto(`/posts/${post.id}`);
    await reporter.getByRole("button", { name: "ตัวเลือกเพิ่มเติมของโพสต์" }).click();
    await reporter.getByRole("menuitem", { name: /รายงาน/ }).click();
    const dialog = reporter.getByRole("dialog");
    await dialog.getByLabel("สแปม / โฆษณา").check();
    await dialog.getByRole("button", { name: /รายงาน|ส่ง/ }).last().click();
    await expect(reporter.getByText("ส่งรายงานแล้ว ขอบคุณที่ช่วยดูแลชุมชน")).toBeVisible();

    // admin works the report through the state machine in the drawer
    const admin = await (await browser.newContext()).newPage();
    await login(admin, ADMIN_EMAIL, ADMIN_PASSWORD);
    await admin.goto("/admin/reports");
    await admin.getByLabel("สถานะ").selectOption({ label: "ทั้งหมด" }); // default view = new reports only
    // exactly two actions: remove the content, or close without removing it
    await admin.getByRole("row").filter({ hasText: title }).getByRole("button", { name: /ตรวจสอบรายงาน/ }).click();
    const drawer = admin.getByRole("dialog");
    await expect(drawer.getByRole("button", { name: "ลบเนื้อหา", exact: true })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "ปิดรายงาน (ไม่ลบเนื้อหา)" })).toBeVisible();
    await drawer.getByRole("button", { name: "ลบเนื้อหา", exact: true }).click();
    await admin.getByRole("alertdialog").getByRole("button", { name: "ลบเนื้อหา" }).click();
    await expect(admin.getByText(/เปลี่ยนสถานะรายงานเป็น/).last()).toBeVisible();
    await expect(admin.getByRole("dialog")).toHaveCount(0);
    const adminToken = await apiToken(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const reports = await (await request.get(`${API}/reports?status=content_removed`, { headers: { Authorization: `Bearer ${adminToken}` } })).json();
    const closed = reports.items.find((r: { post: { id: number } }) => r.post.id === post.id);
    expect(closed.actions.map((a: { to_status: string }) => a.to_status)).toEqual(["content_removed"]);
    expect(closed.post.status).toBe("removed");

    // the reporter follows the outcome on /reports
    await reporter.goto("/reports");
    await expect(reporter.getByRole("link", { name: new RegExp(title) })).toContainText("ลบเนื้อหาแล้ว");

    // the post is gone for everyone
    await reporter.goto(`/posts/${post.id}`);
    await expect(reporter.getByText(/ไม่พบ/).first()).toBeVisible();
    const after = await request.get(`${API}/posts/${post.id}`, { headers: { Authorization: `Bearer ${authorToken}` } });
    expect(after.status()).toBe(404);
    await reporter.context().close();
    await admin.context().close();
  });
});

test.describe("RBAC in the UI (real backend)", () => {
  for (const [role, email] of [
    ["student", DEMO.student],
    ["teacher", DEMO.teacher],
    ["building_staff", DEMO.facilities],
  ] as const) {
    test(`${role} is shown a 403 page on /admin and the API refuses`, async ({ page, request }) => {
      await login(page, email);
      await page.goto("/admin/users");
      await expect(page.getByText("ไม่มีสิทธิ์เข้าถึง (403)")).toBeVisible();
      const token = await apiToken(request, email);
      const response = await request.get(`${API}/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
      expect(response.status()).toBe(403);
    });
  }

  test("admin grants student_club; the role change revokes the old session", async ({ browser, request }) => {
    const account = await createVerifiedStudent(request);
    const userPage = await (await browser.newContext()).newPage();
    await login(userPage, account.email, account.password);
    const oldToken = await apiToken(request, account.email, account.password);

    const admin = await (await browser.newContext()).newPage();
    await login(admin, ADMIN_EMAIL, ADMIN_PASSWORD);
    await admin.goto(`/admin/users`);
    await admin.getByPlaceholder("ค้นหาชื่อหรืออีเมล…").fill(account.email);
    await admin.getByRole("button", { name: /แก้ไข ผู้ชม E2E/ }).first().click();
    const sheet = admin.getByRole("dialog");
    await sheet.getByLabel("บทบาท").selectOption({ label: "ชมรม / สโมสรนิสิต" });
    await sheet.getByRole("button", { name: /บันทึก/ }).click();
    await expect(
      admin.getByRole("row").filter({ hasText: account.email }).getByText("ชมรม / สโมสรนิสิต"),
    ).toBeVisible();

    const me = await request.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${oldToken}` } });
    expect(me.status()).toBe(401); // token_version bumped
    const fresh = await apiToken(request, account.email, account.password);
    const meAgain = await (await request.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${fresh}` } })).json();
    expect(meAgain.role).toBe("student_club");
    await userPage.context().close();
    await admin.context().close();
  });
});

test.describe("Accessibility on real data (axe, WCAG 2.1 A/AA)", () => {
  const pages = ["/dashboard", "/posts", "/posts/new?type=general", "/repairs", "/repairs/new", "/lost-found", "/notifications", "/profile"];
  // one login per test: the per-account login limit (10/min) is part of the system under test
  test("student pages have no serious/critical violations @mobile", async ({ page }) => {
    await login(page, DEMO.student);
    const found: string[] = [];
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      for (const v of results.violations.filter((x) => x.impact === "serious" || x.impact === "critical")) {
        found.push(`${path} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
      }
    }
    expect(found).toEqual([]);
  });

  test("admin pages have no serious/critical violations", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    for (const path of ["/admin", "/admin/users", "/admin/reports", "/admin/catalog"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${path} ${v.id}: ${v.nodes.length}`)).toEqual([]);
    }
  });
});
