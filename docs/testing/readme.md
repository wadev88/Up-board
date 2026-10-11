# 🧪 Test Plan — UP Board

(สำหรับใส่ Test Cases และ Test Reports)

ชุดทดสอบทั้งหมดรันอัตโนมัติใน CI ([.github/workflows/ci.yml](../../.github/workflows/ci.yml)) ทุก Pull Request ที่เข้า `main`

## 1. ระดับการทดสอบ

| ระดับ | เครื่องมือ | ตำแหน่ง | เกณฑ์ใน CI |
|---|---|---|---|
| Unit (กฎธุรกิจล้วน) | pytest | `backend/tests/test_unit_rules.py` | ต้องผ่านทั้งหมด |
| API / Integration (PostgreSQL จริง) | pytest + FastAPI TestClient | `backend/tests/test_api_*.py` | ต้องผ่านทั้งหมด |
| Database | pytest + Alembic | `backend/tests/test_database.py` และ `alembic upgrade → downgrade → upgrade → check` | ต้องผ่านทั้งหมด |
| Coverage ของ Backend | pytest-cov | — | ≥ 80% (ปัจจุบันราว 92%) |
| Frontend Unit / Component | Vitest + Testing Library | `frontend/tests/` | ต้องผ่านทั้งหมด |
| E2E แบบ mock (desktop + mobile, axe) | Playwright + axe | `frontend/e2e/` | ต้องผ่านทั้งหมด (job `e2e`) |
| E2E ระบบจริง (Next.js → FastAPI → PostgreSQL ผ่าน docker compose) | Playwright + axe | `frontend/e2e-real/` | ต้องผ่านทั้งหมด (job `e2e`) |
| Load test (NFR-01, NFR-11) | `backend/scripts/loadtest.py` | — | รันเองก่อน release บน staging |
| Dependency audit | pip-audit, npm audit | — | รันเองก่อน release |
| Lab เดิม (JavaScript) | node:test | `src/tests/` | coverage ≥ 60% |

## 2. Test Cases สำคัญตามกฎธุรกิจ

