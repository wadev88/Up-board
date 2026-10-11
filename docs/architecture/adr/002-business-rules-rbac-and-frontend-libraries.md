# ADR-002: กฎทางธุรกิจ บทบาทผู้ใช้ (RBAC) และไลบรารีเสริมของระบบ (Architecture Decision Record)

> **สถานะ:** ยอมรับแล้ว (Accepted)  
> **วันที่:** 2026-10-05  
> **ความสัมพันธ์:** แก้ไขเพิ่มเติม (Amends) [ADR-001: การเลือกเทคโนโลยีหลักของระบบ](./001-use-restful-api-internal-commu.md) — ส่วนที่ไม่ได้กล่าวถึงใน ADR นี้ ให้ยึดตาม ADR-001  
> **โครงงาน:** UP Board (มหาวิทยาลัยพะเยา)  
> **ทีมพัฒนา:** นิสิตจำนวน 4 คน  
> **ผู้อนุมัติ:** Product Owner หลังการทบทวนสถาปัตยกรรม (Architecture Review)  
> **สัญญา API ที่เกี่ยวข้อง:** [api-contract.md](../api-contract.md)

---

##  บริบทและเหตุผล (Context & Rationale)

ADR-001 กำหนดเทคโนโลยีหลักของระบบไว้แล้ว (Next.js + FastAPI + PostgreSQL + SSE + APScheduler + JWT/Email Verification) แต่จากการทบทวนสถาปัตยกรรมพบว่ายังมีประเด็นที่ **ไม่ได้ระบุไว้ หรือเขียนไว้ไม่สอดคล้องกัน** ระหว่างเอกสารต่าง ๆ ซึ่งทำให้ทีม Frontend และ Backend ตีความต่างกัน ได้แก่:

* **บทบาทผู้ใช้:** ADR-001 กล่าวถึง "ผู้ดูแลเนื้อหา" และ "เจ้าหน้าที่ฝ่ายซ่อม" แต่ไม่ได้กำหนดจำนวนบทบาทและสิทธิ์ที่ชัดเจน
* **อายุโพสต์:** ADR-001 ใช้คำว่าเปลี่ยนสถานะเป็น `expired` ขณะที่ README ใช้คำว่า "ลบโพสต์อัตโนมัติ" ซึ่งขัดกับหลักการไม่ลบข้อมูล
* **การปักหมุด:** ยังไม่มีเพดานเวลาและกลไกบังคับใช้ที่ชัดเจน
* **การมองเห็นงานแจ้งซ่อม:** ADR-001 จำกัดข้อมูลงานซ่อมไว้เฉพาะผู้มีสิทธิ์ แต่ผู้ใช้ต้องการรู้จุดอันตรายในมหาวิทยาลัยเพื่อหลีกเลี่ยง
* **การคัดกรองเนื้อหา (Moderation):** ยังไม่มีขั้นตอนการรายงานและการจัดการรายงาน
* **SSE Authentication:** `EventSource` ของเบราว์เซอร์ไม่สามารถส่ง Header `Authorization` ได้
* **ไลบรารีเสริม:** ADR-001 ไม่ได้ระบุไลบรารีฝั่ง Frontend (State, Styling, Forms, Testing) และไลบรารีเสริมฝั่ง Backend
* **โครงสร้างพื้นฐาน:** มี Redis และ Lab Service เดิม (`services/stats-service`, `src/*.js`) ปะปนอยู่ใน Repository ซึ่งไม่อยู่ใน ADR-001
* **ขอบเขตงาน:** User Stories บางข้อ (AI, Offline, LINE) เกินกำลังของทีมภายใน 1 ภาคการศึกษา

ADR ฉบับนี้จึงบันทึกการตัดสินใจที่ Product Owner อนุมัติเมื่อวันที่ 2026-10-05 เพื่อให้เป็นแหล่งอ้างอิงเดียวร่วมกับ [api-contract.md](../api-contract.md)

---

##  การตัดสินใจ (Decision)

### 1. บทบาทผู้ใช้ (Roles)

