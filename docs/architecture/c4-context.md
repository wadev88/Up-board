```mermaid
C4Context
    title C4 Level 1: System Context Diagram - UP Board Platform

    Person(admin, "ผู้ดูแลระบบ (admin)", "จัดการผู้ใช้และบทบาท คัดกรองเนื้อหาและรายงาน ปักหมุดได้ทุกโพสต์")
    Person(building_staff, "กองอาคารสถานที่ (building_staff)", "สร้างประกาศ ตั้งความเร่งด่วน มอบหมายช่าง และตรวจรับงานซ่อม")
    Person(technician, "ช่าง (technician)", "ดำเนินงานซ่อมที่ได้รับมอบหมายและส่งตรวจ")
    Person(student_club, "สโมสร / ชมรม / องค์กร (student_club)", "สร้างกิจกรรมและปักหมุดกิจกรรมของตน")
    Person(learner, "นิสิต (student)", "ดู Dashboard สร้างโพสต์ แจ้งซ่อม แจ้งของหาย และรายงานเนื้อหาไม่เหมาะสม")
    Person(teacher, "อาจารย์ (teacher)", "ดู Dashboard สร้างโพสต์ แจ้งซ่อม แจ้งของหาย และรายงานเนื้อหาไม่เหมาะสม")

    System(upboard, "UP Board Platform", "กระดานข่าวสาร แจ้งซ่อม และของหาย/ได้คืน ภายในมหาวิทยาลัย พร้อมแจ้งเตือนในแอปแบบเรียลไทม์ (SSE)")

    System_Ext(supabase, "Supabase Auth", "จัดการ OAuth 2.0 PKCE สำหรับ Google Sign-In")
    System_Ext(google, "Google OAuth", "ยืนยันตัวตนและอีเมลบัญชี Google")
    System_Ext(sso, "University SSO (อนาคต — ยังไม่เชื่อมต่อ)", "ระบบยืนยันตัวตนของมหาวิทยาลัย — Review Trigger ของ ADR-001 ไม่มีการเชื่อมต่อใน Release นี้")

    Rel(learner, upboard, "ใช้งานผ่านเว็บเบราว์เซอร์", "HTTPS")
    Rel(building_staff, upboard, "จัดการประกาศและมอบหมาย/ตรวจรับงานซ่อม", "HTTPS")
    Rel(technician, upboard, "อัปเดตงานซ่อมที่ได้รับมอบหมาย", "HTTPS")
    Rel(student_club, upboard, "สร้างกิจกรรมและปักหมุดกิจกรรมของตน", "HTTPS")
    Rel(learner, upboard, "ใช้งานเว็บบอร์ดและบริการของระบบ", "HTTPS")
    Rel(teacher, upboard, "ใช้งานเว็บบอร์ดและบริการของระบบ", "HTTPS")
    Rel(admin, upboard, "จัดการผู้ใช้ รายงาน และปักหมุด", "HTTPS")

    Rel(upboard, supabase, "เข้าสู่ระบบด้วย Google และตรวจสอบ Supabase access token", "OAuth 2.0 PKCE / HTTPS")
    Rel(supabase, google, "ยืนยันตัวตนผู้ใช้", "OAuth 2.0 / HTTPS")
```

> **หมายเหตุ (ตาม [ADR-002](./adr/002-business-rules-rbac-and-frontend-libraries.md) และ [ADR-003](./adr/003-roles-repair-flow-spam-programs.md)):**
> * ระบบมี 6 บทบาท: `student`, `teacher`, `technician`, `building_staff`, `student_club` และ `admin` ตาม ADR-003
> * **Google Sign-In:** ใช้ Supabase Auth ผ่าน Google; ระบบตรวจสอบอีเมล `@up.ac.th` จากตัวตนที่ยืนยันแล้วในการเข้าสู่ระบบครั้งแรก โดยไม่มีอีเมลยืนยันผ่าน SMTP
> * **University SSO** แสดงไว้เพื่อการวางแผนเท่านั้น ยังไม่มีความสัมพันธ์ (Relationship) กับระบบ
> * ระบบแจ้งเตือนภายนอก (LINE / Web Push) และบริการแผนที่ภายนอก **อยู่นอกขอบเขต** — การแจ้งเตือนทั้งหมดเป็นแบบ In-app ผ่าน SSE และตำแหน่งงานซ่อมใช้ข้อความ + พิกัด GPS จากอุปกรณ์ของผู้แจ้ง
> * แผนภาพนี้ไม่ระบุ Hostname, IP หรือ Port จริงตามข้อกำหนดด้านความปลอดภัยของ ADR-001
