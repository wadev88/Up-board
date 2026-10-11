import type { Page, Route } from "@playwright/test";

export const API = process.env.E2E_API_URL ?? "http://localhost:8000/api/v1";

type Handler = (route: Route) => Promise<void> | void;

/** CORS headers echoing the page origin (credentials: "include" forbids "*"). */
function cors(route: Route): Record<string, string> {
  const origin = route.request().headers()["origin"] ?? "http://localhost:3100";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "authorization, content-type, accept",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  };
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: "application/json", headers: cors(route), body: JSON.stringify(body) });

export const program = { id: 101, faculty_id: 10, code: "SE", name_th: "วิศวกรรมซอฟต์แวร์", name_en: "Software Engineering", is_active: true };

export const user = {
  id: 1,
  email: "65000001@up.ac.th",
  display_name: "สมชาย ใจดี",
  role: "student",
  faculty: { id: 10, code: "ICT", name_th: "คณะเทคโนโลยีสารสนเทศและการสื่อสาร", name_en: "ICT", is_active: true },
  program: program as typeof program | null,
  contacts: { facebook: null, instagram: null, line: null } as Record<string, string | null>,
  is_verified: true,
  is_active: true,
  is_technician: false,
  has_password: false,
  profile_completed: true,
  posting_suspended_until: null as string | null,
  suspension: null as { starts_at: string; last_day: string; ends_at: string } | null,
  created_at: "2026-09-01T00:00:00Z",
};

export function post(id: number, title: string, extra: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id,
    type: "general",
    title,
    content: `${title} — รายละเอียด`,
    priority: "normal",
    status: "active",
    category: { id: 1, slug: "general", name_th: "โพสต์ทั่วไป", allowed_type: null },
    faculty: null,
    author: { id: 2, display_name: "ผู้เขียน", role: "teacher" },
    created_at: new Date(now - 3600_000).toISOString(),
    updated_at: new Date(now - 3600_000).toISOString(),
    pinned_at: null,
    pinned_until: null,
    is_pinned: false,
    dashboard_expires_at: new Date(now + 20 * 3600_000).toISOString(),
    lifecycle: "active",
    attachments: [],
    event: null,
    repair: null,
    lost_found: null,
    related_repair_id: null,
    permissions: {
      can_edit: false,
      can_delete: false,
      can_pin: false,
      can_update_status: false,
      can_assign: false,
      can_set_priority: false,
      can_report: true,
    },
    ...extra,
  };
}

const emptyPage = { items: [], total: 0, page: 1, page_size: 20 };

/**
 * Mock the backend. `authenticated` controls POST /auth/refresh.
 * `overrides` maps "METHOD /path" (path relative to API base, no query) to a handler.
 */
export const emptyDashboard = () => ({
  pinned: [],
  upcoming: [],
  recent: [],
  repairs: [],
  lost_found: [],
  generated_at: new Date().toISOString(),
});

export async function mockApi(
  page: Page,
  {
    authenticated,
    overrides = {},
    me = user,
  }: { authenticated: boolean; overrides?: Record<string, Handler>; me?: typeof user },
) {
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(new URL(API).pathname, "");
    const key = `${req.method()} ${path}`;

    if (req.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors(route) });
    }
    if (overrides[key]) return overrides[key](route);

    switch (key) {
      case "POST /auth/refresh":
        return authenticated
          ? json(route, 200, { access_token: "e2e-token", token_type: "bearer", expires_in: 900, user: me })
          : json(route, 401, { error: { code: "UNAUTHENTICATED", message: "no session" } });
      case "GET /auth/config":
        return json(route, 200, { google_enabled: false, password_signup_enabled: false, allowed_email_domain: "up.ac.th" });
      case "GET /faculties":
        return json(route, 200, [{ ...user.faculty, programs: [program] }]);
      case "GET /categories":
        return json(route, 200, [
          { id: 1, slug: "general", name_th: "โพสต์ทั่วไป", allowed_type: null },
          { id: 2, slug: "announcement", name_th: "ประกาศ", allowed_type: "announcement" },
          { id: 3, slug: "activities", name_th: "กิจกรรม", allowed_type: "event" },
          { id: 4, slug: "lost-found", name_th: "ของหาย / พบของ", allowed_type: "lost_found" },
          { id: 5, slug: "repair", name_th: "แจ้งซ่อม", allowed_type: "repair" },
        ]);
      case "GET /notifications/unread-count":
        return json(route, 200, { count: 2 });
      case "POST /stream/ticket":
        // keep SSE out of e2e runs
        return json(route, 503, { error: { code: "UNAVAILABLE", message: "disabled in e2e" } });
      case "GET /events":
        return json(route, 200, []);
      case "GET /dashboard":
        return json(route, 200, emptyDashboard());
      default:
        if (req.method() === "GET") return json(route, 200, emptyPage);
        return json(route, 404, { error: { code: "NOT_FOUND", message: key } });
    }
  });
}

export { json as fulfillJson };