| รหัส | กรณีทดสอบ | ผลที่คาดหวัง | ไฟล์ |
|---|---|---|---|
| EXP-01 | โพสต์อายุ 23:59:59 / 24:00:00 / 24:00:01 | แสดง / ไม่แสดง / ไม่แสดง บน Dashboard | unit |
| EXP-02 | โพสต์อายุเกิน 24 ชม. | หายจาก Dashboard แต่ยังอยู่ใน `GET /posts?category=` | api_posts |
| EXP-03 | ปักหมุด 72 ชม. แล้วย้อนเวลาไป 71:59 และ 72:00:01 (**ไม่รัน Worker**) | แสดงใน Pinned / ไม่แสดง | api_posts |
| EXP-04 | ปักหมุด 0, 73, 168 ชม. | 422 | api_posts |
| EXP-05 | ปักซ้ำหลังผ่านไป 60 ชม. ขอ 72 ชม. | `pinned_until` = ปักครั้งแรก + 72 ชม. | api_posts |
| EXP-06 | ปักหมุดหลังครบกรอบ 72 ชม. | 409 `PIN_WINDOW_EXPIRED` | api_posts |
| EXP-07 | DB บันทึก `pinned_until` เกิน 72 ชม. โดยตรง | IntegrityError (CHECK) | api_posts |
| EXP-08 | Worker ปลดหมุดที่หมดเวลา รัน 2 ครั้ง | ครั้งแรก 1 แถว ครั้งที่สอง 0 แถว (idempotent) | api_posts |
| DSH-01 | ลำดับ Pinned → Important → Upcoming → Recent | ตรงตามลำดับ และโพสต์อยู่ได้ section เดียว | api_posts |
| DSH-02 | กิจกรรมที่ประกาศเกิน 24 ชม. แต่เริ่มภายใน 7 วัน | อยู่ใน Upcoming | unit, api_posts |
| DSH-03 | โพสต์ admin กับนิสิตใน Recent | admin มาก่อน (role weight) | api_posts |
| RBAC-01 | ตารางบทบาท × การแก้ไข/ลบ (own / faculty / other faculty / admin) | 200/204 หรือ 403 ตามตาราง | api_posts |
| RBAC-02 | priority `urgent` โดย student / staff / admin | 403 / 201 / 201 | api_posts |
| RBAC-03 | Staff ปักหมุดโพสต์คณะตัวเอง / คณะอื่น, student ปักหมุด | 200 / 403 / 403 | api_posts |
| RBAC-04 | Endpoint admin เรียกโดย student/staff | 403 | api_moderation_admin |
| RBAC-05 | เปลี่ยน role แล้วใช้ token เดิม | 401 (token_version) | api_moderation_admin |
| RBAC-06 | ช่างที่ได้รับมอบหมายอัปเดตงานตัวเอง / งานอื่น / ย้อนสถานะ | 200 / 403 / 409 | api_repairs |
| RBAC-07 | ตาราง `role_permissions` ที่ seed ไว้ ตรงกับ matrix ในโค้ด | เท่ากันทุกแถว | database |
| REP-01 | ผู้ใช้อื่นเปิดงานซ่อม (detail / list / dashboard) | ไม่มีผู้แจ้ง, GPS, ชื่อช่าง, note | api_repairs |
| REP-02 | ข้ามสถานะ pending → completed | 409 `INVALID_TRANSITION` | unit, api_repairs |
| REP-03 | สร้างงานซ่อม | แจ้งเตือนผู้แจ้ง + ช่าง + admin | api_repairs |
| MOD-01 | คำหยาบไทย/อังกฤษ + การเลี่ยงคำ (เว้นวรรค, zero-width, leetspeak, ตัวอักษรซ้ำ) | ตรวจพบ → 422 `PROFANITY_DETECTED` | unit, api_posts |
| MOD-02 | คำปกติที่มีคำหยาบซ้อนอยู่ (หีบ, ควาย, สัสดี, Scunthorpe) | ไม่ตรวจพบ | unit |
| MOD-03 | report → under_review → upheld → content_removed | โพสต์ถูก soft delete, report อื่นของโพสต์เดียวกันถูกปิด, มี report_actions 3 แถว | api_moderation_admin |
| MOD-04 | รายงานซ้ำ / รายงานโพสต์ตัวเอง / ข้ามสถานะ | 409 | api_moderation_admin |
| AUTH-01 | สมัครด้วยอีเมลที่ไม่ใช่ @up.ac.th (รวม `x@up.ac.th.evil.com`, `x@sub.up.ac.th`) | 422 | api_auth |
| AUTH-02 | login ก่อนยืนยันอีเมล / admin ยืนยันให้ / endpoint ลิงก์ยืนยันถูกลบ | 403 / 200 / 404 | api_auth |
| AUTH-03 | ใช้ refresh token เก่าซ้ำหลังหมุนเวียน | 401 และ token ใหม่ใน family เดียวกันใช้ไม่ได้ | api_auth |
| AUTH-04 | access token หลัง 16 นาที | 401 `TOKEN_EXPIRED` | api_auth |
| AUTH-05 | login ผิดเกิน 10 ครั้ง/นาที | 429 | api_auth |
| UPL-01 | รูปที่มี EXIF (Make, GPS) | ไฟล์ที่เก็บไม่มี EXIF | api_moderation_admin |
| UPL-02 | ไฟล์ PHP ที่ตั้งชื่อเป็น .png / GIF / ไฟล์เกินขนาด | 415 / 415 / 413 | api_moderation_admin |
| UPL-03 | แนบไฟล์ของผู้อื่น | 422 | api_moderation_admin |
| SSE-01 | ใช้ stream ticket ซ้ำ / ใช้ access token แทน ticket / ticket หมดอายุ | 401 | api_moderation_admin |
| SSE-02 | แจ้งเตือนใน transaction ที่ rollback | ไม่ถูกส่งไปยัง client | api_moderation_admin |
| AUTH-06 | ผู้ใช้หลายคนจาก IP เดียวกัน (NAT ของมหาวิทยาลัย) ขณะบัญชีหนึ่งถูก brute force | บัญชีอื่นยังล็อกอินได้, refresh ไม่ถูกจำกัด | api_auth |
| AUTH-07 | 2 แท็บ refresh พร้อมกันด้วย cookie เดียวกัน | ทั้งสองแท็บได้ 200 (grace 30 วินาที) แต่การใช้ซ้ำหลัง 30 วินาทียังถือเป็นการขโมย | api_auth |
| DB-01 | request ถูกยกเลิกขณะถือ connection | connection คืน pool เสมอ | database |
| E2E-01 | สมัคร → admin ยืนยันอีเมล (แทน Google sign-in) → login → reload → logout | ผ่าน | e2e-real/01 |
| E2E-02 | สร้างโพสต์พร้อมรูป → แสดงบน dashboard และหมวดหมู่, คำหยาบถูกบล็อก, staff ปักหมุด | ผ่าน | e2e-real/01 |
| E2E-03 | แจ้งซ่อม 3 ขั้น → staff มอบหมายช่าง → ผู้แจ้งเห็นสถานะเปลี่ยนแบบ real-time (SSE) → ช่างปิดงาน | ผ่าน | e2e-real/02 |
| E2E-04 | นิสิตคนอื่นเปิดงานซ่อม (mobile) | ไม่เห็นชื่อผู้แจ้ง/GPS/ฟอร์มสถานะ | e2e-real/02 |
| E2E-05 | รายงานโพสต์ → admin เปลี่ยนสถานะใน drawer 3 ขั้น → โพสต์หายจากทุกที่ | ผ่าน | e2e-real/03 |
| E2E-06 | admin เลื่อนนิสิตเป็นบุคลากร | token เดิมใช้ไม่ได้, role ใหม่มีผล | e2e-real/03 |
| A11Y-01 | axe WCAG 2.1 A/AA บนทุกหน้า (นิสิต + admin, desktop + mobile) ด้วยข้อมูลจริง | ไม่มี violation ระดับ serious/critical | e2e, e2e-real/03 |

