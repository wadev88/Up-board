# UP Board — REST API Contract (v1)

> แหล่งอ้างอิงเดียวระหว่าง Frontend (Next.js) และ Backend (FastAPI) — ตาม ADR-001, ADR-002 และ ADR-003
> OpenAPI ฉบับเต็มดูได้ที่ `GET /docs` (Swagger UI) และ `GET /openapi.json` ของ Backend

- Base URL: `${NEXT_PUBLIC_API_URL}` เช่น `http://localhost:8000/api/v1`
- ทุก request/response เป็น JSON (ยกเว้น `POST /uploads` = `multipart/form-data` และ `GET /stream` = SSE)
- เวลาเป็น ISO-8601 พร้อม timezone (UTC จาก Backend, Frontend แสดงผลเป็นเวลาไทย)
- ทุก endpoint ยกเว้นกลุ่ม `auth` (config / supabase / register / login / refresh), `GET /faculties`, `GET /files/*` และ `GET /health` ต้องส่ง `Authorization: Bearer <access_token>`

## Error format

```json
{ "error": { "code": "FORBIDDEN", "message": "human readable", "details": [] } }
```

| HTTP | code ที่ใช้ |
|---|---|
| 400 | `BAD_REQUEST` |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED` |
| 403 | `FORBIDDEN`, `EMAIL_NOT_VERIFIED`, `ACCOUNT_DISABLED`, `EMAIL_DOMAIN_NOT_ALLOWED`, `GOOGLE_ACCOUNT_REJECTED`, `PASSWORD_SIGNUP_DISABLED`, `PASSWORD_CONFIRMATION_REQUIRED` (Google sign-in ของบัญชีที่สมัครด้วยรหัสผ่านและยังไม่ยืนยัน ต้องส่ง `password`; detail ต่างกันเมื่อรหัสผ่านผิด), `NOT_REGISTERED` (Google sign-in ของอีเมลที่ยังไม่สมัคร), `PROFILE_INCOMPLETE` (ยังไม่ทำ onboarding), `POSTING_SUSPENDED` (`details=[{field:"suspended_until", message:<ISO>}]`) |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT`, `INVALID_TRANSITION`, `DUPLICATE_REPORT`, `EMAIL_TAKEN`, `PIN_NOT_ELIGIBLE` |
| 413 | `FILE_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `VALIDATION_ERROR` (details = `[{field, message}]`), `PROFANITY_DETECTED` (details = `[{field, terms}]`) |
| 429 | `RATE_LIMITED`, `REPAIR_TOO_FAST` (`details=[{field:"retry_at", message:<ISO>}]`) |
| 503 | `GOOGLE_LOGIN_DISABLED` |

## Pagination

Query: `page` (เริ่ม 1), `page_size` (ค่าเริ่มต้น 20, สูงสุด 100)

```json
{ "items": [], "total": 0, "page": 1, "page_size": 20 }
```

## Authentication flow

**ต้องสมัครสมาชิกก่อนเข้าสู่ระบบครั้งแรก** (ผู้ใช้ตัดสินใจ — ตั้งใจต่างจาก spec §2.1): สมัครด้วยอีเมล @up.ac.th + รหัสผ่านของตัวเอง + คณะ + สาขา (เปิดโดยค่าเริ่มต้น ปิดได้ด้วย `PASSWORD_SIGNUP_ENABLED=false`) ยืนยันอีเมล แล้วเข้าสู่ระบบด้วยรหัสผ่านหรือ Google (@up.ac.th) ผ่าน Supabase Auth ก็ได้ Google **ไม่สร้างบัญชีใหม่** — อีเมลที่ยังไม่มีบัญชีได้ 403 `NOT_REGISTERED`; บัญชีที่ admin สร้างล่วงหน้าเชื่อมด้วยอีเมลเช่นเดิม — `GET /auth/config` บอกว่าเปิดวิธีไหน

1. `POST /auth/supabase` `{access_token, password?}` (Supabase access token หลัง Google sign-in; `password` ใช้เฉพาะบัญชีที่สมัครด้วยรหัสผ่านและยังไม่ยืนยัน — ถ้าไม่ส่งหรือผิด 403 `PASSWORD_CONFIRMATION_REQUIRED` ไม่ออก token ไม่เชื่อมบัญชี; ส่งซ้ำได้ด้วย Supabase token เดิม; จำกัดอัตรา 10 ครั้ง/นาที/บัญชี; บัญชีที่ยืนยันแล้วหรือ admin สร้างให้ไม่ต้องส่ง) → `{access_token, token_type:"bearer", expires_in, user}` + cookie `refresh_token`; เฉพาะบัญชีที่มีอยู่แล้วและ active (ไม่เช่นนั้น 403 `NOT_REGISTERED`); เชื่อม supabase user และตั้ง `is_verified=true`; บัญชีที่เชื่อมกับ Google อื่นแล้วจะถูกยึดไม่ได้ (409)
2. `POST /auth/onboarding` `{faculty_id, program_id}` — สำหรับบัญชีเก่าที่ `profile_completed=false` เท่านั้น (การสมัครปกติตั้งค่านี้ให้แล้ว ไม่ต้อง onboarding); บทบาทกำหนดจากอีเมล (ขึ้นต้นด้วยตัวเลข = student, อื่น ๆ = teacher); สาขาต้องอยู่ในคณะและ active; ก่อนทำเสร็จจะโพสต์ไม่ได้ (403 `PROFILE_INCOMPLETE`)
3. ทางเลือก: `POST /auth/register` (ไม่ส่งอีเมล บัญชียัง `is_verified=false`) → ยืนยันด้วย Google sign-in ครั้งแรก (ข้อ 1) หรือ admin ตั้ง `is_verified` → `POST /auth/login` (ก่อนยืนยัน 403 `EMAIL_NOT_VERIFIED`) (access token อายุ 15 นาที + cookie `refresh_token` httpOnly path `/api/v1/auth` อายุ 7 วัน)
4. Frontend เก็บ access token ไว้ในหน่วยความจำเท่านั้น เมื่อโหลดหน้าใหม่หรือได้ 401 ให้เรียก `POST /auth/refresh` ด้วย `credentials: "include"`
5. `POST /auth/logout` → ลบ cookie และยกเลิก refresh token

## Shared types

```ts
type Role = "student" | "teacher" | "technician" | "building_staff" | "student_club" | "admin";
type PostType = "general" | "announcement" | "event" | "repair" | "lost_found";
type Priority = "low" | "normal" | "high" | "urgent";
type EventPriority = "department" | "faculty" | "university";
type RepairStatus = "open" | "assigned" | "in_progress" | "pending_review" | "closed" | "rejected";
type LostFoundStatus = "lost" | "found" | "returned";
type ReportStatus = "reported" | "under_review" | "upheld" | "content_removed" | "dismissed";
type ReportReason = "profanity" | "spam" | "harassment" | "misinformation" | "other";
type Lifecycle = "active" | "expired" | "resolved" | "archived" | "removed";

