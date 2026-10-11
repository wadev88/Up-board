# UP Board — Database (PostgreSQL)

| ตำแหน่ง | เนื้อหา |
|---|---|
| `migrations/` | Alembic migrations (ADR-001) — **แหล่งความจริง (source of truth)** ของ schema ส่วน `alembic.ini` อยู่ใน `backend/` |
| `seeders/seed.py` | Seeder ที่รันซ้ำได้: roles, permissions, role_permissions (สร้างจาก `app/core/permissions.py`), คณะและสาขาวิชาตามรายการทางการของ มพ. (รันซ้ำได้: เพิ่มเฉพาะที่ยังไม่มี ไม่เขียนทับ และปิดการใช้ `is_active=false` ให้สาขาตัวอย่างเก่าที่ไม่อยู่ในรายการ ไม่ลบ), หมวดหมู่, admin คนแรก และข้อมูลตัวอย่างเมื่อใส่ `--demo` |
| `schema.sql` | SQL สำหรับอ้างอิง สร้างจาก migrations (`alembic upgrade head --sql`) **ห้ามนำไปรันเอง** |

## คำสั่ง (รันจาก `backend/`)

```bash
alembic upgrade head                      # สร้าง/อัปเดต schema
alembic downgrade -1                      # ย้อนกลับ 1 ขั้น
alembic revision --autogenerate -m "..."  # สร้าง migration ใหม่หลังแก้ models (ต้องตรวจทานก่อน commit)
alembic check                             # ตรวจว่า models กับ migrations ตรงกัน (รันใน CI)
python ../database/seeders/seed.py        # ข้อมูลอ้างอิง + admin จาก BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD
python ../database/seeders/seed.py --demo # + บัญชีตัวอย่าง (demo.student@up.ac.th ฯลฯ) ใช้รหัสผ่านจาก DEMO_PASSWORD
```

## กฎธุรกิจที่ฐานข้อมูลบังคับเอง

- `users.email` ต้องลงท้าย `@up.ac.th` (CHECK) และห้ามซ้ำแบบไม่สนตัวพิมพ์ใหญ่/เล็ก (CITEXT)
- `programs.code` UNIQUE และ `users.program_id` อ้างอิง `programs` — สาขาวิชาไม่ถูกลบ ใช้ `is_active=false`
- `posting_violations` / `posting_suspensions` เก็บประวัติ Spam (เตือน / ระงับ) ไม่ลบ
- `attachments` รับเฉพาะ jpeg/png/webp ขนาดไม่เกิน 5 MB
- `reports (post_id, reporter_id)` UNIQUE — ผู้ใช้ 1 คนรายงานโพสต์เดียวกันได้ครั้งเดียว
- `events.ends_at > starts_at` และ latitude/longitude ต้องอยู่ในช่วงที่ถูกต้อง

Migrations ล่าสุดคือ `0005` (งานซ่อมแบบมีขั้นตรวจรับ, Spam รายวัน, สาขาวิชา, ช่องทางติดต่อ; ไม่มีชั้นปี) — กฎ Spam 3/5 ไม่ต้องแก้ schema

ER Diagram อยู่ที่ [docs/architecture/README.md](../docs/architecture/README.md)
