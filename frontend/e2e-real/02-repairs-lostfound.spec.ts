import { expect, test, type Page } from "@playwright/test";
import { API, DEMO, PNG_1x1, apiToken, createVerifiedStudent, login, unique, uploadPng } from "./helpers";

async function createRepair(page: Page, title: string): Promise<string> {
  await page.goto("/repairs/new");
  // step 1: photo
  await page.locator('input[type="file"]').setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: PNG_1x1 });
  await page.getByRole("button", { name: /ถัดไป/ }).click();
  // step 2: location
  await page.locator("#repair-location").fill("อาคาร ICT ชั้น 2 หน้าห้อง 2201");
  await page.getByRole("button", { name: /ถัดไป/ }).click();
  // step 3: details
  await page.getByLabel("หัวข้อ").fill(title);
  await page.getByLabel("อธิบายปัญหา").fill("ไฟเพดานกะพริบตลอดเวลา");
  await page.getByRole("button", { name: /ส่ง/ }).click();
  await expect(page).toHaveURL(/\/repairs\/\d+$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  return page.url();
}

test.describe("Repairs (real backend)", () => {
  test("report → assign → technician works → staff closes → reporter sees it live", async ({ browser }) => {
    const title = unique("E2E ไฟกะพริบ");
    const reporter = await (await browser.newContext()).newPage();
    await login(reporter, DEMO.student);
    await reporter.goto("/repairs/new");
    await expect(reporter.getByLabel("ความเร่งด่วน")).toHaveCount(0); // reporters never choose it
    const repairUrl = await createRepair(reporter, title);
    await expect(reporter.getByText("รับเรื่อง").first()).toBeVisible();
    await expect(reporter.getByLabel("ความเร่งด่วน")).toHaveCount(0);

    const staff = await (await browser.newContext()).newPage();
    await login(staff, DEMO.facilities);
    await staff.goto(repairUrl);
    // building staff triage the urgency
    const urgency = staff.getByLabel("ความเร่งด่วน");
    await expect(urgency).toHaveValue("normal");
    await urgency.selectOption({ label: "ด่วนมาก" });
    await expect(staff.getByText(/ตั้งความเร่งด่วนเป็น/)).toBeVisible();
    await expect(urgency).toHaveValue("urgent");
    await staff.getByRole("button", { name: "มอบหมายช่าง" }).click();
    const dialog = staff.getByRole("dialog");
    await dialog.getByLabel("ช่าง").selectOption({ index: 1 });
    await dialog.getByRole("button", { name: /มอบหมาย|ยืนยัน|บันทึก/ }).last().click();
    await expect(staff.getByTestId("status-badge").filter({ hasText: "มอบหมายช่าง" }).first()).toBeVisible();

    // the reporter's already-open page updates through SSE, without a reload
    await expect(reporter.getByTestId("status-badge").filter({ hasText: "มอบหมายช่าง" }).first()).toBeVisible({
      timeout: 15_000,
    });

    const tech = await (await browser.newContext()).newPage();
    await login(tech, DEMO.technician);
    await tech.goto(repairUrl);
    await tech.getByRole("button", { name: "เริ่มดำเนินการ" }).click();
    await expect(tech.getByTestId("status-badge").filter({ hasText: "กำลังดำเนินการ" }).first()).toBeVisible();
    await tech.getByLabel(/บันทึกถึงกองอาคาร/).fill("เปลี่ยนบัลลาสต์แล้ว");
    await tech.getByRole("button", { name: "ส่งให้กองอาคารตรวจสอบ" }).click();
    // pending review: the technician has nothing left to do and cannot assign or close
    await expect(tech.getByText("รอเจ้าหน้าที่กองอาคารตรวจสอบและปิดงาน")).toBeVisible();
    await expect(tech.getByRole("button", { name: /มอบหมายช่าง|เปลี่ยนช่าง|ปิดงาน/ })).toHaveCount(0);

    // building staff close it
    await staff.reload();
    await staff.getByRole("button", { name: "ปิดงาน" }).click();
    await staff.getByRole("alertdialog").getByRole("button", { name: "ปิดงาน" }).click();
    await expect(staff.getByText("งานนี้ปิดแล้ว ไม่มีสถานะถัดไป")).toBeVisible();

    await reporter.reload();
    await expect(reporter.getByText("เปลี่ยนบัลลาสต์แล้ว")).toBeVisible(); // reporter sees internal notes
    await expect(reporter.getByText("ปิดงาน").first()).toBeVisible();
    // closed jobs leave the active list but stay under the "closed" tab
    await reporter.goto("/repairs");
    await expect(reporter.getByRole("link", { name: title })).toHaveCount(0);
    await reporter.getByRole("tab", { name: "ปิดงาน" }).click();
    await expect(reporter.getByRole("link", { name: title })).toBeVisible();
    for (const p of [reporter, staff, tech]) await p.context().close();
  });

  test("building staff reject a repair with a mandatory reason; the reporter sees it", async ({ browser, request }) => {
    const title = unique("E2E คำร้องที่ถูกปฏิเสธ");
    const reporterToken = await apiToken(request, DEMO.student);
    const created = await request.post(`${API}/repairs`, {
      headers: { Authorization: `Bearer ${reporterToken}` },
      data: { title, content: "ทดสอบ", location: "อาคาร CE", attachment_ids: [await uploadPng(request, reporterToken)] },
    });
    expect(created.status()).toBe(201);
    const repair = await created.json();

    const staff = await (await browser.newContext()).newPage();
    await login(staff, DEMO.facilities);
    await staff.goto(`/repairs/${repair.id}`);
    await staff.getByRole("button", { name: "ปฏิเสธคำร้อง" }).click();
    const confirm = staff.getByRole("dialog").getByRole("button", { name: "ยืนยันปฏิเสธ" });
    await expect(confirm).toBeDisabled(); // a reason is mandatory
    await staff.getByLabel(/เหตุผล/).fill("ไม่ใช่ความรับผิดชอบของมหาวิทยาลัย");
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(staff.getByTestId("status-badge").filter({ hasText: "ปฏิเสธคำร้อง" }).first()).toBeVisible();
    await expect(staff.getByText("เหตุผลที่ปฏิเสธ").first()).toBeVisible();
    await staff.context().close();
  });

  test("another student sees the repair publicly but without private fields @mobile", async ({ page, request }) => {
    const reporterToken = await apiToken(request, DEMO.student);
    const created = await request.post(`${API}/repairs`, {
      headers: { Authorization: `Bearer ${reporterToken}` },
      data: {
        title: unique("E2E ก๊อกรั่ว"),
        content: "น้ำหยดตลอด",
        location: "ห้องน้ำชั้น 1 อาคาร CE",
        latitude: 19.03,
        longitude: 99.89,
        attachment_ids: [await uploadPng(request, reporterToken)],
      },
    });
    const repair = await created.json();

    const viewer = await createVerifiedStudent(request);
    await login(page, viewer.email, viewer.password);
    await page.goto(`/repairs/${repair.id}`);
    await expect(page.getByText("ห้องน้ำชั้น 1 อาคาร CE").first()).toBeVisible();
    await expect(page.getByText("ผู้ใช้ UP Board").first()).toBeVisible();
    await expect(page.getByText("อานนท์ สายรุ้ง")).toHaveCount(0);
    await expect(page.getByText(/พิกัด GPS/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /เริ่มดำเนินการ|ปิดงาน|ปฏิเสธคำร้อง/ })).toHaveCount(0);
  });
});

