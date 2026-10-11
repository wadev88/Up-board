# Non-Functional Requirements (NFR) — UP Board

เอกสารนี้กำหนดข้อกำหนดด้านคุณภาพของระบบ (**Quality Attributes**) สำหรับระบบ **UP Board** โดยเน้นเกณฑ์วัดผลเชิงปริมาณที่ชัดเจน (**Measurable**) และตอบสนองต่อจุดเด่นของระบบในการจัดหมวดหมู่ข่าวสาร การซ่อนโพสต์จากหน้าแรกอัตโนมัติใน 24 ชั่วโมง และการส่งตรงเรื่องแจ้งซ่อมถึงเจ้าหน้าที่

> อ้างอิงการตัดสินใจเชิงสถาปัตยกรรมจาก [ADR-001](../architecture/adr/001-use-restful-api-internal-commu.md) และ [ADR-002](../architecture/adr/002-business-rules-rbac-and-frontend-libraries.md)

---

## ⚡ 1. Performance (ประสิทธิภาพของระบบ)

### NFR-01: Category Feed Loading Time
* **ข้อกำหนด:** ระบบต้องโหลดและแสดงผลรายการโพสต์ในแต่ละหมวดหมู่ (เช่น ข่าวกิจกรรม, ของหาย, เรื่องราวดีๆ, เรื่องเร่งด่วน) ได้ภายในเวลาไม่เกิน **2 วินาที** สำหรับ 95% ของคำขอ (95th Percentile) เมื่อเชื่อมต่อผ่านเครือข่าย 4G/Wi-Fi มหาวิทยาลัยพะเยา
* **เกณฑ์วัดผล (Metric):** Response Time $\le$ 2 วินาที

### NFR-02: Instant Maintenance Dispatch Latency
* **ข้อกำหนด:** เมื่อมีการโพสต์แจ้งเหตุเด่น/งานซ่อมบำรุง ระบบต้องคัดแยกและส่งข้อมูลไปยัง Dashboard ของเจ้าหน้าที่ซ่อมบำรุงที่เกี่ยวข้องโดยอัตโนมัติภายในเวลาไม่เกิน **3 วินาที**
* **เกณฑ์วัดผล (Metric):** Dispatch Processing Time $\le$ 3 วินาที

### NFR-03: Real-Time In-App Notification Latency
* **ข้อกำหนด:** ระบบต้องส่งการแจ้งเตือนภายในแอป (In-app Notification) ผ่าน **Server-Sent Events (SSE)** สำหรับประกาศปักหมุด เรื่องเร่งด่วน และการเปลี่ยนสถานะงานซ่อม ไปยังผู้ใช้ที่เกี่ยวข้องซึ่งเปิดเว็บอยู่ ภายในเวลาไม่เกิน **5 วินาที** นับจากเหตุการณ์ถูกบันทึกในระบบ (ไม่ใช้ LINE Notify ซึ่งยุติบริการเมื่อมีนาคม 2025 และไม่มี External Push ใน Release นี้ ตาม ADR-002)
* **เกณฑ์วัดผล (Metric):** SSE Notification Latency $\le$ 5 วินาที สำหรับ 99% ของการแจ้งเตือน

---

## 🔒 2. Security (ความปลอดภัยและการคัดกรองสิทธิ์)

### NFR-04: University Email Verification, JWT Authentication & RBAC
* **ข้อกำหนด:** ระบบต้องยืนยันตัวตนผู้ใช้ด้วยการสมัครผ่านอีเมล **`@up.ac.th`** และยืนยันอีเมลก่อนเปิดใช้งานบัญชี จากนั้นเข้าสู่ระบบด้วย **JWT** (Access Token อายุ 15 นาที + Refresh Token ใน `httpOnly` Cookie) ตาม ADR-001/ADR-002 พร้อมกำหนดสิทธิ์การเข้าถึง (Role-Based Access Control) ที่ Backend แยกเป็น 3 บทบาท ได้แก่ **นิสิต (`student`)**, **บุคลากร/เจ้าหน้าที่ (`staff`, รวมช่างซ่อมที่มีโปรไฟล์ technician)** และ **ผู้ดูแลระบบ (`admin`)** — การเชื่อมต่อ University SSO เป็นแผนในอนาคต
* **เกณฑ์วัดผล (Metric):** 100% ของบัญชีที่ใช้งานได้ต้องเป็นอีเมล `@up.ac.th` ที่ยืนยันแล้ว, Unauthorized Access Rate = 0% (ทุก Endpoint ตรวจสิทธิ์ที่ Backend)

