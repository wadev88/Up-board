# UP Board — Backend API

FastAPI + SQLAlchemy + Alembic + PostgreSQL ตาม [ADR-001](../docs/architecture/adr/001-use-restful-api-internal-commu.md), [ADR-002](../docs/architecture/adr/002-business-rules-rbac-and-frontend-libraries.md) และ [ADR-003](../docs/architecture/adr/003-roles-repair-flow-spam-programs.md) (บทบาท 6 แบบ งานซ่อม กฎ Spam)
สัญญา API อยู่ที่ [docs/architecture/api-contract.md](../docs/architecture/api-contract.md) และดู Swagger ได้ที่ `http://localhost:8000/docs`

## โครงสร้าง

```
backend/
├── app/
│   ├── main.py            # สร้าง FastAPI app, CORS, security headers, routers
│   ├── config.py          # ค่าทั้งหมดจาก environment variables
│   ├── db.py              # SQLAlchemy engine + session
│   ├── routes/            # HTTP layer (= controllers): auth, posts, repairs, users, uploads, reports, notifications, admin
│   ├── services/          # business logic: dashboard ranking, expiration, repairs, spam, catalog, moderation, admin ...
│   ├── repositories/      # SQL queries ที่ใช้ซ้ำ
│   ├── models/            # ORM models (ดู database/migrations)
│   ├── validators/        # Pydantic schemas (request/response)
│   ├── middlewares/       # authentication + RBAC dependencies
│   ├── core/              # security (JWT/Argon2), permissions matrix, profanity filter, storage, SSE broker
│   └── worker/            # APScheduler worker (python -m app.worker)
├── tests/                 # pytest: unit, RBAC, API, database, expiration, moderation
├── alembic.ini            # migrations อยู่ที่ ../database/migrations
└── Dockerfile             # image เดียวใช้ได้ทั้ง API และ worker (build จาก root ของ repo)
```