test.describe("Lost & Found (real backend)", () => {
  test("owner posts a lost item and marks it returned", async ({ page }) => {
    const title = unique("E2E กระเป๋าสตางค์หาย");
    await login(page, DEMO.student);
    await page.goto("/lost-found/new");
    await page.getByLabel("หัวข้อ").fill(title);
    await page.getByLabel(/รายละเอียด/).first().fill("สีดำ มีบัตรนิสิต");
    await page.getByLabel("สถานที่").fill("โรงอาหารกลาง");
    await page.getByRole("button", { name: /ลงประกาศ|เผยแพร่|บันทึก/ }).last().click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await page.getByLabel(/สถานะ/).first().selectOption({ label: "พบของแล้ว" });
    // "พบของแล้ว" is also an <option> text, so wait for the API instead of the text
    const saved = page.waitForResponse(
      (r) => /\/lost-found\/\d+$/.test(r.url()) && r.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: /บันทึก|อัปเดต/ }).first().click();
    expect((await saved).status()).toBe(200);
    await page.goto("/lost-found");
    await expect(page.getByText(title)).toHaveCount(0); // the default tab lists items still being searched for
    await page.getByRole("tab", { name: "ของหาย" }).click();
    await expect(page.getByText(title)).toHaveCount(0);
    await page.getByRole("tab", { name: "พบของแล้ว" }).click();
    await expect(page.getByText(title)).toBeVisible();
  });
});
