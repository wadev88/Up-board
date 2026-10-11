# Tech Stack for UP Board

ตารางสรุปเทคโนโลยีที่เลือกใช้ในแต่ละ Layer ของระบบ UP Board พร้อมเหตุผลเชิงบริบท (Rationale) ตัวเลือกสำรอง (Alternative) และ ADR ที่เป็นแหล่งอ้างอิง

> เอกสารนี้สรุปจาก [ADR-001](./adr/001-use-restful-api-internal-commu.md), [ADR-002](./adr/002-business-rules-rbac-and-frontend-libraries.md) และ [ADR-003](./adr/003-roles-repair-flow-spam-programs.md) — หากต้องการเปลี่ยนเทคโนโลยีหรือกฎที่ตัดสินใจไว้ ต้องเขียน ADR ใหม่ก่อน (ดู [ADR Index](./adr/README.md))

---

## 🖥️ 1. Frontend

| Choice | Rationale | Alternative | Source ADR |
| :--- | :--- | :--- | :---: |
| **Next.js 16 + React 19 + TypeScript** | ทีมมีพื้นฐาน React/TS อยู่แล้ว Next.js ช่วยจัด Routing/Layout ได้เร็ว เหมาะกับ UI ที่มีการโต้ตอบสูง (ฟีด, Dashboard, แบบฟอร์มแจ้งซ่อม) และ TS ลดข้อผิดพลาดในการรับส่งข้อมูลกับ API | Vue.js / Svelte / Vite + React | ADR-001 |
| **TanStack Query** (Server State) | ข้อมูลส่วนใหญ่เป็น Server State มี Cache/Refetch/Invalidation ในตัว และ Invalidate ได้ทันทีเมื่อได้รับ Event จาก SSE | Redux Toolkit / Zustand | ADR-002 |
| **React Context** (Session State) | Client State มีเพียงข้อมูล Session และ Access Token ในหน่วยความจำ ไม่ต้องใช้ Library เพิ่ม | Zustand | ADR-002 |
| **Tailwind CSS 4 + Radix UI + lucide-react + sonner** | Tailwind ใช้จัดรูปแบบ UI, Radix รองรับ Accessible Dialog/Tab/Select และ lucide-react กับ sonner ใช้แสดงไอคอนและ Toast | CSS Modules / MUI / Chakra UI | ADR-002 |
| **react-hook-form + zod** | ตรวจสอบฟอร์มฝั่ง Client ด้วย Schema แบบ Type-safe สอดคล้องกับ Pydantic ฝั่ง Backend | Formik + Yup | ADR-002 |

## ⚙️ 2. Backend

| Choice | Rationale | Alternative | Source ADR |
| :--- | :--- | :--- | :---: |
| **Python + FastAPI + Pydantic v2** | ตรงกับทักษะทีม พัฒนา REST API ได้เร็ว ตรวจสอบ Request/Response ด้วย Pydantic และสร้าง Swagger UI/OpenAPI อัตโนมัติ | Node.js + Express / Django REST Framework | ADR-001 |
| **python-multipart** | รองรับ `multipart/form-data` สำหรับ `POST /uploads` ใน FastAPI | — | ADR-002 |
| **PyThaiNLP** | ตัดคำภาษาไทยสำหรับ Profanity Filter ลด False Positive จากการจับคำย่อยในคำปกติ | Regex / Substring Matching | ADR-002 |

## 🗄️ 3. Database / ORM / Migration

| Choice | Rationale | Alternative | Source ADR |
| :--- | :--- | :--- | :---: |
| **PostgreSQL 16** | ข้อมูลมีความสัมพันธ์ชัดเจน (ผู้ใช้ → โพสต์ → งานซ่อม → ประวัติสถานะ) ต้องการ ACID, Foreign Key และ `CHECK` Constraint (เช่น เพดานปักหมุด 72 ชั่วโมง) | MySQL / MongoDB | ADR-001, ADR-002 |
| **SQLAlchemy 2** | ORM มาตรฐานของ Python จัดการ Model และ Query อย่างเป็นระบบ | SQLModel / Tortoise ORM | ADR-001 |
| **Alembic** | ติดตามและควบคุมการเปลี่ยนแปลงโครงสร้างฐานข้อมูลของทุกคนในทีม | สคริปต์ SQL ด้วยมือ | ADR-001 |

## ⚡ 4. Real-time

| Choice | Rationale | Alternative | Source ADR |
| :--- | :--- | :--- | :---: |
| **Server-Sent Events (SSE)** | การสื่อสารเป็นทางเดียว (Backend → Frontend) สำหรับโพสต์ใหม่ การแจ้งเตือน และสถานะงานซ่อม เรียบง่ายกว่า WebSocket | WebSocket / Polling | ADR-001 |
| **sse-starlette** | Library SSE สำหรับ FastAPI/Starlette รองรับ Ping (ทุก 15 วินาที) และการตัด Connection | เขียน `StreamingResponse` เอง | ADR-002 |
| **Stream Ticket (60 วินาที, ใช้ครั้งเดียว)** | `EventSource` ส่ง Header `Authorization` ไม่ได้ จึงแลก Ticket ผ่าน `POST /stream/ticket` แล้วเชื่อม `GET /stream?ticket=` โดยไม่ใส่ JWT ใน URL | JWT ใน Query String / EventSource Polyfill | ADR-002 |
| **In-app Notification ผ่าน SSE** | แทน LINE Notify (ยุติบริการมีนาคม 2025) และ External Push ซึ่งอยู่นอกขอบเขต | Web Push / LINE Messaging API (อนาคต) | ADR-002 |

