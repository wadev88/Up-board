import { expect, test } from "@playwright/test";
import { API, DEMO, PNG_1x1, apiToken, login, unique, verifyEmailAsAdmin } from "./helpers";

test.describe("Authentication (real backend)", () => {
  test("register (faculty + program) with @up.ac.th → admin verifies (Google sign-in stand-in) → login → logout", async ({ page, request }) => {
    const email = `${Date.now()}@up.ac.th`; // numeric like a student id → student
    await page.goto("/register");
    await page.getByLabel("อีเมลมหาวิทยาลัย").fill(email);
    await page.getByLabel("ชื่อที่แสดง").fill("นิสิต E2E");
    await page.getByLabel("คณะ").selectOption({ label: "คณะเทคโนโลยีสารสนเทศและการสื่อสาร" });
    await expect(page.getByLabel("สาขาวิชา")).toBeEnabled();
    await page.getByLabel("สาขาวิชา").selectOption({ index: 1 });
    const passwords = page.locator('input[type="password"]');
    await passwords.nth(0).fill("E2eSecret123");
    await passwords.nth(1).fill("E2eSecret123");
    await page.getByRole("button", { name: /สมัคร/ }).click();
    // no email is sent: the success screen sends the user to Google (@up.ac.th) to verify
    await expect(page.getByRole("heading", { name: "สมัครสมาชิกสำเร็จ" })).toBeVisible();
    await expect(page.getByText(/ยืนยันอีเมลโดยเข้าสู่ระบบด้วย Google/)).toBeVisible();
    await expect(page.getByRole("link", { name: "ไปหน้าเข้าสู่ระบบ" })).toBeVisible();

    // password login before the email is verified is refused (the suite has no Google account)
    await page.goto("/login");
    await page.getByLabel("อีเมลมหาวิทยาลัย").fill(email);
    await page.locator('input[type="password"]').fill("E2eSecret123");
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "ยังไม่ได้ยืนยันอีเมล" })).toBeVisible();

    // support path: an admin verifies the email, then the password login works
    await verifyEmailAsAdmin(request, email);

    await page.goto("/login");
    await page.getByLabel("อีเมลมหาวิทยาลัย").fill(email);
    await page.locator('input[type="password"]').fill("E2eSecret123");
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
    // registration already collected faculty + program: straight to the dashboard, no onboarding
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /นิสิต E2E/ })).toBeVisible();
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/dashboard/);

    // session survives a full reload (httpOnly refresh cookie), then logout ends it
    await page.reload();
    await expect(page.getByRole("heading", { name: /นิสิต E2E/ })).toBeVisible();
    await page.goto("/profile");
    // faculty, program and contacts are self-service (no admin needed)
    await page.getByRole("button", { name: "แก้ไขโปรไฟล์" }).click();
    await page.getByLabel("สาขาวิชา").selectOption({ index: 2 });
    await page.getByLabel("LINE").fill("e2e-line-id");
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(page.getByTestId("contact-list").getByText("e2e-line-id")).toBeVisible();
    await page.getByRole("button", { name: "ออกจากระบบ" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("non-@up.ac.th email is rejected by the form", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("อีเมลมหาวิทยาลัย").fill("someone@gmail.com");
    await page.getByRole("button", { name: /สมัคร/ }).click();
    await expect(page.getByText(/@up\.ac\.th/).first()).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
  });
});