| บทบาท | คำอธิบาย |
| :--- | :--- |
| **`student`** | ผู้ใช้ทั่วไป (บทบาทเริ่มต้นของผู้สมัครใหม่ทุกคน) |
| **`staff`** | บุคลากร/เจ้าหน้าที่ **ต้องสังกัดคณะ (faculty)** |
| **`admin`** | ผู้ดูแลระบบ รวมถึงหน้าที่คัดกรองเนื้อหา (Moderation) |

* มี **3 บทบาทเท่านั้น** — บทบาท "ผู้ดูแลเนื้อหา (Content Moderator)" ใน ADR-001 ถูกรวมเข้ากับ `admin` (Moderation ทำได้เฉพาะ admin)
* **ช่างซ่อม (Technician) ไม่ใช่บทบาทแยก** แต่เป็นโปรไฟล์ในตาราง `technicians` ที่ผูกกับผู้ใช้ `staff`
* ผู้สมัครใหม่ได้บทบาท `student` เสมอ เฉพาะ `admin` เท่านั้นที่เปลี่ยนบทบาทได้ และ admin เปลี่ยนบทบาทของตัวเองไม่ได้
* Admin คนแรก (Bootstrap Admin) ถูกสร้างจาก Environment Variables (`BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`) ไม่มีการ Hard-code ในโค้ด

### 2. ตารางสิทธิ์ (RBAC Matrix)

Backend เป็นผู้ตัดสินสิทธิ์เสมอ (คัดลอกจากหัวข้อ "RBAC matrix" ใน [api-contract.md](../api-contract.md))

| สิทธิ์ | Student | Staff | Admin |
| :--- | :---: | :---: | :---: |
| post:create | ✅ | ✅ | ✅ |
| post:update / delete | ของตัวเอง | ของตัวเอง + คณะตัวเอง | ทั้งหมด |
| post:pin | ❌ | คณะตัวเอง | ทั้งหมด |
| priority `urgent` | ❌ | ✅ | ✅ |
| repair:read_public | ✅ | ✅ | ✅ |
| repair:read_private | ของตัวเอง (+ ช่างที่ได้รับมอบหมาย) | ✅ | ✅ |
| repair:update_status | ช่างที่ได้รับมอบหมายเท่านั้น | ✅ | ✅ |
| repair:assign | ❌ | ✅ | ✅ |
| lost_found:update_status | ของตัวเอง | ✅ | ✅ |
| report:create | ✅ | ✅ | ✅ |
| report:manage | ❌ | ❌ | ✅ |
| user:manage | ❌ | ❌ | ✅ |

> ช่างที่ได้รับมอบหมาย (Assigned Technician) อัปเดตสถานะได้เฉพาะงานของตนเอง ค่า `permissions` ที่ Backend ส่งกลับมาในแต่ละโพสต์ใช้เพื่อซ่อน/แสดงปุ่มใน UI เท่านั้น ไม่ใช่กลไกป้องกันสิทธิ์

### 3. วงจรชีวิตของโพสต์ (Post Lifecycle)

*(ปรับปรุงถ้อยคำ `expired` ใน ADR-001 และ "ลบโพสต์อัตโนมัติ" ใน README)*

| ประเภท | กฎการแสดงผล |
| :--- | :--- |
| **โพสต์ทั่วไป** | แสดงบน Dashboard ช่วง 0–24 ชั่วโมงหลังสร้าง หลังจากนั้น **ซ่อนจาก Dashboard เท่านั้น** แต่ยังค้นหาได้ในหน้าหมวดหมู่ — **ไม่เปลี่ยนสถานะและไม่ลบโพสต์** |
| **โพสต์ปักหมุด** | ปักหมุดได้ **สูงสุด 72 ชั่วโมง** บังคับ 3 ชั้น: (1) DB `CHECK` constraint, (2) เงื่อนไข `pinned_until > now()` ณ เวลา Query, (3) Worker ยกเลิกหมุดอัตโนมัติทุก 5 นาที — Job ที่ทำงานช้าจึงไม่สามารถยืดเวลาหมุดได้ — กรอบ 72 ชั่วโมงนับจาก **การปักหมุดครั้งแรก** (`first_pinned_at`) การปักซ้ำทำได้ภายในกรอบเดิมเท่านั้น เมื่อครบกรอบแล้วปักหมุดโพสต์นั้นอีกไม่ได้ (`409 PIN_WINDOW_EXPIRED`) |
| **กิจกรรมที่ใกล้จะถึง** | โพสต์ประกาศ (announcement) ที่กิจกรรมเริ่มภายใน 7 วัน แสดงบน Dashboard โดยไม่ขึ้นกับกฎ 24 ชั่วโมง |
| **งานแจ้งซ่อม** | ไม่หมดอายุตราบใดที่ยังไม่เสร็จ (`completed`) |
| **ของหาย/ได้คืน** | ใช้กฎ 24 ชั่วโมงบน Dashboard แต่ยังแสดงในหน้า Lost & Found ของตัวเอง |