## 3. วิธีรัน

```bash
# Backend (ต้องมี PostgreSQL สำหรับทดสอบ ดู backend/README.md)
cd backend && pytest --cov=app

# Frontend
cd frontend && npm test && npm run test:e2e   # ติดตั้ง browser ครั้งแรก: npx playwright install chromium

# E2E ระบบจริง (ต้องมี stack จาก docker compose รันอยู่)
E2E_DEMO_PASSWORD=... E2E_ADMIN_PASSWORD=... npm run test:e2e:real

# Load test (รันกับ staging เท่านั้น)
cd backend && python scripts/loadtest.py --base http://<host>/api/v1 --users 300 --duration 120   --email demo.student@up.ac.th --password "$DEMO_PASSWORD"            # ผู้ใช้จริง: think time 5–15 วินาที
python scripts/loadtest.py ... --think 0.5 1.5                          # stress test
```

## 4. Test Report ล่าสุด

| วันที่ | ชุดทดสอบ | ผล |
|---|---|---|
| 2026-10-05 | Backend (pytest, PostgreSQL 16) | 130 passed, coverage ≈ 92% |
| 2026-10-05 | Lab เดิม (node:test) | 22 passed |
| 2026-10-05 | Backend (pytest) หลังแก้บั๊กจากการทดสอบ | 138 passed, coverage ≈ 93% |
| 2026-10-05 | Frontend (Vitest) + lint + typecheck + build | 125 passed, build สำเร็จ |
| 2026-10-05 | Playwright E2E แบบ mock (desktop + mobile) | 22 passed |
| 2026-10-05 | Playwright E2E ระบบจริงบน docker compose (desktop + mobile) | 16 passed (ติดกัน 2 รอบ) |
| 2026-10-05 | Load test 300 users, think time 5–15 วินาที (ผู้ใช้จริง) | ✅ p95 0.34 วินาที, error 0%, ฟีด p95 0.34 วินาที — ผ่าน NFR-01 และ NFR-11 |
| 2026-10-05 | Load test 300 users, think time 0.5–1.5 วินาที (stress ≈ 300 req/s) | ❌ ~30 req/s ต่อ process (เครื่องทดสอบ 4 CPU ร่วมกับ DB/ตัวยิง load) — ต้องขยายเป็นหลาย process/instance ตาม Review Trigger ของ ADR-001 |
| 2026-10-05 | pip-audit / npm audit (production) | 0 ช่องโหว่ (npm devDependencies: 5 high ใน eslint-config-next → braces, ไม่ถูก deploy) |

### บั๊กที่พบจากการทดสอบและแก้แล้ว