test.describe("Posts (real backend)", () => {
  test("student creates a post with an image; it shows on the dashboard and in its category", async ({ page }) => {
    const title = unique("E2E ร้านกาแฟใหม่");
    await login(page, DEMO.student);
    await page.goto("/posts/new?type=general");
    await page.getByLabel("หัวข้อ").fill(title);
    await page.getByLabel("รายละเอียด").fill("กาแฟอร่อย ราคานิสิต");
    await page.locator('input[type="file"]').setInputFiles({ name: "cafe.png", mimeType: "image/png", buffer: PNG_1x1 });
    await expect(page.getByRole("img").first()).toBeVisible();
    await page.getByRole("button", { name: "เผยแพร่โพสต์" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.locator(`img[src*="/files/"]`).first()).toBeVisible();

    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: new RegExp(title) }).first()).toBeVisible();
    await page.goto("/posts?category=general");
    await expect(page.getByText(title)).toBeVisible();
  });

  test("profanity is blocked with a field error", async ({ page }) => {
    await login(page, DEMO.student);
    await page.goto("/posts/new?type=general");
    await page.getByLabel("หัวข้อ").fill("ทดสอบคำหยาบ");
    await page.getByLabel("รายละเอียด").fill("ไอ้ควายเอ้ย");
    await page.getByRole("button", { name: "เผยแพร่โพสต์" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "พบคำไม่สุภาพ" }).first()).toBeVisible();
    await expect(page.getByLabel("รายละเอียด")).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(/\/posts\/new/);
  });

  test("students cannot see priority or pin; a club account pins its own event for a chosen duration", async ({ page, request }) => {
    const title = unique("E2E กิจกรรมชมรม");
    const clubToken = await apiToken(request, DEMO.club);
    const headers = { Authorization: `Bearer ${clubToken}` };
    const categories = await (await request.get(`${API}/categories`, { headers })).json();
    const general = categories.find((c: { slug: string }) => c.slug === "general");
    const activities = categories.find((c: { slug: string }) => c.slug === "activities");
    // clubs post general posts and events, never announcements
    const refused = await request.post(`${API}/posts`, {
      headers,
      data: { type: "announcement", title, content: "รายละเอียด", category_id: general.id },
    });
    expect(refused.status()).toBe(403);
    const starts = new Date(Date.now() + 2 * 24 * 3600_000); // pinning is allowed until the event starts
    const created = await request.post(`${API}/posts`, {
      headers,
      data: {
        type: "event",
        title,
        content: "รายละเอียด",
        category_id: activities.id,
        event: {
          starts_at: starts.toISOString(),
          ends_at: new Date(starts.getTime() + 2 * 3600_000).toISOString(),
        },
      },
    });
    expect(created.status()).toBe(201);
    expect((await created.json()).event.priority_level).toBe("department");
    const post = await created.json();

    await login(page, DEMO.student);
    await page.goto("/posts/new?type=general");
    // only building staff / admin choose a priority
    await expect(page.getByLabel("ความสำคัญ")).toHaveCount(0);
    // students may create general posts, repairs and lost & found only (type popup)
    await page.goto("/dashboard");
    await page.getByTestId("create-post-fab").click();
    const picker = page.getByRole("dialog", { name: "สร้างโพสต์" });
    await expect(picker.getByTestId("post-type-announcement")).toHaveCount(0);
    await expect(picker.getByTestId("post-type-event")).toHaveCount(0);
    await expect(picker.locator('[data-testid^="post-type-"]')).toHaveCount(3);
    await page.keyboard.press("Escape");
    await page.goto(`/posts/${post.id}`);
    await page.getByRole("button", { name: "ตัวเลือกเพิ่มเติมของโพสต์" }).click();
    await expect(page.getByRole("menuitem", { name: /ปักหมุด/ })).toHaveCount(0);
    const studentToken = await apiToken(request, DEMO.student);
    const forbidden = await request.post(`${API}/posts/${post.id}/pin`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(forbidden.status()).toBe(403); // the API refuses even without the UI

    await page.context().clearCookies();
    await login(page, DEMO.club);
    await page.goto(`/posts/${post.id}`);
    await page.getByRole("button", { name: "ตัวเลือกเพิ่มเติมของโพสต์" }).click();
    await page.getByRole("menuitem", { name: /ปักหมุด/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("radio", { name: "48 ชม." })).toHaveAttribute("aria-checked", "true"); // default
    await dialog.getByRole("radio", { name: "24 ชม." }).click();
    const pinResponse = page.waitForResponse(
      (r) => r.url().endsWith(`/posts/${post.id}/pin`) && r.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "ปักหมุด" }).click();
    const pinned = await pinResponse;
    expect(pinned.status()).toBe(200);
    expect((await pinned.json()).is_pinned).toBe(true);

    await page.goto("/dashboard");
    await expect(page.getByRole("region", { name: /ปักหมุด/ }).getByText(title)).toBeVisible();
    await request.delete(`${API}/posts/${post.id}/pin`, { headers });
  });

  test("a club's event needs an end after its start; it is listed as upcoming and kept in history", async ({ page }) => {
    const title = unique("E2E กิจกรรมชมรม");
    await login(page, DEMO.club);
    await page.goto("/posts/new?type=event");
    await page.getByLabel("หัวข้อ").fill(title);
    await page.getByLabel("รายละเอียด").fill("ขอเชิญนิสิตทุกชั้นปี");
    const start = new Date(Date.now() + 2 * 24 * 3600_000);
    const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    await page.getByLabel("เริ่ม").fill(local(start));
    await page.getByRole("button", { name: "เผยแพร่โพสต์" }).click();
    await expect(page.getByText("กรุณาระบุวันเวลาสิ้นสุดกิจกรรม")).toBeVisible();
    await page.getByLabel("สิ้นสุด").fill(local(new Date(start.getTime() + 2 * 3600_000)));
    // club accounts cannot choose the level: it is always department / club level
    await expect(page.getByText("ระดับความสำคัญ: ระดับสาขา / ชมรม")).toBeVisible();
    await page.getByRole("button", { name: "เผยแพร่โพสต์" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("ระดับสาขา / ชมรม").first()).toBeVisible();

    await page.goto("/posts?type=event");
    await expect(page.getByRole("link", { name: title })).toBeVisible();
    await page.goto("/profile");
    await expect(page.getByRole("region", { name: "ประวัติโพสต์" }).getByText(title)).toBeVisible();
  });
});