### 4. การเรียงลำดับบน Dashboard (Dashboard Ordering)

* **ลำดับชั้น (Tiers):** Pinned → Important (priority `high`/`urgent`) → Upcoming → Recent — แต่ละโพสต์อยู่ได้เพียง 1 ชั้น
* **คะแนนภายในชั้น:**

```text
score = priority_weight + event_time_weight + author_role_weight

priority_weight    : urgent 30 / high 20 / normal 10 / low 0
event_time_weight  : max(0, 20 − hours_until_start / 8.4)   (เฉพาะโพสต์ที่มีกิจกรรม)
author_role_weight : admin 15 / staff 10 / student 0
```

* คะแนนเท่ากัน → เรียงโพสต์ใหม่สุดก่อน
* priority `urgent` ใช้ได้เฉพาะ `staff` และ `admin`

### 5. การมองเห็นงานแจ้งซ่อม (Repair Visibility)

*(แก้ไข Security Bullet ของ ADR-001 ที่ว่า "รูปภาพแจ้งซ่อม ข้อมูลตำแหน่ง และประวัติงานต้องเปิดให้เข้าถึงเฉพาะผู้ที่มีสิทธิ์")*

งานแจ้งซ่อม **เปิดเป็นสาธารณะสำหรับผู้ใช้ที่ล็อกอินทุกคน** เพื่อให้นิสิตและบุคลากรหลีกเลี่ยงจุดอันตรายได้

| ฟิลด์สาธารณะ (ผู้ใช้ที่ล็อกอินทุกคน) | ฟิลด์ส่วนตัว (ผู้แจ้ง / staff / admin / ช่างที่ได้รับมอบหมาย) |
| :--- | :--- |
| หัวข้อ, รายละเอียด, ตำแหน่งแบบข้อความ, สถานะ, เวลา, รูปภาพ (ลบ EXIF/GPS แล้ว) | ตัวตนผู้แจ้ง, พิกัด GPS ที่แม่นยำ, ชื่อช่าง, บันทึกสถานะภายใน (note / changed_by) |

* การกรองฟิลด์ทำที่ **Response Schema ของ Backend** ไม่ใช่การซ่อนใน UI
* แบบฟอร์มอัปโหลดต้องแจ้งเตือนผู้ใช้ไม่ให้ถ่ายภาพใบหน้าบุคคล (ระบบเบลอใบหน้าด้วย AI ตาม US1.2 อยู่นอกขอบเขต)

### 6. การคัดกรองเนื้อหา (Moderation)

* **Profanity Filter:** ตรวจคำหยาบภาษาไทยและอังกฤษ ใช้การตัดคำภาษาไทยด้วย **PyThaiNLP** เพื่อลด False Positive (เช่น คำหยาบที่บังเอิญเป็นส่วนหนึ่งของคำปกติ) — หากพบจะปฏิเสธการสร้าง/แก้ไขด้วย `422 PROFANITY_DETECTED`
* **State Machine ของรายงาน:**

```text
reported → under_review → upheld → content_removed
reported / under_review → dismissed
```

* การลบเนื้อหาทั้งหมดเป็น **Soft Delete** (`posts.status = 'removed'`) พร้อมบันทึก `report_actions` และ `audit_logs` — **ไม่มี Hard Delete**

### 7. ไฟล์ที่อัปโหลด (Uploaded Files)