## รันบนเครื่อง (ไม่ใช้ Docker)

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env              # แก้ DATABASE_URL และ JWT_SECRET
alembic upgrade head
python ../database/seeders/seed.py --demo
uvicorn app.main:app --reload     # API  → http://localhost:8000/docs
python -m app.worker              # worker (อีกหน้าต่างหนึ่ง)
```

ระบบไม่ส่งอีเมล: การยืนยันอีเมลทำผ่าน Google sign-in ครั้งแรก (ต้องตั้ง `SUPABASE_URL`) หรือ admin ยืนยันให้ด้วย `PATCH /admin/users/{id} {is_verified:true}`

## ทดสอบ

ต้องมี PostgreSQL ที่ลบข้อมูลได้ (ชุดทดสอบจะ DROP schema ทั้งหมด)

```bash
docker run -d --name upboard-test-db -e POSTGRES_USER=upboard -e POSTGRES_PASSWORD=upboard_test_pw -e POSTGRES_DB=upboard_test -p 55432:5432 postgres:16-alpine
export TEST_DATABASE_URL=postgresql+psycopg://upboard:upboard_test_pw@localhost:55432/upboard_test
pytest --cov=app
ruff check app tests ../database && ruff format --check app tests ../database
```

| ไฟล์ | ครอบคลุม |
|---|---|
| `test_unit_rules.py` | กฎอายุโพสต์ / ปักหมุด, การจัดอันดับ dashboard, state machine งานซ่อม, ตัวกรองคำหยาบ, RBAC matrix 6 บทบาท, JWT/Argon2, เวลา Asia/Bangkok |
| `test_api_auth.py` | สมัคร @up.ac.th → ยืนยันด้วย Google/admin → login → refresh rotation/reuse detection, rate limit |
| `test_api_google.py` | Google sign-in (ต้องสมัครก่อน → `NOT_REGISTERED`), onboarding บัญชีเก่า (คณะ + สาขา), โปรไฟล์/ช่องทางติดต่อ, บัญชีที่ admin สร้าง |
| `test_api_catalog.py` | คณะ/สาขาวิชา (`/faculties`, `/admin/faculties`, `/admin/programs`), เลิกใช้แทนการลบ |
| `test_api_posts.py` | RBAC ต่อประเภทโพสต์, ปักหมุด (6–72 ชม.), dashboard, ฟีด, ประวัติโพสต์ |
| `test_api_repairs.py` | งานซ่อมสาธารณะ + ซ่อนฟิลด์ส่วนตัว, ขั้นตอน open → closed/rejected, สิทธิ์ช่าง/กองอาคาร, Lost & Found |
| `test_api_spam.py` | กฎ Spam: 3 โพสต์ general ติดกัน/วัน = เตือน, 5 = ระงับ 1 วัน, การคั่นด้วยโพสต์ประเภทอื่น, ปลดการระงับ |
| `test_api_moderation_admin.py` | report flow (ลบเนื้อหา/ปิดรายงาน), admin, อัปโหลด (EXIF/spoof/size), notifications, SSE ticket |
| `test_database.py` | CHECK constraints, CITEXT unique, RBAC tables ตรงกับ matrix |

## กฎธุรกิจที่สำคัญ (ADR-002 / ADR-003)

- **อายุโพสต์ / ปักหมุด** ตรวจตอน query เสมอ (`services/expiration.py`, `services/ranking.py`) ดังนั้น worker จะช้าหรือหยุดก็ไม่ทำให้กฎผิด: general 24 ชม., announcement 7 วัน, event จนจบ, Lost & Found 7 วัน; ปักหมุดได้เฉพาะ event / announcement ครั้งละ 6–72 ชม. (ผู้ปักเลือก)
- **Dashboard:** pinned / upcoming / recent / repairs / lost_found (`services/ranking.py`)
- **Spam (`services/spam.py`):** general ติดกัน 3 โพสต์ในวันปฏิทิน Asia/Bangkok = เตือน, 5 = ระงับการโพสต์ทุกประเภท 1 วัน (กลับมา 00:00 น. วันถัดไป) ไม่มีระดับที่สูงกว่า; ปิดเฉพาะตอนทดสอบด้วย `SPAM_POLICY_ENABLED=false`
- **งานซ่อมเป็นสาธารณะ** แต่ `services/serializers.py` จะตัดชื่อผู้แจ้ง, GPS, ชื่อช่าง และ note ภายในออก สำหรับผู้ที่ไม่มีสิทธิ์
- **ไม่มีการลบจริง:** ลบโพสต์ = `status='removed'` + `audit_logs`; คณะ/สาขาวิชาปิดด้วย `is_active=false`
- **SSE:** ใช้ `POST /stream/ticket` แล้วตามด้วย `GET /stream?ticket=` (ticket ใช้ครั้งเดียว อายุ 60 วินาที)

## ประสิทธิภาพ (load test)

```bash
python scripts/loadtest.py --base http://<staging>/api/v1 --users 300 --duration 120 --email demo.student@up.ac.th --password "$DEMO_PASSWORD"
```

- 300 users ใช้งานแบบผู้ใช้จริง (think time 5–15 วินาที): p95 0.34 วินาที, error 0% — ผ่าน NFR-01/NFR-11
- stress (`--think 0.5 1.5`): ทำได้ราว 30 req/s ต่อ process บนเครื่องทดสอบ 4 CPU — ถ้าต้องการมากกว่านี้ต้องขยายหลาย process (ดู Review Trigger ข้อ 10 ใน ADR-002)
- กฎของ connection: ต้องคืน connection ภายใน thread ที่ใช้งานเสมอ (`app/routes/route_class.py`) ห้ามสร้าง router ใหม่โดยไม่ใช้ `ReleaseConnectionRoute`

## ข้อจำกัดที่ทราบ

- Rate limiter, SSE broker และรายการ ticket ที่ใช้แล้ว เก็บในหน่วยความจำของ process เดียว เพียงพอสำหรับ instance เดียวตาม ADR-001 หากต้องขยายหลาย instance ต้องเปลี่ยนไปใช้ PostgreSQL LISTEN/NOTIFY หรือ Redis (เป็น review trigger ของ ADR-001)
- `STORAGE_BACKEND=s3` ใช้ boto3 ซึ่งยังไม่มี integration test กับ S3 จริง