### NFR-05: Data Privacy & Protection
* **ข้อกำหนด:** ข้อมูลส่วนบุคคล (PII) และ Log การใช้งาน ต้องได้รับการเข้ารหัสขณะจัดเก็บ (At Rest) ด้วยมาตรฐาน **AES-256** และขณะรับส่ง (In Transit) ผ่าน **TLS 1.3** ตามกฎหมาย PDPA
* **เกณฑ์วัดผล (Metric):** Encryption Standard = AES-256 / TLS 1.3, Data Breach Rate = 0%

---

## 👁️ 3. Usability (ความง่ายและการจัดระเบียบการใช้งาน)

### NFR-06: Fast Post Creation & Categorization
* **ข้อกำหนด:** นิสิตและบุคลากรต้องสามารถสร้างโพสต์ เลือกหมวดหมู่ และกดเผยแพร่สำเร็จได้ภายใน **3 คลิก (3-Taps)** และใช้เวลาไม่เกิน **30 วินาที** โดยไม่ต้องศึกษาคู่มือการใช้งาน
* **เกณฑ์วัดผล (Metric):** Task Completion Time $\le$ 30 วินาที, Success Rate $\ge$ 95% สำหรับผู้ใช้ใหม่

### NFR-07: Mobile Responsiveness & Accessibility
* **ข้อกำหนด:** ส่วนต่อประสานผู้ใช้ (UI) ต้องแสดงผลได้สมบูรณ์แบบบนหน้าจอมือถือทุกขนาด (Responsive Design) มีขนาด Touch Target ไม่ต่ำกว่า **48x48 pixels** และผ่านมาตรฐานความยากง่ายในการเข้าถึง WCAG 2.1 Level AA
* **เกณฑ์วัดผล (Metric):** Touch Target $\ge$ 48x48px, WCAG 2.1 Level AA Compliance

---

## 🛠️ 4. Maintainability (ความสามารถในการบำรุงรักษา)

### NFR-08: Automated Pin Expiry & Upload Cleanup (Background Worker)
* **ข้อกำหนด:** Background Worker (APScheduler แยก Process จาก API) ต้องทำงานอัตโนมัติ **ทุก 5 นาที** เพื่อยกเลิกหมุดของโพสต์ที่หมดเวลาปักหมุด และลบไฟล์อัปโหลดกำพร้า (ไม่ได้ผูกกับโพสต์เกิน 24 ชั่วโมง) โดยไม่กระทบต่อประสิทธิภาพหลักของระบบ — กฎการแสดงผลบน Dashboard (โพสต์ทั่วไป 24 ชั่วโมง, ปักหมุดสูงสุด 72 ชั่วโมง) **บังคับ ณ เวลา Query** จึงถูกต้องเสมอแม้ Worker จะล่าช้าหรือหยุดทำงาน และ **ระบบไม่ลบโพสต์** (โพสต์ที่เกิน 24 ชั่วโมงยังค้นหาได้ในหน้าหมวดหมู่)
* **เกณฑ์วัดผล (Metric):** รอบการทำงานทุก 5 นาที, Execution Time ต่อรอบ $\le$ 5 นาที (ไม่เกินรอบถัดไป), System Downtime จาก Job = 0 วินาที, จำนวนโพสต์ที่ถูก Hard Delete = 0

### NFR-09: Dynamic Pinned Post & Category Management
* **ข้อกำหนด:** การกำหนดปักหมุดประกาศสำคัญ (ปักหมุดได้ **สูงสุด 72 ชั่วโมง** — staff ปักหมุดได้เฉพาะโพสต์ในคณะตัวเอง, admin ได้ทุกโพสต์) หรือการปรับเปลี่ยนหมวดหมู่โพสต์ผ่านระบบ Admin ต้องมีผลแสดงผลทันทีภายใน **1 นาที** โดยไม่ต้อง Restart หรือ Re-deploy ระบบ
* **เกณฑ์วัดผล (Metric):** Update Propagation Time $\le$ 1 นาที, ระยะเวลาปักหมุด $\le$ 72 ชั่วโมง (บังคับด้วย DB CHECK Constraint)