* รับเฉพาะ `jpeg` / `png` / `webp` ขนาด ≤ 5 MB ตรวจชนิดไฟล์จาก **Magic Bytes** (ไม่เชื่อนามสกุลหรือ Content-Type จาก Client)
* เปลี่ยนชื่อไฟล์เป็น UUID และลบข้อมูล EXIF ก่อนจัดเก็บ
* ให้บริการผ่าน URL ที่เดาไม่ได้ (`GET /files/{key}`) เพื่อให้แท็ก `<img>` โหลดได้โดยไม่ต้องแนบ Bearer Token — ยอมรับได้เพราะเนื้อหาทั้งหมดเปิดให้ผู้ใช้ที่ล็อกอินเห็นอยู่แล้วตามข้อ 5
* ไฟล์ที่อัปโหลดแต่ไม่ได้ผูกกับโพสต์ภายใน 24 ชั่วโมงจะถูก Worker ลบทิ้ง (Orphan Cleanup)

### 8. การยืนยันตัวตนของ SSE และการจัดการ Token

* `EventSource` ส่ง Header `Authorization` ไม่ได้ Backend จึงออก **Stream Ticket อายุ 60 วินาที ใช้ได้ครั้งเดียว** (`POST /stream/ticket` → `GET /stream?ticket=...`) แทนการใส่ JWT ใน URL
* **Access Token:** อายุ 15 นาที เก็บในหน่วยความจำ (Memory) เท่านั้น ไม่ใช้ `localStorage`
* **Refresh Token:** เก็บใน Cookie แบบ `httpOnly` — `SameSite=Lax` ในช่วงพัฒนา และ `SameSite=None; Secure` บน Production พร้อมตรวจสอบ Header `Origin`

### 9. ไลบรารีเสริม (Libraries ที่ ADR-001 ไม่ได้ระบุ)

| ฝั่ง | หน้าที่ | ไลบรารีที่เลือก |
| :--- | :--- | :--- |
| Frontend | Server State / Data Fetching | **TanStack Query** |
| Frontend | Session State | **React Context** |
| Frontend | Styling / UI Components | **Tailwind CSS + shadcn/ui (Radix)** (สอดคล้องกับ Definition of Done) |
| Frontend | Forms & Validation | **react-hook-form + zod** |
| Frontend | Testing | **Vitest + Testing Library**, **Playwright + axe** (E2E / Accessibility) |
| Backend | JWT | **PyJWT** |
| Backend | Password Hashing | **argon2-cffi** |
| Backend | Image Processing (EXIF strip) | **Pillow** |
| Backend | Multipart Upload | **python-multipart** |
| Backend | SSE | **sse-starlette** |
| Backend | Thai Tokenization | **PyThaiNLP** |
| Backend | Email | **ไม่ส่งอีเมล** (ยืนยันอีเมลด้วย Google sign-in ตาม ADR-003; เดิมใช้ SMTP) |

### 10. โครงสร้างพื้นฐาน (Infrastructure)

* **Docker Compose ใช้สำหรับพัฒนาบนเครื่อง (Local Development) เท่านั้น** ประกอบด้วย `db` → `migrate` (Alembic + seed) → `api` + `worker` + `frontend` (Backend ใช้ Image เดียวกันทั้ง API และ Worker)
* **Render Blueprint** (`render.yaml`) กำหนด API, Worker และ PostgreSQL บน Render โดยรัน `alembic upgrade head` เป็น Pre-deploy Command
* **นำ Redis ออก** เนื่องจากไม่อยู่ใน ADR-001 — การนำกลับมาใช้ถือเป็น Review Trigger ของ ADR-001 (ข้อ 6)
* **Production** ยังคงเป็น Vercel (Frontend) + Render (Backend) ตาม ADR-001 โดย CD Pipeline เรียก Render Deploy Hook
* **Lab Code เดิม** — `services/stats-service` และ `src/*.js` ถูกปลดระวาง (Retired) เก็บไว้ใน Repository เป็นประวัติ แต่ไม่ Build/Deploy อีกต่อไป
* **APScheduler Worker รันเป็น Process แยก** (ไม่รันภายใน API Workers) เพื่อป้องกัน Job ทำงานซ้ำเมื่อ API มีหลาย Worker

### 11. นอกขอบเขตของ Release นี้ (Out of Scope)