## ⏰ 5. Background Jobs

| Choice | Rationale | Alternative | Source ADR |
| :--- | :--- | :--- | :---: |
| **APScheduler (Worker แยก Process)** | งานตามเวลามีไม่มาก (ยกเลิกหมุดหมดอายุทุก 5 นาที, ลบไฟล์อัปโหลดกำพร้า, ลบ Token หมดอายุ) รันเป็น Process แยกจาก API เพื่อไม่ให้ Job ทำงานซ้ำเมื่อ API มีหลาย Worker | Celery + Redis / Cron ของแพลตฟอร์ม | ADR-001, ADR-002 |

> กฎการแสดงผล 24 ชั่วโมง (Dashboard) และ 72 ชั่วโมง (ปักหมุด) บังคับ ณ เวลา Query เสมอ ความถูกต้องจึงไม่ขึ้นกับ Worker

## 🔐 6. Authentication / Security

| Choice | Rationale | Alternative | Source ADR |
| :--- | :--- | :--- | :---: |
| **JWT + Refresh Token Rotation** | Backend ออก Access Token อายุ 15 นาทีซึ่งเก็บใน Memory และหมุนเวียน Refresh Token ผ่าน `httpOnly` Cookie สำหรับ session ของระบบ | Session Cookie | ADR-001, ADR-002 |
| **Google Login ผ่าน Supabase Auth (เฉพาะ OAuth)** | Frontend ใช้ Supabase Auth ทำ OAuth 2.0 PKCE; Backend ตรวจสอบ token และอีเมลที่ยืนยันแล้ว โดยอนุญาตเฉพาะ `@up.ac.th` ตามกติกาการสมัคร/เข้าสู่ระบบของระบบ | University SSO (อนาคต) | ADR-003 |
| **PyJWT** | ออกและตรวจสอบ JWT ฝั่ง Backend | python-jose | ADR-002 |
| **Argon2 (argon2-cffi)** | Hash รหัสผ่านด้วยอัลกอริทึมที่ทนต่อการโจมตีด้วย GPU | bcrypt | ADR-001, ADR-002 |
| **RBAC ที่ Backend (`student` / `teacher` / `technician` / `building_staff` / `student_club` / `admin`)** | 6 บทบาท ตรวจสิทธิ์ทุก Endpoint ที่ Backend และกรองฟิลด์ส่วนตัวของงานซ่อมใน Response Schema; Frontend ใช้ permissions เพื่อแสดง/ซ่อนปุ่มเท่านั้น | ตรวจสิทธิ์ที่ Frontend อย่างเดียว (ไม่ปลอดภัย) | ADR-003 |

## 🖼️ 7. File Storage

| Choice | Rationale | Alternative | Source ADR |
| :--- | :--- | :--- | :---: |
| **Local File Storage → S3-compatible Object Storage** | ใช้ Local ในช่วงพัฒนา และเปลี่ยนเป็น Object Storage เมื่อใช้งานจริง (ไฟล์ Local อาจหายเมื่อ Redeploy) | Cloudinary / Supabase Storage | ADR-001 |
| **Pillow** | ตรวจภาพและลบ EXIF/GPS ก่อนจัดเก็บ รับเฉพาะ jpeg/png/webp ≤ 5 MB ตรวจจาก Magic Bytes และเปลี่ยนชื่อเป็น UUID | ImageMagick (Wand) | ADR-002 |

## 🧪 8. Testing

| Choice | Rationale | Alternative | Source ADR |
| :--- | :--- | :--- | :---: |
| **Vitest + Testing Library** | Unit/Component Test ฝั่ง Frontend เร็วและเข้ากับ TypeScript | Jest + Enzyme | ADR-002 |
| **Playwright + axe** | E2E Test และตรวจ Accessibility (WCAG 2.1 AA ตาม NFR-07) | Cypress | ADR-002 |

## 🐳 9. DevOps / CI/CD

| Choice | Rationale | Alternative | Source ADR |
| :--- | :--- | :--- | :---: |
| **Docker Compose (Local Development เท่านั้น)** | รัน `db` + `backend` + `worker` + `frontend` บนเครื่องด้วยคำสั่งเดียว — **ไม่มี Redis** (การนำกลับมาเป็น Review Trigger ของ ADR-001) | ติดตั้งทุกอย่างบนเครื่องเอง | ADR-002 |
| **GitHub Actions (CI/CD)** | CI รัน Lint/Test ทุก PR (Green Build Policy) และ CD เรียก Render Deploy Hook หลัง Merge เข้า `main` | GitLab CI | ADR-002 |

> Lab Code เดิม (`services/stats-service` และ `src/*.js`) ถูกปลดระวางแล้ว เก็บไว้เป็นประวัติแต่ไม่ Build/Deploy (ADR-002)

## ☁️ 10. Hosting

| Choice | Rationale | Alternative | Source ADR |
| :--- | :--- | :--- | :---: |
| **Vercel (Frontend)** | รองรับ Next.js โดยตรง ตั้งค่าง่าย เหมาะกับการสาธิตผลงาน | Netlify | ADR-001 |
| **Render (Backend API + Worker)** | รองรับ Python มี Free Tier ไม่ต้องดูแล Server เอง (ข้อแลกเปลี่ยน: Cold Start / Sleep Mode) | Railway / Fly.io / AWS EC2 | ADR-001 |
| **PostgreSQL แบบ Managed (แยกจาก Frontend/Backend)** | ฐานข้อมูลแยกออกจากแอปพลิเคชันตาม ADR-001 | Supabase / Neon | ADR-001 |
