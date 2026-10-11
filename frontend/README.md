# UP Board — Frontend

Web app ของ **UP Board** (กระดานข่าวชุมชน + ระบบแจ้งซ่อม มหาวิทยาลัยพะเยา)
สร้างตาม [ADR-001](../docs/architecture/adr/001-use-restful-api-internal-commu.md),
[ADR-002](../docs/architecture/adr/002-business-rules-rbac-and-frontend-libraries.md) และ
[API contract v1](../docs/architecture/api-contract.md) (แหล่งอ้างอิงเดียวของ path / field / type)

| ด้าน | ไลบรารี |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack, React Compiler) + React 19 + TypeScript (strict) |
| UI | Tailwind CSS v4 + shadcn/ui-style components (Radix primitives, CVA, tailwind-merge, lucide-react), sonner |
| Server state | TanStack Query v5 (+ SSE invalidation) |
| Session | React Context (`AuthProvider`) — access token อยู่ในหน่วยความจำเท่านั้น |
| Forms | react-hook-form + zod v4 |
| Tests | Vitest + Testing Library + jsdom; Playwright + @axe-core/playwright |

## เริ่มต้นใช้งาน

```bash
cd frontend
cp .env.example .env.local      # แก้ NEXT_PUBLIC_API_URL ถ้า backend ไม่ได้อยู่ที่ :8000
npm install
npm run dev                     # http://localhost:3000
```

Backend (FastAPI) ต้องเปิด CORS ให้ origin ของ frontend พร้อม `allow_credentials=True`
เพราะ refresh token เป็น httpOnly cookie (`POST /auth/refresh` ใช้ `credentials: "include"`)

### Environment variables

| ตัวแปร | ค่าเริ่มต้น | คำอธิบาย |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api/v1` | Base URL ของ API (รวม `/api/v1`) — ถูก inline ตอน build |

### Scripts

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | dev server |
| `npm run build` / `npm start` | production build (`output: "standalone"`) / รัน build |
| `npm run lint` | ESLint (`eslint-config-next` core-web-vitals + typescript) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (unit + component) |
| `npm run test:e2e` | Playwright (ครั้งแรกให้ `npx playwright install chromium`) — API ถูก mock ด้วย `page.route` จึงไม่ต้องรัน backend |

### Docker

```bash
docker build -t up-board-frontend --build-arg NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1 .
docker run --rm -p 3000:3000 up-board-frontend
```

Multi-stage (deps → builder → runner) ใช้ Next standalone output และรันด้วย user `nextjs` (non-root)

## โครงสร้าง

```
app/
  (auth)/login, register, auth/callback    หน้าที่ไม่ต้องล็อกอิน
  (main)/layout.tsx                          AuthGuard + AppShell (Sidebar / TopBar / BottomNav / SSE)
  (main)/dashboard, posts, posts/new, posts/[id], posts/[id]/edit,
         repairs, repairs/new, repairs/[id], lost-found, lost-found/new, lost-found/[id],
         faculty/[id], profile, notifications, admin (+ users, reports — RoleGuard admin)
  page.tsx                                   redirect → /dashboard
components/
  ui/        button, card, badge, input, textarea, select, label, dialog, sheet, dropdown-menu,
             tabs, skeleton, avatar, radio-group, switch, sonner, form-field
  layout/    AppShell, Sidebar (≥1024px, 240px), TopBar, BottomNav (5 แท็บ), NotificationBell
  common/    EmptyState, ErrorState, Pagination, ConfirmDialog, ImageUploader, PageHeader
features/<auth|dashboard|posts|events|repairs|lost-found|moderation|notifications|admin>/
  api.ts     เรียก endpoint ตาม contract
  hooks.ts   TanStack Query hooks
  schemas.ts zod schemas (ข้อความ error ภาษาไทย)
  components/
hooks/       useAuth, usePermission, useSSE, useDebounce, useNow
services/    apiClient.ts (fetch wrapper + refresh + ApiError), sse.ts (ticket → EventSource), uploads.ts
types/api.ts interface ทั้งหมดจาก contract
lib/         permissions.ts (RBAC mirror — UX เท่านั้น), format.ts (th-TH / Asia/Bangkok),
             constants.ts (labels/colors), queryKeys.ts, forms.ts, utils.ts
tests/unit/  Vitest specs        e2e/  Playwright specs
```

## หลักการสำคัญ

- **Pin**: `POST /posts/{id}/pin` เลือก 6/12/24/48/72 ชม. (ใช้ได้กับ event / announcement เท่านั้น) อาจได้ 409 `PIN_NOT_ELIGIBLE` → แสดงข้อความภาษาไทยผ่าน toast
- **Spam**: `POST /posts` (general) ตอบ `spam_notice` — เตือนที่ 3 โพสต์ติดกัน, ระงับ 1 วันที่ 5 (`useSpamNoticeToast`); ระหว่างระงับ API ตอบ 403 `POSTING_SUSPENDED` และ `/auth/me` มี `suspension`
- **Auth**: access token เก็บใน module-level store (`tokenStore`) ไม่ใช้ localStorage; เมื่อโหลดหน้า
  `AuthProvider` เรียก `POST /auth/refresh` เพื่อกู้ session (แสดง skeleton ระหว่างรอ);
  ได้ 401 → refresh 1 ครั้ง (single-flight) แล้ว retry; ล้มเหลว → ล้าง session และกลับหน้า login
- การยืนยันอีเมล: ไม่มีลิงก์ทางอีเมล — สมัครเสร็จหน้าสำเร็จพาไปเข้าสู่ระบบด้วย Google (@up.ac.th) ครั้งแรก; login ด้วยรหัสผ่านก่อนยืนยันได้ 403 `EMAIL_NOT_VERIFIED` พร้อมปุ่ม Google; บัญชีที่สมัครด้วยรหัสผ่านต้องใส่รหัสผ่านยืนยันอีกครั้ง (modal ใน `/auth/callback`, เก็บ Supabase token ไว้ในหน่วยความจำ ไม่เก็บรหัสผ่าน); admin ยืนยันให้ได้ที่ `UserEditSheet`
- **Error envelope** `{error:{code,message,details}}` → `ApiError` (มี `userMessage` ภาษาไทย และ
  `fieldErrors()` สำหรับ `VALIDATION_ERROR` / `PROFANITY_DETECTED` ที่ผูกเข้ากับช่องในฟอร์ม)
- **สิทธิ์**: `<Can perm post>` / `usePermission` ใช้ `post.permissions` จาก backend ก่อนเสมอ แล้วจึงใช้
  ตาราง RBAC ใน `lib/permissions.ts`; `AuthGuard` / `RoleGuard` เป็นเพียง UX — backend ตัดสินสิทธิ์จริง
- **Real-time**: `POST /stream/ticket` → `EventSource(/stream?ticket=)`; reconnect แบบ exponential backoff
  (ขอ ticket ใหม่ทุกครั้ง); event `notification` / `post.created` / `repair.updated` invalidate query ที่เกี่ยวข้อง
- **Design**: zinc neutral + accent ม่วง, สีสถานะเฉพาะใน badge, light/dark ตาม `prefers-color-scheme`,
  ฟอนต์ Inter + IBM Plex Sans Thai, คอลัมน์เนื้อหา ≤720px, touch target ≥48px บนมือถือ,
  skip link, focus ring, aria-live สำหรับ toast/รายการ
