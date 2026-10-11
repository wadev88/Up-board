import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

export const API = process.env.E2E_API_URL ?? "http://localhost:8000/api/v1";
export const DEMO_PASSWORD = required("E2E_DEMO_PASSWORD");
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@up.ac.th";
export const ADMIN_PASSWORD = required("E2E_ADMIN_PASSWORD");

export const DEMO = {
  student: "demo.student@up.ac.th",
  teacher: "demo.teacher@up.ac.th", // teacher, ICT — general posts, repairs, lost & found only
  facilities: "demo.facilities@up.ac.th", // building_staff, CENTRAL — assigns repairs
  technician: "demo.technician@up.ac.th", // technician
  club: "demo.club@up.ac.th", // student_club — creates (and pins) events
  admin: "demo.admin@up.ac.th",
} as const;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} to run the real-stack E2E suite`);
  return value;
}

export const unique = (label: string) => `${label} ${Date.now().toString(36)}`;

// The API allows 10 logins per account per minute (brute-force guard); the suite reuses the
// demo accounts more often than that, so a 429 waits out the window once instead of failing.
const LOGIN_WINDOW_MS = 61_000;

export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  for (let attempt = 0; ; attempt++) {
    await page.goto("/login");
    await page.getByLabel("อีเมลมหาวิทยาลัย").fill(email);
    await page.locator('input[type="password"]').fill(password);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/auth/login") && r.request().method() === "POST"),
      page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click(),
    ]);
    if (response.status() !== 429 || attempt > 0) break;
    test.setTimeout(test.info().timeout + LOGIN_WINDOW_MS);
    await page.waitForTimeout(LOGIN_WINDOW_MS);
  }
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function apiToken(request: APIRequestContext, email: string, password = DEMO_PASSWORD) {
  let response = await request.post(`${API}/auth/login`, { data: { email, password } });
  if (response.status() === 429) {
    test.setTimeout(test.info().timeout + LOGIN_WINDOW_MS);
    await new Promise((resolve) => setTimeout(resolve, LOGIN_WINDOW_MS));
    response = await request.post(`${API}/auth/login`, { data: { email, password } });
  }
  expect(response.ok()).toBeTruthy();
  return (await response.json()).access_token as string;
}

/** Email ownership is normally proven by the first Google sign-in, which the suite cannot do.
 * Support path instead: an admin verifies the account (PATCH /admin/users/{id} {is_verified}). */
export async function verifyEmailAsAdmin(request: APIRequestContext, email: string) {
  const adminToken = await apiToken(request, ADMIN_EMAIL, ADMIN_PASSWORD);
  const headers = { Authorization: `Bearer ${adminToken}` };
  const found = await request.get(`${API}/admin/users`, { headers, params: { q: email } });
  expect(found.ok()).toBeTruthy();
  const account = ((await found.json()).items as { id: number; email: string }[]).find((u) => u.email === email);
  if (!account) throw new Error(`No account ${email} to verify`);
  const patch = await request.patch(`${API}/admin/users/${account.id}`, { headers, data: { is_verified: true } });
  expect(patch.ok()).toBeTruthy();
}

/** A tiny valid PNG, generated in-memory (no fixture files needed). */
export const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** Uploads the tiny PNG and returns its attachment id (repairs require at least one image). */
export async function uploadPng(request: APIRequestContext, token: string): Promise<number> {
  const response = await request.post(`${API}/uploads`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: { file: { name: "e2e.png", mimeType: "image/png", buffer: PNG_1x1 } },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).id as number;
}

/** Registers (faculty + first program) through the API, then verifies the email with an admin token. */
export async function createVerifiedStudent(request: APIRequestContext, facultyId?: number) {
  // numeric local part = student id → the API onboards it as a student
  const email = `${Date.now()}${Math.floor(Math.random() * 1e4)}@up.ac.th`;
  const password = "E2eSecret123";
  const faculties = await (await request.get(`${API}/faculties`)).json();
  const faculty = faculties.find((f: { id: number }) => f.id === facultyId) ?? faculties[0];
  const response = await request.post(`${API}/auth/register`, {
    data: { email, password, display_name: "ผู้ชม E2E", faculty_id: faculty.id, program_id: faculty.programs[0].id },
  });
  expect(response.status()).toBe(201);
  await verifyEmailAsAdmin(request, email);
  // registration already stored faculty + program and completed the profile: no onboarding step
  await apiToken(request, email, password);
  return { email, password };
}