| รายการ | เหตุผล / ทางแทน |
| :--- | :--- |
| AI เบลอใบหน้า (US1.2) | ใช้คำเตือนในแบบฟอร์มอัปโหลดแทน |
| AI จัดลำดับความอันตราย (US2.1) | ใช้ priority ที่ผู้ใช้/staff กำหนด + คะแนน Dashboard ตามข้อ 4 |
| Offline Sync (US3.3) | — |
| Predictive Maintenance Analytics (US2.3) | เก็บ `repair_status_history` ไว้สำหรับต่อยอดในอนาคต |
| แนะนำเครื่องมือช่าง (US3.1) | — |
| Uptime / API Console (US4.1) | Admin มีเพียง `/admin/stats` พื้นฐาน |
| LINE / External Push Notification | LINE Notify ยุติบริการเมื่อมีนาคม 2025 — ใช้ **In-app Notification ผ่าน SSE** แทน |
| University SSO และบริการแผนที่ภายนอก | เป็นแผนในอนาคตตาม Review Triggers ของ ADR-001 |

---

##  เหตุผลในการตัดสินใจ (Rationale)

### 1. บทบาท 3 ระดับ
* ลดความซับซ้อนของ RBAC และจำนวน Test Case ทีมมีเพียง 4 คนและ 1 ภาคการศึกษา
* ช่างซ่อมทุกคนเป็นบุคลากรของมหาวิทยาลัยอยู่แล้ว การใช้โปรไฟล์ `technicians` ผูกกับ `staff` จึงสะท้อนความจริงและไม่ต้องสร้างบทบาทใหม่
* **ทางเลือกที่พิจารณา (Alternatives considered):** แยกบทบาท `technician` และ `moderator` — ไม่เลือก เพราะเพิ่มจำนวนเส้นทางสิทธิ์โดยไม่มีผู้ใช้จริงที่ต้องการแยก

### 2. ซ่อนจาก Dashboard แทนการลบหรือเปลี่ยนสถานะ
* การตัดสินด้วยเวลา ณ เวลา Query (`created_at + 24h > now()`) ทำให้ความถูกต้องของ Dashboard **ไม่ขึ้นกับ Background Job** หาก Worker หยุดทำงาน Dashboard ก็ยังถูกต้อง
* ไม่สูญเสียข้อมูล ผู้ใช้ยังค้นหาของหายหรือประกาศย้อนหลังได้
* **ทางเลือกที่พิจารณา:** Worker เปลี่ยนสถานะเป็น `expired` ทุก ๆ รอบ — ไม่เลือก เพราะ Dashboard จะผิดพลาดในช่วงระหว่างรอบ และเพิ่มการเขียนฐานข้อมูลโดยไม่จำเป็น

### 3. งานแจ้งซ่อมแบบสาธารณะ
* เป้าหมายด้านความปลอดภัยของชุมชน: ผู้ใช้ควรรู้ว่าจุดไหนชำรุด/อันตราย
* ข้อมูลที่ระบุตัวบุคคลยังได้รับการปกป้องด้วยการกรองฟิลด์ที่ Backend และการลบ EXIF/GPS จากรูป
* **ทางเลือกที่พิจารณา:** งานแจ้งซ่อมแบบส่วนตัว (ตาม ADR-001 เดิม) — ไม่เลือก เพราะทำให้เกิดการแจ้งซ้ำซ้อน และผู้ใช้ไม่รู้จุดอันตราย

### 4. TanStack Query + React Context
* ข้อมูลเกือบทั้งหมดเป็น Server State (โพสต์ งานซ่อม การแจ้งเตือน) TanStack Query จัดการ Cache, Refetch และ Invalidation ได้ในตัว และเข้ากับ SSE (Invalidate Query เมื่อได้รับ Event)
* Client State มีเพียง Session ซึ่ง React Context เพียงพอ
* **ทางเลือกที่พิจารณา:** Redux Toolkit / Zustand — ไม่เลือก เพราะต้องเขียนโค้ดจัดการ Cache ของ Server State เองหรือเพิ่ม Boilerplate โดยไม่จำเป็น

### 5. Stream Ticket สำหรับ SSE
* ป้องกัน JWT รั่วไหลผ่าน URL / Server Log เพราะ Ticket อายุสั้นและใช้ได้ครั้งเดียว
* **ทางเลือกที่พิจารณา:** ส่ง Access Token ใน Query String หรือใช้ Polyfill ของ EventSource ที่ส่ง Header ได้ — ไม่เลือก เพราะเสี่ยงต่อ Token รั่วไหล หรือเพิ่ม Dependency