---

## 🌐 5. Availability & Reliability (ความพร้อมใช้งาน)

### NFR-10: Campus Hours System Uptime
* **ข้อกำหนด:** ระบบต้องมีความพร้อมใช้งาน (Availability) ไม่ต่ำกว่า **99.5%** ในช่วงเวลา 07:00–23:00 น. ของทุกวัน เพื่อรองรับการใช้งานช่วงเปิดเรียนและการสัญจรในมหาวิทยาลัย
* **เกณฑ์วัดผล (Metric):** Uptime $\ge$ 99.5% (Downtime สะสมไม่เกิน 4.5 ชั่วโมงต่อเดือน ในช่วงเวลาบริการ)

---

## 📈 6. Scalability (การรองรับผู้ใช้งาน)

### NFR-11: Concurrent User Load Handling
* **ข้อกำหนด:** ระบบต้องรองรับผู้ใช้งานพร้อมกัน (Concurrent Users) ได้อย่างน้อย **300 คน** ในช่วงที่มีประกาศสำคัญหรือเหตุการณ์เร่งด่วน โดย Response Time ของ 95% ของคำขอต้องไม่เกิน **3 วินาที**
* **เกณฑ์วัดผล (Metric):** Concurrent Users $\ge$ 300 คน, Error Rate < 0.1%

---

## 📊 ตารางสรุปดัชนีชี้วัด NFR (NFR Metrics Table)

| รหัส | หมวดหมู่ | หัวข้อ NFR | เกณฑ์วัดผลที่เป็นรูปธรรม (Measurable Metric) | ผู้เกี่ยวข้องหลัก |
| :--- | :--- | :--- | :--- | :--- |
| **NFR-01** | Performance | Feed Loading Time | Response Time $\le$ 2 วินาที (95th Percentile) | นิสิต, บุคลากร |
| **NFR-02** | Performance | Maintenance Dispatch Latency | Route ให้เจ้าหน้าที่ซ่อมบำรุง $\le$ 3 วินาที | เจ้าหน้าที่ซ่อมบำรุง |
| **NFR-03** | Performance | In-App Notification Latency (SSE) | SSE Notification Latency $\le$ 5 วินาที (99%) | ผู้ใช้ทุกคน |
| **NFR-04** | Security | @up.ac.th Email Verification + JWT & RBAC (3 บทบาท) | บัญชี `@up.ac.th` ที่ยืนยันแล้ว 100%, Unauthorized Access = 0 | ผู้ใช้ทุกคน |
| **NFR-05** | Security | Data Protection | Encryption AES-256 / TLS 1.3 | Admin |
| **NFR-06** | Usability | Fast Post Creation | $\le$ 3 Clicks, Task Time $\le$ 30 วินาที, Success Rate $\ge$ 95% | นิสิต, บุคลากร |
| **NFR-07** | Usability | Mobile UI Accessibility | Touch Target $\ge$ 48x48px, WCAG 2.1 Level AA | ผู้ใช้ทุกคน |
| **NFR-08** | Maintainability | Pin Expiry & Upload Cleanup Job | ทุก 5 นาที, Execution Time $\le$ 5 นาที, Downtime = 0, Hard Delete โพสต์ = 0 | System |
| **NFR-09** | Maintainability | Dynamic Pinned Post Management | Update Propagation Time $\le$ 1 นาที, Pin $\le$ 72 ชั่วโมง | Staff, Admin |
| **NFR-10** | Availability | System Uptime | Uptime $\ge$ 99.5% (ช่วงเวลา 07:00–23:00 น.) | ผู้ใช้ทุกคน |
| **NFR-11** | Scalability | Concurrent User Load | Concurrent Users $\ge$ 300 คน, Response Time $\le$ 3 วินาที | ผู้ใช้ทุกคน |