interface Program { id: number; faculty_id: number; code: string; name_th: string; name_en: string | null; is_active: boolean }
// programs เติมเฉพาะ GET /faculties และ GET /admin/faculties; ที่ซ้อนอยู่ใน user/post เป็น []
interface Faculty { id: number; code: string; name_th: string; name_en: string | null; is_active: boolean; admin_only: boolean; programs: Program[] }
interface Category { id: number; slug: string; name_th: string; allowed_type: PostType | null }
interface Contacts { facebook?: string | null; instagram?: string | null; line?: string | null }

interface User {
  id: number; email: string; display_name: string; role: Role;
  faculty: Faculty | null; program: Program | null; contacts: Contacts;
  is_verified: boolean; is_active: boolean; is_technician: boolean; has_password: boolean;
  profile_completed: boolean;
  posting_suspended_until: string | null;
  // last_day = วันสุดท้ายที่ถูกระงับ (ปฏิทิน Asia/Bangkok), ends_at = เวลาที่กลับมาโพสต์ได้
  suspension: { starts_at: string; last_day: string; ends_at: string } | null;
  created_at: string;
}
interface UserBrief { id: number; display_name: string; role: Role }
// ไม่มีอีเมล
interface UserPublic { id: number; display_name: string; role: Role; faculty: Faculty | null; program: Program | null; contacts: Contacts }