### 6. นำ Redis และ Lab Service ออก
* ADR-001 ตั้งใจให้ APScheduler + PostgreSQL เพียงพอสำหรับขนาดระบบนี้ การมี Redis โดยไม่มีผู้ใช้งานเพิ่มภาระดูแลระบบ
* Lab Code เดิมเป็นภาษา JavaScript ซึ่งไม่ตรงกับ Stack ใน ADR-001

---

##  ผลที่ตามมาจากการตัดสินใจ (Consequences)

###  ผลเชิงบวก (Positive Consequences)

1. **เอกสารสอดคล้องกัน:** README, NFR, C4 Diagram และ API Contract อ้างอิงกฎชุดเดียวกัน
2. **Dashboard ถูกต้องเสมอ:** กฎ 24/72 ชั่วโมงบังคับ ณ เวลา Query ไม่ขึ้นกับ Worker
3. **ไม่สูญเสียข้อมูล:** ไม่มี Hard Delete ทุกการลบตรวจสอบย้อนหลังได้ผ่าน `audit_logs`
4. **ความปลอดภัยของชุมชน:** งานแจ้งซ่อมสาธารณะช่วยให้ผู้ใช้หลีกเลี่ยงจุดอันตราย
5. **RBAC ทดสอบได้ง่าย:** มีเพียง 3 บทบาทและตารางสิทธิ์ชัดเจน
6. **ลดภาระโครงสร้างพื้นฐาน:** ไม่มี Redis และ Lab Service ที่ไม่ได้ใช้
7. **ขอบเขตชัดเจน:** ทีมโฟกัสฟีเจอร์ที่ส่งมอบได้จริงภายใน 1 ภาคการศึกษา

###  ผลเชิงลบและข้อแลกเปลี่ยน (Negative Consequences & Trade-offs)

1. **ฐานข้อมูลโตขึ้น:** เนื่องจากไม่ลบโพสต์ ต้องมี Index ที่เหมาะสม (`created_at`, `pinned_until`, `status`) และนโยบายเก็บรักษาข้อมูลในอนาคต
2. **การกรองฟิลด์ต้องรัดกุม:** หาก Response Schema ผิดพลาด ข้อมูลส่วนตัวของงานซ่อมอาจรั่วไหล ต้องมี Test ครอบคลุมทุกบทบาท
3. **URL ไฟล์ไม่ต้องใช้ Token:** ผู้ที่ได้ URL ไปสามารถเปิดรูปได้ (บรรเทาด้วย UUID ที่เดาไม่ได้ และการลบ EXIF)
4. **Profanity Filter ไม่สมบูรณ์:** อาจมี False Positive/Negative ต้องมีระบบรายงานโดยผู้ใช้เป็นด่านที่สอง
5. **Moderation รวมที่ Admin:** ภาระงานของ Admin สูงขึ้น หากผู้ใช้เพิ่มขึ้นอาจต้องแยกบทบาท Moderator (Review Trigger)
6. **ไม่มี Push Notification ภายนอก:** ผู้ใช้ต้องเปิดเว็บอยู่จึงจะได้รับแจ้งเตือนแบบเรียลไทม์
7. **Dependency เพิ่มขึ้น:** PyThaiNLP มีขนาดใหญ่ ทำให้ Image ของ Backend ใหญ่ขึ้น

---

##  ประเด็นด้านความปลอดภัย (Security Considerations)

