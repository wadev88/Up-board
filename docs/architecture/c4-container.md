```mermaid
C4Container
    title C4 Level 2: Container Diagram - UP Board Platform

    Person(admin, "ผู้ดูแลระบบ (admin)", "จัดการผู้ใช้ รายงาน และปักหมุดได้ทุกโพสต์")
    Person(building_staff, "กองอาคารสถานที่ (building_staff)", "สร้างประกาศ ตั้งความเร่งด่วน มอบหมายช่าง และตรวจรับงานซ่อม")
    Person(technician, "ช่าง (technician)", "ดำเนินงานซ่อมที่ได้รับมอบหมายและส่งตรวจ")
    Person(student_club, "สโมสร / ชมรม / องค์กร (student_club)", "สร้างกิจกรรมและปักหมุดกิจกรรมของตน")
    Person(user, "นิสิต / อาจารย์ (student / teacher)", "ดู Dashboard สร้างโพสต์ แจ้งซ่อม แจ้งของหาย และรายงานเนื้อหา")

    System_Boundary(upboard, "UP Board Platform") {
        Container(frontend, "Frontend Web Application", "Next.js, React, TypeScript — Vercel", "Dashboard, หน้าหมวดหมู่, แบบฟอร์มโพสต์/แจ้งซ่อม/ของหาย, หน้า Admin, เก็บ Access Token ใน Memory และรับ Event ผ่าน EventSource")
        Container(backend, "Backend API", "Python, FastAPI — Render", "REST API /api/v1: Auth + ตรวจสอบตัวตน Google จาก Supabase Auth, RBAC, โพสต์, ปักหมุด, งานซ่อม, ของหาย, Upload, รายงาน, แจ้งเตือน และ SSE Stream")
        Container(worker, "Background Worker", "Python, APScheduler — Process แยกจาก API", "ทุก 5 นาที: ยกเลิกหมุดที่หมดอายุ, ลบไฟล์อัปโหลดกำพร้า, ลบ Token ที่หมดอายุ")
        ContainerDb(database, "Primary Database", "PostgreSQL", "ผู้ใช้ บทบาท สิทธิ์ คณะ โพสต์ กิจกรรม งานซ่อมและประวัติสถานะ ของหาย ไฟล์แนบ รายงาน การแจ้งเตือน และ Audit Log")
        ContainerDb(storage, "File Storage", "Local File Storage → S3-compatible Object Storage", "รูปภาพที่ลบ EXIF แล้ว ตั้งชื่อด้วย UUID")
    }

    System_Ext(supabase, "Supabase Auth", "จัดการ OAuth 2.0 PKCE สำหรับ Google Sign-In")
    System_Ext(google, "Google OAuth", "ยืนยันตัวตนและอีเมลบัญชี Google")

    Rel(user, frontend, "ใช้งานผ่านเว็บเบราว์เซอร์", "HTTPS")
    Rel(building_staff, frontend, "จัดการประกาศและมอบหมาย/ตรวจรับงานซ่อม", "HTTPS")
    Rel(technician, frontend, "อัปเดตงานซ่อมที่ได้รับมอบหมาย", "HTTPS")
    Rel(student_club, frontend, "สร้างกิจกรรมและปักหมุดกิจกรรมของตน", "HTTPS")
    Rel(admin, frontend, "จัดการผู้ใช้และรายงาน", "HTTPS")

    Rel(frontend, supabase, "เริ่ม Google Sign-In และรับ Authorization Code", "OAuth 2.0 PKCE / HTTPS")
    Rel(supabase, google, "ยืนยันตัวตนผู้ใช้", "OAuth 2.0 / HTTPS")
    Rel(frontend, backend, "เรียกใช้ REST API (Bearer JWT, Refresh Cookie)", "JSON/HTTPS")
    Rel(backend, frontend, "Push โพสต์ใหม่ การแจ้งเตือน และสถานะงานซ่อม (Stream Ticket)", "SSE/HTTPS")
    Rel(frontend, backend, "โหลดรูปผ่าน URL ที่เดาไม่ได้ (ไม่ต้องใช้ Token)", "HTTPS")

    Rel(backend, database, "อ่านและเขียนข้อมูล", "SQL (SQLAlchemy)")
    Rel(backend, storage, "บันทึกและอ่านรูปที่ผ่านการตรวจสอบแล้ว", "File I/O / S3 API")
    Rel(worker, database, "ยกเลิกหมุดที่หมดอายุ ลบ Token หมดอายุ ค้นหาไฟล์กำพร้า", "SQL (SQLAlchemy)")
    Rel(worker, storage, "ลบไฟล์อัปโหลดที่ไม่ได้ผูกกับโพสต์เกิน 24 ชม.", "File I/O / S3 API")
```

> **หมายเหตุ (ตาม [ADR-001](./adr/001-use-restful-api-internal-commu.md), [ADR-002](./adr/002-business-rules-rbac-and-frontend-libraries.md) และ [ADR-003](./adr/003-roles-repair-flow-spam-programs.md)):**
> * **Background Worker** รันเป็น Process แยกจาก API เพื่อไม่ให้ Job ทำงานซ้ำ — กฎแสดงผล 24 ชม. (Dashboard) และ 72 ชม. (ปักหมุด) บังคับที่ Query ของ Backend เสมอ Worker จึงไม่ใช่ตัวตัดสินความถูกต้อง
> * **SSE:** Frontend ขอ Ticket อายุ 60 วินาทีผ่าน `POST /stream/ticket` แล้วเปิด `GET /stream?ticket=...` เพราะ `EventSource` ส่ง Header `Authorization` ไม่ได้
> * **Google Sign-In:** Frontend ใช้ Supabase Auth ทำ OAuth 2.0 PKCE; Backend ตรวจสอบ Supabase access token และยืนยันอีเมล `@up.ac.th` ในการเข้าสู่ระบบครั้งแรก ไม่มีการส่งอีเมลยืนยันผ่าน SMTP
> * รูปภาพให้บริการผ่าน Endpoint `GET /files/{key}` ของ Backend API โดย key เป็น UUID ที่เดาไม่ได้ จึงใช้ใน `<img>` ได้โดยไม่ต้องส่ง Token
> * **University SSO, ระบบแจ้งเตือนภายนอก (LINE / Web Push) และบริการแผนที่** ไม่อยู่ในแผนภาพนี้ เพราะอยู่นอกขอบเขตของ Release นี้ (อนาคต — ยังไม่เชื่อมต่อ)
> * **Redis ถูกนำออก** — Docker Compose (`db` + `backend` + `worker` + `frontend`) ใช้สำหรับพัฒนาบนเครื่องเท่านั้น Production ใช้ Vercel + Render
> * ไม่ระบุ Hostname, IP หรือ Port จริงตามข้อกำหนดด้านความปลอดภัยของ ADR-001