interface Attachment { id: number; url: string; mime_type: string; size_bytes: number; kind: "image" | "repair_after" }

interface EventInfo { starts_at: string; ends_at: string | null; venue: string | null; priority_level: EventPriority }

interface RepairHistoryItem {
  from_status: RepairStatus | null; to_status: RepairStatus; changed_at: string;
  note: string | null;              // null สำหรับผู้ที่ไม่มีสิทธิ์ดูข้อมูลส่วนตัว
  changed_by: UserBrief | null;
}
interface RepairInfo {
  location: string; status: RepairStatus; is_assigned: boolean; updated_at: string;
  // เป็น null เมื่อผู้เรียกไม่ใช่ ผู้แจ้ง / building_staff / admin / ช่างที่ได้รับมอบหมาย
  latitude: number | null; longitude: number | null;
  technician: { id: number; display_name: string } | null;
  history: RepairHistoryItem[];
}
interface LostFoundInfo { location: string; status: LostFoundStatus; occurred_at: string | null; updated_at: string }

interface PostPermissions {
  can_edit: boolean; can_delete: boolean; can_pin: boolean;
  can_update_status: boolean;   // repair / lost_found
  can_assign: boolean;          // repair
  can_set_priority: boolean;    // repair
  can_report: boolean;
}
interface SpamNotice { action: "warning" | "suspension"; count: number; suspended_until: string | null }

interface Post {
  id: number; type: PostType; title: string; content: string; priority: Priority;
  status: "active" | "removed"; lifecycle: Lifecycle;
  category: Category; faculty: Faculty | null;
  author: UserBrief | null;          // null สำหรับ repair เมื่อผู้ชมไม่มีสิทธิ์ดูข้อมูลส่วนตัว
  created_at: string; updated_at: string;
  pinned_at: string | null; pinned_until: string | null; is_pinned: boolean;
  dashboard_expires_at: string;      // created_at + 24h
  attachments: Attachment[];
  event: EventInfo | null; repair: RepairInfo | null; lost_found: LostFoundInfo | null;
  related_repair_id: number | null;  // เฉพาะ announcement ที่ผูกกับงานซ่อม
  permissions: PostPermissions;      // คำนวณโดย Backend ตามผู้เรียก ใช้สำหรับซ่อน/แสดงปุ่มเท่านั้น
  spam_notice?: SpamNotice | null;   // มีเฉพาะใน response ของ POST /posts (general)
}