* **Backend RBAC เท่านั้น:** ทุก Endpoint ตรวจสิทธิ์ตามตาราง RBAC ข้อ 2 ค่า `permissions` ใน Response ใช้เพื่อ UI เท่านั้น
* **Field-level Filtering:** ข้อมูลส่วนตัวของงานซ่อม (ผู้แจ้ง, พิกัด GPS, ช่าง, บันทึกภายใน) กรองที่ Response Schema ของ Backend
* **EXIF/GPS Stripping:** รูปทุกรูปต้องถูกลบ Metadata ก่อนจัดเก็บ
* **File Validation:** ตรวจ Magic Bytes, จำกัดขนาด 5 MB, เปลี่ยนชื่อเป็น UUID ไม่ใช้ชื่อไฟล์จากผู้ใช้
* **Token Handling:** Access Token อยู่ใน Memory เท่านั้น Refresh Token เป็น `httpOnly` Cookie และตรวจ `Origin` บน Production
* **SSE Ticket:** อายุ 60 วินาที ใช้ได้ครั้งเดียว ไม่ใส่ JWT ใน URL
* **Bootstrap Admin:** Credential มาจาก Environment Variables เท่านั้น ห้าม Commit ลง Git
* **Role Escalation:** ผู้สมัครใหม่เป็น `student` เสมอ admin เปลี่ยนบทบาทตัวเองไม่ได้ ทุกการเปลี่ยนบทบาทบันทึกใน `audit_logs`
* **Soft Delete + Audit Trail:** การลบ การปักหมุด การมอบหมายงาน และการจัดการรายงาน ต้องบันทึกผู้กระทำและเวลา
* **Pin Ceiling:** เพดาน 72 ชั่วโมงบังคับที่ฐานข้อมูล (CHECK) และ Query ไม่ใช่เฉพาะใน API
* **Rate Limiting (ปรับหลังการทดสอบ 2026-10-05):** ผู้ใช้ทั้งวิทยาเขตออกอินเทอร์เน็ตผ่าน NAT/Wi-Fi ไม่กี่ IP การจำกัดต่อ IP อย่างเดียวจะล็อกทุกคน จึงจำกัดการ login ต่อ (IP + อีเมล) 10 ครั้ง/นาที, การรายงาน/อัปโหลดต่อผู้ใช้ และใช้เพดานต่อ IP ที่สูงเพื่อกันแค่ flood — API เชื่อ `X-Forwarded-For` จาก proxy ของแพลตฟอร์มเท่านั้น
* **Refresh Token หลายแท็บ:** token ที่เพิ่งถูกหมุนใช้ซ้ำได้ภายใน 30 วินาทีเมื่อ family ยังมี token ที่ใช้งานได้ (หลายแท็บ refresh พร้อมกัน) — นอกช่วงนี้หรือหลัง logout ยังถือเป็นการขโมยและยกเลิกทั้ง family
* **Connection Management:** connection ของฐานข้อมูลต้องถูกคืน pool ภายใน thread ที่ใช้งานเสมอ (ป้องกัน deadlock ระหว่าง threadpool กับ connection pool ที่พบจาก load test) — ดู `backend/app/routes/route_class.py` และ `backend/app/db.py`

---

##  เงื่อนไขในการทบทวนการตัดสินใจ (Review Triggers)

ควรทบทวน ADR ฉบับนี้เมื่อเกิดเหตุการณ์ต่อไปนี้:

1. ภาระงาน Moderation ของ Admin สูงจนต้องแยกบทบาท Moderator
2. มีความต้องการบทบาทใหม่ (เช่น ช่างภายนอกที่ไม่ใช่บุคลากร)
3. มีเหตุการณ์ข้อมูลส่วนตัวในงานแจ้งซ่อมรั่วไหล หรือมีข้อกำหนด PDPA เพิ่มเติม
4. ต้องการแสดงรูปภาพแก่ผู้ใช้ที่ไม่ได้ล็อกอิน (ต้องทบทวนนโยบาย URL ไฟล์)
5. Profanity Filter มีอัตรา False Positive สูงจนกระทบการใช้งาน
6. ต้องการนำ Redis, Message Queue หรือ External Push Notification กลับมาใช้
7. มหาวิทยาลัยเปิดให้เชื่อมต่อ University SSO หรือบริการแผนที่
8. ฟีเจอร์ที่อยู่นอกขอบเขต (ข้อ 11) ถูกนำกลับเข้ามาใน Release ถัดไป
9. ขนาดฐานข้อมูลโตจนต้องกำหนดนโยบาย Archive/Retention ของโพสต์เก่า
10. ภาระจริงเกิน ~30 req/s ต่อ process (ผล stress test 2026-10-05) — ต้องรันหลาย process/instance ซึ่งต้องย้าย SSE broker, rate limiter และรายการ stream ticket ที่ใช้แล้วจากหน่วยความจำไปไว้ที่ PostgreSQL (LISTEN/NOTIFY) หรือ Redis
