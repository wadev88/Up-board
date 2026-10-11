import { expect, test } from "@playwright/test";
import { emptyDashboard, fulfillJson, mockApi, post, user } from "./mockApi";

const HOUR = 3600_000;

test.describe("Home (dashboard)", () => {
  test("hero with working quick actions, then Pinned → Upcoming events → Repairs → Lost & found → Recent", async ({ page }) => {
    const soon = Date.now() + 2 * 24 * HOUR;
    await mockApi(page, {
      authenticated: true,
      overrides: {
        "GET /dashboard": (route) =>
          fulfillJson(route, 200, {
            pinned: [
              post(1, "กิจกรรมชมรมปักหมุด", {
                is_pinned: true,
                pinned_at: new Date().toISOString(),
                pinned_until: new Date(Date.now() + 24 * HOUR).toISOString(),
              }),
            ],
            upcoming: [
              post(3, "งานวันวิชาการ", {
                type: "event",
                event: {
                  starts_at: new Date(soon).toISOString(),
                  ends_at: new Date(soon + 3 * HOUR).toISOString(),
                  venue: "หอประชุม",
                  priority_level: "university",
                },
              }),
            ],
            recent: [post(4, "โพสต์ล่าสุด", { priority: "urgent" })],
            repairs: [
              post(5, "ไฟทางเดินดับ", {
                type: "repair",
                repair: {
                  location: "อาคาร ICT",
                  status: "in_progress",
                  is_assigned: true,
                  updated_at: new Date().toISOString(),
                  latitude: null,
                  longitude: null,
                  technician: null,
                  history: [],
                },
              }),
            ],
            lost_found: [
              post(6, "กระเป๋าสตางค์หาย", {
                type: "lost_found",
                lost_found: { location: "โรงอาหาร", status: "lost", occurred_at: null, updated_at: new Date().toISOString() },
              }),
            ],
            generated_at: new Date().toISOString(),
          }),
      },
    });

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: /ยินดีต้อนรับสู่ UP Board/ })).toBeVisible();
    const shortcuts = page.getByRole("navigation", { name: "ทางลัด" });
    await expect(shortcuts.getByRole("link")).toHaveText([
      "ประกาศ",
      "ปฏิทินกิจกรรม",
      "แจ้งเหตุ / แจ้งซ่อม",
      "ของหาย & พบของ",
    ]);
    await expect(shortcuts.getByRole("link", { name: "แจ้งเหตุ / แจ้งซ่อม" })).toHaveAttribute(
      "href",
      "/repairs/new",
    );

    const sections = page.locator('[data-testid^="dashboard-section-"]');
    await expect(sections).toHaveCount(5);
    const ids = await sections.evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(ids).toEqual([
      "dashboard-section-pinned",
      "dashboard-section-upcoming",
      "dashboard-section-repairs",
      "dashboard-section-lost-found",
      "dashboard-section-recent",
    ]);

    const pinned = page.getByTestId("dashboard-section-pinned");
    await expect(pinned.getByRole("link", { name: "กิจกรรมชมรมปักหมุด" })).toBeVisible();
    await expect(pinned.getByTestId("pin-badge")).toBeVisible();
    const upcoming = page.getByTestId("dashboard-section-upcoming");
    await expect(upcoming.getByTestId("type-badge")).toHaveText("กิจกรรม");
    await expect(upcoming.getByTestId("event-priority-badge")).toHaveText("ระดับมหาวิทยาลัย");
    await expect(page.getByTestId("dashboard-section-recent").getByTestId("priority-badge")).toContainText("ด่วนมาก");
    await expect(page.getByTestId("dashboard-section-repairs").getByRole("link", { name: "ไฟทางเดินดับ" })).toBeVisible();
    await expect(page.getByTestId("dashboard-section-repairs")).toContainText("กำลังดำเนินการ");
    await expect(page.getByTestId("dashboard-section-lost-found").getByRole("link", { name: "กระเป๋าสตางค์หาย" })).toBeVisible();
  });

  test("floating create-post button opens the post type popup; gone on create pages; no create button in the top bar", async ({ page }) => {
    await mockApi(page, { authenticated: true });
    await page.goto("/dashboard");
    const fab = page.getByTestId("create-post-fab");
    await expect(fab).toBeVisible();
    await expect(page.locator("header").getByRole("link", { name: "สร้างโพสต์" })).toHaveCount(0);
    await fab.click();
    // a student can create general posts, repairs and lost & found only
    const picker = page.getByRole("dialog", { name: "สร้างโพสต์" });
    await expect(picker).toBeVisible();
    await expect(picker.locator('[data-testid^="post-type-"]')).toHaveText([/ทั่วไป/, /แจ้งซ่อม/, /ของหาย/]);
    await expect(picker.getByRole("button", { name: "ปิด" })).toBeVisible();
    await expect(picker.getByTestId("post-type-announcement")).toHaveCount(0);
    await expect(picker.getByTestId("post-type-event")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    await fab.click();
    await page.getByTestId("post-type-general").click();
    await expect(page).toHaveURL(/\/posts\/new\?type=general$/);
    await expect(page.getByTestId("create-post-fab")).toHaveCount(0);
    // the form does not ask for the type again and offers no priority to a student
    await expect(page.getByRole("radiogroup", { name: "ประเภทโพสต์" })).toHaveCount(0);
    await expect(page.getByLabel("ความสำคัญ")).toHaveCount(0);
    await page.goto("/repairs/new");
    await expect(page.getByTestId("create-post-fab")).toHaveCount(0);
    // a direct visit without ?type= opens the same popup
    await page.goto("/posts/new");
    await expect(page.getByRole("dialog", { name: "สร้างโพสต์" })).toBeVisible();
  });

  test("calendar shows events on their day and lists them when the day is tapped", async ({ page }) => {
    const start = new Date();
    start.setHours(10, 0, 0, 0);
    await mockApi(page, {
      authenticated: true,
      overrides: {
        "GET /events": (route) =>
          fulfillJson(route, 200, [
            post(30, "งานปฏิทินทดสอบ", {
              type: "event",
              event: {
                starts_at: start.toISOString(),
                ends_at: new Date(start.getTime() + 2 * HOUR).toISOString(),
                venue: "ลานกิจกรรม",
                priority_level: "faculty",
              },
            }),
          ]),
      },
    });
    await page.goto("/calendar");
    await expect(page.getByRole("heading", { level: 1, name: "ปฏิทินกิจกรรม" })).toBeVisible();
    await expect(page.getByRole("button", { name: "เดือนถัดไป" })).toBeVisible();
    // today is selected by default: its events are listed with a link to the post
    await expect(page.getByRole("link", { name: /งานปฏิทินทดสอบ/ })).toBeVisible();
    await expect(page.getByRole("grid", { name: "ปฏิทินกิจกรรม" }).getByRole("gridcell", { name: /มี 1 กิจกรรม/ })).toBeVisible();
  });

  test("feed tabs load each post type only when opened", async ({ page }) => {
    const seen: string[] = [];
    await mockApi(page, {
      authenticated: true,
      overrides: {
        "GET /posts": (route) => {
          const type = new URL(route.request().url()).searchParams.get("type") ?? "";
          seen.push(type);
          return fulfillJson(route, 200, {
            items: [post(9, `รายการ ${type}`, { type })],
            total: 1,
            page: 1,
            page_size: 6,
          });
        },
      },
    });
    await page.goto("/dashboard");
    const tabs = page.getByRole("tablist", { name: "ตัวกรองประเภทโพสต์" });
    await expect(tabs.getByRole("tab")).toHaveText(["ทั้งหมด", "ประกาศ", "กิจกรรม", "แจ้งซ่อม", "ของหาย & พบของ"]);
    expect(seen).toEqual([]);
    await tabs.getByRole("tab", { name: "กิจกรรม" }).click();
    await expect(page.getByRole("link", { name: "รายการ event" })).toBeVisible();
    expect(seen).toEqual(["event"]);
    await page.keyboard.press("ArrowLeft"); // roving focus between tabs
    await expect(tabs.getByRole("tab", { name: "ประกาศ" })).toBeFocused();
  });

  test("requests a single SSE ticket per page load", async ({ page }) => {
    let tickets = 0;
    await mockApi(page, {
      authenticated: true,
      overrides: {
        "POST /stream/ticket": (route) => {
          tickets += 1;
          return fulfillJson(route, 503, { error: { code: "UNAVAILABLE", message: "disabled in e2e" } });
        },
      },
    });
    await page.goto("/dashboard");
    await expect(page.getByText("ยังไม่มีโพสต์ใหม่ใน 24 ชั่วโมงที่ผ่านมา")).toBeVisible();
    await page.waitForTimeout(400);
    expect(tickets).toBe(1);
  });

  test("search navigates to /posts?q=", async ({ page }) => {
    await mockApi(page, { authenticated: true });
    await page.goto("/dashboard");
    await page.getByRole("searchbox", { name: "ค้นหาโพสต์" }).fill("ห้องสมุด");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/posts\?q=%E0%B8%AB/);
  });

  test("shows an error state with retry when the API fails", async ({ page }) => {
    let fail = true;
    await mockApi(page, {
      authenticated: true,
      overrides: {
        "GET /dashboard": (route) =>
          fail
            ? fulfillJson(route, 500, { error: { code: "INTERNAL", message: "boom" } })
            : fulfillJson(route, 200, emptyDashboard()),
      },
    });
    await page.goto("/dashboard");
    // 5xx responses are retried twice by TanStack Query before the error state is shown
    const retry = page.getByRole("button", { name: "ลองอีกครั้ง" });
    await expect(retry).toBeVisible({ timeout: 20_000 });
    fail = false;
    await retry.click();
    await expect(page.getByText("ยังไม่มีกิจกรรมที่กำลังจะมาถึง")).toBeVisible();
    await expect(page.getByTestId("dashboard-section-pinned")).toHaveCount(0);
  });

  test("a suspended user sees when they can post again and Create Post is disabled", async ({ page }) => {
    const until = new Date(Date.now() + 5 * 24 * HOUR).toISOString();
    const startsAt = new Date(Date.now() - HOUR).toISOString();
    await mockApi(page, {
      authenticated: true,
      me: {
        ...user,
        posting_suspended_until: until,
        suspension: { starts_at: startsAt, last_day: until.slice(0, 10), ends_at: until },
      },
    });
    await page.goto("/posts/new?type=general");
    await expect(page.getByTestId("suspension-notice").first()).toContainText("โพสต์ได้อีกครั้ง");
    await expect(page.getByRole("button", { name: "เผยแพร่โพสต์" })).toBeDisabled();
  });
});

test.describe("Accessibility (axe, WCAG 2.1 A/AA)", () => {
  for (const path of ["/dashboard", "/posts/new?type=general", "/profile"]) {
    test(`${path} has no violations`, async ({ page }) => {
      const { default: AxeBuilder } = await import("@axe-core/playwright");
      await mockApi(page, {
        authenticated: true,
        overrides: {
          "GET /dashboard": (route) =>
            fulfillJson(route, 200, { ...emptyDashboard(), recent: [post(4, "โพสต์ล่าสุด", { priority: "high" })] }),
        },
      });
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeAttached();
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`)).toEqual([]);
    });
  }
});