interface Notification { id: number; type: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

interface Report {
  id: number; reason: ReportReason; detail: string | null; status: ReportStatus; created_at: string;
  post: { id: number; title: string; type: PostType; status: "active" | "removed" };
  reporter: UserBrief;
  actions: { id: number; admin: UserBrief; from_status: ReportStatus; to_status: ReportStatus; note: string | null; created_at: string }[];
}

interface Technician { id: number; user: UserBrief; specialty: string | null; zone: string | null; is_available: boolean }
```

## Endpoints

### Health & reference data
| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/health` | public | `{status:"ok"}` |
| GET | `/faculties` | public | `Faculty[]` เฉพาะที่ active และ `admin_only=false` พร้อม `programs` ที่ active (ใช้ในหน้าสมัคร / onboarding / โปรไฟล์) — หน่วยงาน `admin_only` (ส่วนกลางมหาวิทยาลัย / กองอาคารสถานที่ `CENTRAL`) ไม่แสดง และ register / onboarding / `PATCH /auth/me` ที่ส่งคณะหรือสาขาของหน่วยงานนี้ตอบ 422 (`faculty_id` / `program_id`); ผู้ที่สังกัดอยู่แล้วบันทึกโปรไฟล์โดยไม่เปลี่ยนคณะได้ ส่วน admin กำหนดได้ผ่าน `/admin/users` |
| GET | `/categories` | user | `Category[]` |

### Auth & profile
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/auth/config` | – | `{google_enabled, password_signup_enabled, allowed_email_domain}` |
| POST | `/auth/supabase` | `{access_token}` | 200 `{access_token, token_type, expires_in, user}` + Set-Cookie — ต้องเป็นบัญชี Google ที่ยืนยันแล้ว เป็น `@up.ac.th` และสมัครไว้แล้ว (ไม่เช่นนั้น 403 `NOT_REGISTERED`) |
| POST | `/auth/onboarding` | `{faculty_id, program_id}` | `User` — ครั้งแรกเท่านั้น |
| POST | `/auth/register` | `{email, password(8–128, มีตัวอักษรและตัวเลข), display_name(2–60), faculty_id, program_id}` (บทบาทตามอีเมล: เลขนำ = student, อื่น ๆ = teacher; ตั้ง `profile_completed` ให้เลย) (สาขาต้องมีอยู่ เปิดใช้งาน และอยู่ในคณะที่เลือก ไม่เช่นนั้น 422) | 201 `{message}` — เปิดโดยค่าเริ่มต้น ปิดได้ด้วย `PASSWORD_SIGNUP_ENABLED=false` |
| POST | `/auth/login` | `{email, password}` | 200 เหมือน `/auth/supabase` |
| POST | `/auth/refresh` | – (cookie) | 200 เหมือน login |
| POST | `/auth/logout` | – | 204 |
| GET | `/auth/me` | – | `User` |
| PATCH | `/auth/me` | `{display_name?, faculty_id?, program_id?, contacts?: {facebook?, instagram?, line?}}` | `User` — เปลี่ยนคณะต้องส่ง `program_id` ของคณะใหม่; ใน `contacts` ไม่ส่ง = คงเดิม, `null` หรือว่าง = ลบ (≤100 ตัวอักษร) |
| GET | `/users/{id}` | – | `UserPublic` (ชื่อ บทบาท คณะ สาขา และช่องทางติดต่อที่กรอก) — ผู้ใช้ที่ถูกปิดใช้งาน → 404 |

### Dashboard
`GET /dashboard` → `{ pinned: Post[], upcoming: Post[], recent: Post[], repairs: Post[], lost_found: Post[], generated_at }`

- pinned = หมุดที่ยังไม่หมดเวลา
- upcoming = กิจกรรมที่เริ่มภายใน 7 วัน
- recent = general ภายใน 24 ชม. และ announcement ภายใน 7 วัน (หรือจนกว่างานซ่อมที่ผูกอยู่จะจบ) เรียงใหม่สุดก่อน
- repairs = งานซ่อมที่ยังไม่จบ เรียงตามความเร่งด่วนแล้วใหม่สุด
- lost_found = ของหาย/พบของที่ยังไม่ `returned` ภายใน 7 วัน

### Posts
| Method | Path | Notes |
|---|---|---|
| GET | `/posts?type=&category=<slug>&faculty_id=&q=&page=&page_size=` | ฟีดเฉพาะโพสต์ที่ยัง active (general / announcement ตามช่วงเวลา, event จนจบ, repair ที่ยังไม่จบ, lost & found 7 วัน) เรียงใหม่สุดก่อน |
| GET | `/me/posts?type=&state=active\|expired\|resolved\|archived&q=` | ประวัติโพสต์ของตัวเอง รวมโพสต์ที่หมดอายุ/เก็บถาวร (เห็นเฉพาะของผู้เรียก) |
| GET | `/posts/{id}` | ใช้ได้กับทุก type |
| POST | `/posts` | `{type:"general"\|"announcement"\|"event", title, content, category_id, priority?, event?: {starts_at, ends_at, venue?, priority_level?}, related_repair_id?, attachment_ids?(≤4)}` → 201 `Post` (+ `spam_notice`) — `event` บังคับเมื่อ type = event และห้ามใช้กับประเภทอื่น; announcement เฉพาะ building_staff / admin, event เฉพาะ student_club / admin, priority อื่นนอกจาก normal เฉพาะ building_staff / admin; `related_repair_id` ใช้กับ announcement เท่านั้น; ระหว่างถูกระงับ → 403 `POSTING_SUSPENDED` |
| PATCH | `/posts/{id}` | `{title?, content?, category_id?, priority?, event?, attachment_ids?}` — เจ้าของหรือ admin; `attachment_ids` = รายการรูปทั้งหมดหลังแก้ไข |
| DELETE | `/posts/{id}` | 204, soft delete — เจ้าของ (repair: เฉพาะ admin) หรือ admin |
| POST | `/posts/{id}/pin` | `{hours?: 6\|12\|24\|48\|72}` (ค่าเริ่มต้น 48) → `Post` — event: student_club เจ้าของ, announcement: building_staff เจ้าของ, admin ทุกโพสต์ที่ปักได้; โพสต์ประเภทอื่น, event ที่เริ่มแล้ว, ประกาศที่หมดช่วงแสดง หรืองานซ่อมที่ผูกจบแล้ว → 409 `PIN_NOT_ELIGIBLE` |
| DELETE | `/posts/{id}/pin` | → `Post` (ผู้ปักได้ หรือ admin) |

**กฎ Spam (general เท่านั้น):** โพสต์ general ติดกัน 3 โพสต์ในวันปฏิทิน Asia/Bangkok เดียวกัน → `spam_notice.action="warning"`; 5 โพสต์ → `"suspension"` ระงับการโพสต์ทุกประเภท 1 วันปฏิทิน (`suspended_until` = 00:00 น. ของวันถัดไป) โพสต์ประเภทอื่นคั่นกลางจะเริ่มนับใหม่ — ดู ADR-003

### Events
`GET /events?from=&to=` → `Post[]` (type event) เรียงตาม `starts_at`

### Repairs
| Method | Path | Notes |
|---|---|---|
| GET | `/repairs?status=&mine=true&assigned_to_me=true&q=&page=` | ผู้ใช้ทุกคนเห็นได้; ค่าเริ่มต้นเฉพาะงานที่ยังไม่จบ |
| POST | `/repairs` | `{title, content, location, latitude?, longitude?, attachment_ids (1–4 รูป, บังคับ)}` → 201 `Post` สถานะ `open`; ไม่มี priority (กองอาคารตั้งภายหลัง); ถี่เกินไป → 429 `REPAIR_TOO_FAST` |
| GET | `/repairs/{id}` | `Post` (ตัดฟิลด์ส่วนตัวตามสิทธิ์) |
| PATCH | `/repairs/{id}` | `{status, note?, attachment_ids?}` — ช่างที่ได้รับมอบหมาย: assigned→in_progress→pending_review (แนบรูป `repair_after` ได้); building_staff: pending_review→closed, pending_review→in_progress (ต้องมี note), และปฏิเสธเป็น `rejected` จากสถานะที่ยังไม่จบ (ต้องมีเหตุผล ≥3 ตัวอักษร); admin ดูอย่างเดียว; ผิดลำดับ → 409 `INVALID_TRANSITION` |
| PATCH | `/repairs/{id}/assign` | `{technician_id}` — building_staff; `open`→`assigned`; มอบหมายซ้ำได้ขณะ open / assigned / in_progress |
| PATCH | `/repairs/{id}/priority` | `{priority}` — building_staff / admin |
| GET | `/technicians` | building_staff / admin → `Technician[]` (เฉพาะช่างที่พร้อมรับงานและ active) |

### Lost & Found
| Method | Path | Notes |
|---|---|---|
| GET | `/lost-found?status=&mine=true&q=&page=` | ค่าเริ่มต้น: ไม่รวม `returned` และรายการที่เกิน 7 วัน |
| GET | `/lost-found/{id}` | `Post` |
| POST | `/lost-found` | `{title, content, location, status:"lost"\|"found", occurred_at?, attachment_ids?}` |
| PATCH | `/lost-found/{id}` | `{status?, location?}` — เจ้าของ / admin; `returned` ออกจากรายการทันที, เกิน 7 วันถูกเก็บถาวรอัตโนมัติ (ยังอยู่ใน `/me/posts`) |

### Uploads & files
- `POST /uploads` (multipart field `file`) → 201 `{id, url, mime_type, size_bytes}`
  - รับ jpeg/png/webp ≤ 5 MB ตรวจจาก magic bytes และลบ EXIF
  - ไฟล์ที่อัปโหลดแล้วยังไม่ผูกกับโพสต์ใด จะถูกลบหลัง 24 ชม.
- `GET /files/{key}` → ไฟล์รูป (key เป็น UUID เดาไม่ได้ จึงใช้ใน `<img>` ได้โดยไม่ต้องส่ง token)

### Reports (moderation)
| Method | Path | Notes |
|---|---|---|
| POST | `/reports` | `{post_id, reason, detail?}` → 201 `Report`; รายงานโพสต์ตัวเอง → 409 `CONFLICT`; รายงานซ้ำ → 409 `DUPLICATE_REPORT` |
| GET | `/reports?status=&page=` | admin → `Page<Report>` |
| GET | `/reports/mine?page=` | รายงานของตัวเอง |
| GET | `/reports/{id}` | ผู้รายงานหรือ admin (คนอื่น → 404) |
| PATCH | `/reports/{id}` | admin `{status, note?}` — มี 2 การกระทำ: `content_removed` (soft delete โพสต์ และปิดรายงานอื่นที่ยังเปิดของโพสต์นั้น) หรือ `dismissed` (ปิดโดยไม่ลบ) จาก `reported` / `under_review` / `upheld`; สถานะสุดท้ายแก้ต่อไม่ได้ (409 `INVALID_TRANSITION`); แจ้งผู้รายงานทุกครั้ง |

### Notifications & real-time
| Method | Path | Notes |
|---|---|---|
| GET | `/notifications?unread_only=&page=` | `Page<Notification>` |
| GET | `/notifications/unread-count` | `{count}` |
| PATCH | `/notifications/{id}/read` | `Notification` |
| POST | `/notifications/read-all` | 204 |
| POST | `/stream/ticket` | `{ticket, expires_in: 60}` ใช้ครั้งเดียว |
| GET | `/stream?ticket=` | SSE event: `notification` (data = Notification), `post.created` / `post.updated` (`{id,type}`), `repair.updated` (`{id,status}`), ส่ง `: ping` ทุก 15 วินาที |

### Admin (สิทธิ์ `user:manage` = admin เท่านั้น)
| Method | Path | Notes |
|---|---|---|
| GET | `/admin/stats` | `{users_total, posts_today, open_reports, pending_repairs}` |
| GET | `/admin/users?role=&suspended=&q=&page=` | `Page<User>`; `suspended=true` = เฉพาะบัญชีที่ถูกระงับการโพสต์อยู่ |
| POST | `/admin/users` | `{email, display_name, role, faculty_id?, program_id?, technician_specialty?, technician_zone?}` → 201 `User` — สร้างบัญชีพิเศษ (ไม่มีรหัสผ่าน เจ้าของล็อกอินด้วย Google); อีเมลต้องเป็น @up.ac.th ยกเว้น `student_club` |
| PATCH | `/admin/users/{id}` | `{role?, faculty_id?, program_id?, is_active?, is_verified? (admin ยืนยัน/ยกเลิกยืนยันอีเมลเอง; ยกเลิกจะเพิกถอน session), lift_suspension?: true, technician_specialty?, technician_zone?}` — ไม่ส่ง field = ไม่เปลี่ยน, `null` = ล้าง; `lift_suspension:true` ปลดการระงับการโพสต์ทันที; admin เปลี่ยน role ตัวเองไม่ได้; บทบาท teacher ต้องมีคณะ (422) |
| DELETE | `/admin/users/{id}` | 204 — ลบบัญชี (soft delete): `deleted_at`, อีเมลถูกเขียนทับเป็น `deleted-{id}@deleted.invalid` (ว่างให้สมัครใหม่ด้วยอีเมลเดิม ได้เป็นบัญชีใหม่ id ใหม่ ไม่มีข้อมูลเก่า), ล้าง `supabase_user_id`/ช่องทางติดต่อ, เพิกถอน session, ลบ notification ของบัญชี; **โพสต์ทุกประเภทของบัญชีถูกนำออกสำหรับทุกคน** (`status=removed`, `removal_reason=account_deleted`, แถวเก็บไว้เพื่อ audit; กิจกรรมหายจากปฏิทินด้วย) รายงานที่เปิดอยู่บนโพสต์เหล่านั้นถูกปิดเป็น `content_removed` (โน้ต "บัญชีถูกลบ", ไม่แจ้งเจ้าของ) ช่างที่ได้รับมอบหมายงานซ่อมได้ notification `repair.cancelled`; audit `user.delete` พร้อม `posts_removed`. 409 เมื่อลบตัวเอง / ผู้ดูแลระบบคนสุดท้าย / ช่างที่ยังมีงานซ่อมไม่เสร็จ; 404 ถ้าไม่พบหรือถูกลบแล้ว |
| GET | `/admin/faculties` | `Faculty[]` ทั้งหมด (รวมที่ปิดใช้และ `admin_only`) พร้อมสาขาทั้งหมด |
| POST / PATCH | `/admin/faculties`, `/admin/faculties/{id}` | `{code, name_th, name_en?, is_active?}` / `{name_th?, name_en?, is_active?}` — ไม่มีการลบ ใช้ `is_active=false` |
| POST / PATCH | `/admin/programs`, `/admin/programs/{id}` | `{faculty_id, code, name_th, name_en?, is_active?}` / `{name_th?, name_en?, is_active?, faculty_id?}` — ไม่มีการลบ ใช้ `is_active=false` |

## RBAC matrix (Backend เป็นผู้ตัดสินเสมอ)

บทบาท 6 แบบ: `student`, `teacher`, `technician`, `building_staff`, `student_club`, `admin` — เหตุผลและรายละเอียดอยู่ที่ [ADR-003](./adr/003-roles-repair-flow-spam-programs.md) และ `backend/app/core/permissions.py`

| สิทธิ์ | student / teacher | technician | building_staff | student_club | admin |
|---|---|---|---|---|---|
| post:create (general), lost_found:create, repair:create, report:create | ✅ | ✅ | ✅ | ✅ | ✅ |
| post:update / delete | ของตัวเอง (repair ลบไม่ได้) | ของตัวเอง | ของตัวเอง | ของตัวเอง | ทั้งหมด |
| post:announce, post:set_priority (รวม urgent) | ❌ | ❌ | ✅ | ❌ | ✅ |
| post:create_event | ❌ | ❌ | ❌ | ✅ | ✅ |
| post:pin | ❌ | ❌ | ประกาศของตัวเอง | อีเวนต์ของตัวเอง | ทั้งหมด |
| repair:read_private | ของตัวเอง | งานที่ได้รับมอบหมาย | ✅ | ของตัวเอง | ✅ |
| repair:update_status | ❌ | งานที่ได้รับมอบหมาย | ✅ | ❌ | ❌ |
| repair:assign | ❌ | ❌ | ✅ | ❌ | ❌ |
| repair:set_priority | ❌ | ❌ | ✅ | ❌ | ✅ |
| lost_found:update_status | ของตัวเอง | ของตัวเอง | ของตัวเอง | ของตัวเอง | ✅ |
| report:manage, user:manage | ❌ | ❌ | ❌ | ❌ | ✅ |
| technician:list | ❌ | ❌ | ✅ | ❌ | ✅ |