| # | พบจาก | ปัญหา | การแก้ไข |
|---|---|---|---|
| 1 | docker compose | `package-lock.json` จาก Windows ขาด dependency ของ Linux ทำให้ `npm ci` ใน Docker/CI ล้มเหลว | สร้าง lockfile ใหม่ใน Linux |
| 2 | docker compose | worker ได้ HEALTHCHECK ของ API จึงถูกรายงานเป็น unhealthy | ปิด healthcheck ของ worker/migrate |
| 3 | E2E ระบบจริง | rate limit ต่อ IP 10 ครั้ง/นาที จะล็อกนิสิตทั้งวิทยาเขตที่ใช้ NAT เดียวกัน และหลัง proxy ทุกคนจะมี IP เดียวกัน | จำกัดต่อ (IP + อีเมล) และต่อผู้ใช้, เพดานต่อ IP สูงขึ้น, เชื่อ `X-Forwarded-For` |
| 4 | E2E ระบบจริง | หลายแท็บ refresh พร้อมกัน → ระบบเข้าใจว่าเป็นการขโมย token แล้ว logout ทุกแท็บ | grace window 30 วินาทีสำหรับ token ที่เพิ่งหมุนขณะ family ยังมี token ใช้งานได้ |
| 5 | axe | แท็บตัวกรองมี `aria-controls` ชี้ไปยัง panel ที่ไม่มีอยู่ (งานซ่อม/ของหาย/แจ้งเตือน) | ห่อผลลัพธ์ด้วย `TabsContent` (role=tabpanel) |
| 6 | load test | connection รั่ว `idle in transaction` เมื่อ client ตัดการเชื่อมต่อ → pool เต็ม → API ค้างทั้งระบบ | `get_db` เป็น async + ปิด session แบบ shielded ด้วย limiter แยก |
| 7 | load test | deadlock ระหว่าง threadpool กับ connection pool (thread รอ connection ที่ session ว่างถืออยู่) | คืน connection ใน thread ที่ใช้งานเสมอ (`ReleaseConnectionRoute`, commit หลัง `current_user`) |
| 8 | load test | overflow connection ถูกเปิด/ปิดซ้ำ (fork + SCRAM) กิน CPU ของ PostgreSQL | pool ถาวร 40 + overflow 10 |
| 9 | load test (EXPLAIN) | query โพสต์มี 13 JOIN เกิน `geqo_threshold` → planning 11 ms vs execution 0.8 ms | ความสัมพันธ์ 1:1 ใช้ selectin (JOIN สูงสุด 6) |
| 10 | E2E ระบบจริง | keep-alive ของ uvicorn (5 วินาที) สั้นกว่า proxy → ECONNRESET/502 แบบสุ่ม | `--timeout-keep-alive 75` |
| 11 | E2E แบบ mock | การทดสอบกับ `next dev` ไม่แน่นอนเพราะ compile ตอนเปิดหน้าแรก | รัน E2E กับ production build เป็นค่าเริ่มต้น |
| 12 | ตรวจความสอดคล้อง | staff/admin แก้โพสต์ของคนอื่นที่มีรูปไม่ได้ (422) | backend คงรูปเดิมของโพสต์ได้, frontend ส่งเฉพาะฟิลด์ที่เปลี่ยน |
| 13 | ตรวจความสอดคล้อง | admin เลือก "ไม่สังกัดคณะ" แล้วไม่มีผล แต่แสดงว่าสำเร็จ | `"faculty_id": null` = ล้างคณะ |
| 14 | ตรวจความสอดคล้อง | หลังแก้ไขโพสต์ดึงรายละเอียดซ้ำ, SSE สั่ง refresh ทุก query, แถบขวาของ dashboard โหลดข้อมูลบนมือถือที่มองไม่เห็น, refetch ทุกครั้งที่สลับแท็บ | invalidation แยกตามประเภท, `staleTime` 60 วินาที, ปิด refetch on focus, ใช้ media query |
| 15 | E2E ระบบจริง | ตัวกรองคำหยาบสร้าง dictionary ตอนโพสต์ครั้งแรกหลัง API start (4–14 วินาที) | warm up ตอน start ก่อนรับ traffic |
| 16 | E2E ระบบจริง | Argon2 ค่าเริ่มต้น 64 MB/ครั้ง ช้าและเสี่ยง RAM หมดเมื่อล็อกอินพร้อมกัน | Argon2id m=19 MiB, t=2, p=1 (OWASP) + rehash อัตโนมัติ |
| 17 | E2E ระบบจริง | ผู้แจ้งที่เพิ่งสร้างงานซ่อมไม่เห็นสถานะที่ staff เปลี่ยนภายใน 5 วินาที (SSE ถูกทิ้งเพราะคิดว่าเป็นของตัวเอง) | ข้าม event เฉพาะเมื่อ cache มีสถานะเดียวกันอยู่แล้ว |
| 18 | ทดสอบเวลา | test ปักหมุดใช้นาฬิกาฝั่ง client ก่อนส่ง request (ล้มเมื่อเครื่องช้า) | อ้างอิงเวลาปักหมุดจาก response |
