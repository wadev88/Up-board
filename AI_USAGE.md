# นโยบายการใช้ Generative AI (AI Usage Guidance)

# AI Usage Declaration (การเปิดเผยการใช้งาน AI)

เอกสารฉบับนี้จัดทำขึ้นเพื่อเปิดเผยการใช้งาน Generative AI ในกระบวนการทำงานของทีม ตามนโยบายของรายวิชา

**1. เครื่องมือ AI ที่ใช้งาน**
*   Google Gemini

**2. ใช้ AI ช่วยทำอะไรบ้าง (AI Assistance)**
*   **Brainstorming:** ใช้ช่วยระดมสมองและต่อยอดไอเดียฟีเจอร์การทำงานต่างๆ ของระบบ โดยอิงข้อมูลตั้งต้นจาก Persona ที่ทีมเป็นผู้กำหนดเอง
*   **Drafting Acceptance Criteria:** ใช้ช่วยร่างโครงสร้าง เกลาภาษา และจัดรูปแบบของ Acceptance Criteria ในแต่ละ User Story เพื่อให้อ่านง่ายและครอบคลุมเงื่อนไข
*   **Effort Estimation:** ใช้ช่วยประเมินขนาดและขอบเขตของงาน (Size S/M/L) ในเบื้องต้น เพื่อนำมาประกอบการตัดสินใจของทีม

**3. กระบวนการตรวจสอบโดยมนุษย์ (Verification Process)**
*   **Human Review:** สมาชิกในทีมได้ทำการอ่านทบทวน (Review) และตรวจสอบผลลัพธ์ที่ได้จาก AI ในทุกๆ ส่วน
*   **Alignment Check:** ทีมได้ทำการปรับแก้เนื้อหา ข้อความ และฟีเจอร์ต่างๆ ให้สอดคล้องกับเป้าหมาย (Product Vision) ของระบบที่ทีมตั้งใจไว้
*   **Final Decision:** การตัดสินใจเลือกฟีเจอร์ โครงสร้างงาน และการประเมินรอบสุดท้าย ล้วนมาจากการพูดคุยตกลงกันของสมาชิกในทีม (ทีมเป็นผู้ตัดสินใจหลัก ไม่ได้ให้ AI ตัดสินใจแทน)

**Lab 3 Requirements & Personas**

* **เครื่องมือ:** Google Gemini
* **Prompt 1 (Personas):** "ช่วยระดมสมองและต่อยอดรายละเอียด User Persona สำหรับระบบ UP Board โดยมีกลุ่มเป้าหมายคือ นิสิต, ผู้ดูแลระบบ (Admin), เจ้าหน้าที่ฝ่ายซ่อมบำรุง และช่างซ่อมบำรุงหน้างาน พร้อมระบุ Goals, Motivations และ Pain Points"
* **Prompt 2 (Formatting):** "ช่วยเกลาภาษาและจัดรูปแบบโครงสร้างไฟล์ Markdown ให้เป็นระเบียบ อ่านง่าย และสวยงาม"
* **Prompt 3 (Scenarios):** "ช่วยร่างขั้นตอน Main User Scenario การแจ้งซ่อมอุปกรณ์ชำรุดและการติดตามสถานะงานผ่านระบบ UP Board ให้ครอบคลุมการทำงานของนิสิตและเจ้าหน้าที่"
* **Prompt 4 (NFRs):** "ช่วยกำหนดและร่างข้อกำหนดด้านคุณภาพของระบบ (Non-Functional Requirements: NFR) จำนวน 11 ข้อ ให้ครอบคลุม 6 ด้าน (Performance, Security, Usability, Maintainability, Availability, Scalability) พร้อมเกณฑ์วัดผลเชิงปริมาณ (Measurable Metrics) ที่เหมาะกับระบบบอร์ดข่าวสารมหาวิทยาลัย"
*  **ส่วนที่รับจาก AI โดยตรง:** โครงสร้างและรูปแบบไฟล์ Markdown (สำหรับ Personas, Scenarios และ NFR), ไอเดียต่อยอด Pain Points เบื้องต้น และการเกลาประโยคภาษาให้เป็นทางการและอ่านง่าย
*  **ส่วนที่ทีมทำเอง:** กำหนดคาแรกเตอร์หลักและบริบทการใช้งานจริงในมหาวิทยาลัยพะเยา (ชื่อตัวละคร, ตำแหน่ง, หน่วยงานกองอาคารสถานที่), เลือกปัญหาที่เกิดขึ้นจริงในแคมปัส, ถ่ายภาพ/นำรูปภาพประกอบมาใส่ในโฟลเดอร์ `images/` และตรวจสอบความถูกต้องของเนื้อหาทั้งหมด

**Lab 4 Pototypes**

   **เครื่องมือ:** Google Gemini
*  **Prompt 1:** "สร้าง HTML สำหรับหน้าหลักของระบบแพลตฟอร์มกระจายข่าวสารและประสานงานเฉพาะถิ่นแบบเบ็ดเสร็จ แยกหมวดหมู่โพสต์ชัดเจน... (ระบุฟีเจอร์ลบอัตโนมัติ 24 ชม., แจ้งซ่อม, ปักหมุด ใช้ plain CSS และ semantic HTML)"
*  **Prompt 2:** "[แนบรูปภาพหน้าเว็บ] อยากทำระบบตรวจจับคำที่ไม่สุภาพหรือล่อแหลม"
*  **Prompt 3:** "ช่วยทำหน้าเว็บสำหรับลบโพสต์หลังจากผ่านไป 24 ชั่วโมงให้หน่อย โดยอิงตามภาพรวมโครงงาน UP Board"
*  **Prompt 4:** "ขอ HTML/JS ที่บอกเวลาโพสต์แบบไม่ปักหมุด 24 ชม. ถ้าปักหมุดแล้วแต่เวลาที่เราเลือกว่าเลือก 3 วันหรือ 7 วัน แก้จากโค้ดเดิม"
*  **ส่วนที่รับจาก AI โดยตรง:** โครงสร้างโค้ด Semantic HTML และ Plain CSS ตั้งต้นสำหรับหน้ากระดานข่าวและหน้าแจ้งซ่อม, ลอจิกและแนวคิดระบบคัดกรองคำหยาบ, สคริปต์ตรวจสอบการลบโพสต์อัตโนมัติเมื่อครบ 24 ชั่วโมง, และโค้ด JavaScript สำหรับจัดการฟีเจอร์ปักหมุด พร้อมระบบคำนวณเวลานับถอยหลังหมดอายุ แยกตามประเภทโพสต์ (24 ชม., 3 วัน, 7 วัน) และการจัดเรียงโพสต์ปักหมุดให้อยู่บนสุด
*   **ส่วนที่ทีมทำเอง:** นำโค้ด HTML/CSS มาประกอบและปรับแต่ง UI ให้ตรงกับ Wireframe ที่ออกแบบไว้, จัดการเชื่อมโยงลิงก์ให้คลิกใช้งานได้จริง, กำหนดชุดคำศัพท์ที่ไม่สุภาพตามบริบท, และนำลอจิกการตั้งเวลาและการปักหมุดมาผสานเข้ากับโครงสร้างเว็บหลัก พร้อมปรับแต่งการแสดงผลป้ายกำกับ วันเวลาให้สวยงามและสอดคล้องกับข้อมูลจำลอง ของทีม

**Lab 5 Architectural_Artifacts**

*  **เครื่องมือ:** Googole Gemini
*  **Prompt 1:** "นี่คือข้อมูลโครงงาน UP Board และ ADR-001 ที่ทีมเขียนไว้ ช่วยสร้างไฟล์ docs/architecture/tech_stack.md — ตารางอย่างน้อย 5 layer พร้อม rationale เชิงบริบทและตัวเลือก alternative ให้หน่อย"
*  **Prompt 2:** "ช่วยตรวจสอบและแนะนำการจัดรูปแบบ ADR ของทีม ให้อยู่ในโครงสร้าง Michael Nygard format (5 Sections) ตามที่โจทย์ Lab 5 กำหนด"
*  **Prompt 3:** "เกณฑ์การส่งงาน PR workflow + screenshots + reflect.md คือต้องแคปหน้าจออะไรบ้าง และนำไปใส่ลงในไหน"
*  **Prompt 4:** "สร้าง C4 level 1 และ 2 ตามโครงสร้างเว็บที่ให้ไปให้หน่อย"
*  **ส่วนที่รับจาก AI โดยตรง:** โครงสร้างตาราง Markdown สำหรับไฟล์ tech_stack.md ที่ประกอบด้วยข้อมูล 5 เลเยอร์ (Frontend, Backend, Database, Hosting, Authentication) พร้อมคำอธิบาย Rationale เชิงบริบทและ Alternative แบบสมบูรณ์
*  **ส่วนที่ทีมทำเอง:** ร่างเนื้อหาและเหตุผลเบื้องต้นสำหรับเอกสาร ADR ด้วยตนเองก่อนนำมาปรับโครงสร้าง, ตัดสินใจเลือกเทคโนโลยีหลักที่จะใช้งานจริง (Next.js, FastAPI, PostgreSQL, ฯลฯ)

**Lab 6 First_Container**

*  **เครื่องมือ:** Google Gemini
*  **Prompt 1:** "จากโครงสร้างไฟล์ในรูป ช่วยเขียน Dockerfile multi-stage สำหรับ Python FastAPI พร้อมอธิบายแต่ละ layer และบอกวิธีตั้งค่า .dockerignore ให้หน่อย"
*  **Prompt 2:** "ช่วยแก้ Error จากการ build image invalid tag ... repository name must be lowercase"
*  **Prompt 3:** "1.ช่วยแก้ Error จาก container Error loading ASGI app. Attribute 'app' not found in module 'app' และสอนวิธีแก้ไขให้รัน uvicorn ผ่าน 2.รายการไฟล์และโฟลเดอร์สำหรับตั้งค่าใน .dockerignore"
*  **ส่วนที่รับจาก AI โดยตรง:** โครงสร้างและคำสั่งใน Dockerfile (เช่น การแบ่ง Stage Builder กับ Production, การตั้งค่า USER appuser เพื่อความปลอดภัย, และคำสั่ง CMD สำหรับรันแอป)
*  **ส่วนที่ทีมทำเอง:** รันคำสั่ง Build และทดสอบการทำงานของ Container จริงในเครื่อง (Local), Push Image ขึ้น Docker Hub และจัดการส่งงานผ่านกระบวนการ Pull Request (PR)

**Lab 7 Refactoring Disclosure**

*  **เครื่องมือ:** GitHub Copilot Chat
*  **Prompt 1:** "โค้ดนี้มี code smell อะไรบ้าง? อธิบายว่าทำไมถึงเป็น smell และส่งผลเสียอย่างไร โดยยังไม่ต้องแก้โค้ด"
*  **Prompt 2:** "เสนอวิธี refactor renderAdminTable() โดยใช้ Extract Method และอธิบายว่าควรแยกส่วนไหนออกมา เพราะอะไร"
*  **Prompt 3:** "ช่วยตรวจว่า refactor นี้ยังคง behavior เดิมของระบบ auto-remove โพสต์ 24 ชั่วโมงหรือไม่ และเสนอ test case ที่ควรมี"
*  **ส่วนที่รับจาก AI โดยตรง:** คำแนะนำในการระบุ Long Method, แนวคิด Extract Method และรายการกรณีทดสอบเบื้องต้น
*  **ส่วนที่ทีมทำเอง:** ทีมเลือกขอบเขตของการ refactor ตรวจสอบ behavior เดิม เขียน regression test และเขียน implementation ของ `getFilteredPosts()`, `createAdminRow()`, `bindAdminTableActions()` และ `renderAdminTable()` เอง

**Lab 9 Testing and CI Disclosure**

* **เครื่องมือ:** GitHub Copilot
* **Prompt 1:** "จากฟังก์ชันสถานะโพสต์ 24 ชั่วโมง ช่วยเสนอ test cases ที่ครอบคลุม equivalence partitions และ boundary values โดย assert behavior"
* **Prompt 2:** "ช่วยตรวจช่องว่างของ unit tests และเสนอ property ที่ valid สำหรับ FizzBuzz"
* **Prompt 3:** "ช่วย review test suite และ GitHub Actions workflow ว่ารัน test จริงและตรวจจับ boundary bug ได้หรือไม่"
* **ส่วนที่รับจาก AI โดยตรง:** แนวทางแบ่ง partitions, โครงร่าง test cases, และรูปแบบ workflow เบื้องต้น
* **ส่วนที่ทีมตรวจสอบและปรับเอง:** เลือก business rule ของโพสต์ 24 ชั่วโมง, ตรวจ expected behavior, กำหนด boundary timestamps, และตรวจผลการรันผ่าน CI

**Lab 10 DevOps and Continuous Delivery Disclosure**

* **เครื่องมือ:** Google Gemini,Claude
* **Prompt 1:** "นี่คือไฟล์ ci.yml และ cd.yml ที่ทีมเขียนขึ้นมา ช่วยรีวิวว่าการทำ Parallel jobs และการเรียกใช้ Cache ของ npm/pip ถูกต้องและเหมาะสมตาม Best Practice ของ GitHub Actions หรือยัง"
* **Prompt 2:** "จากโค้ด docker-compose.yml ของทีมที่เชื่อมต่อ Web App กับ PostgreSQL และ Redis ช่วยตรวจสอบว่าการตั้งค่า Healthcheck และการจัดการ Environment Variables ผ่านไฟล์ .env ปลอดภัยและถูกต้องหรือไม่"
* **Prompt 3:** "ทีมประเมินข้อมูล DORA Metrics (Lead Time และ Deployment Frequency) จากประวัติ Pull Requests ไว้ดังนี้... ช่วยเช็กว่าตรรกะการประเมินและการนิยามคำว่า Deployment ของทีมสมเหตุสมผลไหม"
* **Prompts 4:** (Claude)
มีการใช้คำสั่งเพื่อให้ AI ช่วยเหลือในกระบวนการทดสอบและปรับปรุงโค้ด 3 ด้านหลัก ดังนี้:

* **1. Generate Test Cases (สร้างเคสทดสอบ):**
  > *"Help me generate unit tests in JavaScript for a FizzBuzz function. The function should return 'Fizz' for multiples of 3, 'Buzz' for multiples of 5, and 'FizzBuzz' for multiples of both."*
* **2. Identify Gaps (หาช่องโหว่และกรณีทดสอบที่ตกหล่น):**
  > *"Review my current FizzBuzz test cases in `test_property.test.js`. Are there any edge cases, negative inputs, or property-based testing scenarios that I missed?"*
* **3. Review Quality (ตรวจสอบคุณภาพและ Refactor โค้ด):**
  > *"Can you review my `src/fizzbuzz.js` implementation for clean code principles? Suggest any refactoring to improve readability and make the logic less repetitive."*

### 3. ส่วนที่รับจาก AI ตรง ๆ โดยไม่แก้ไข (Directly Accepted AI Output)
ส่วนที่นำโค้ดและคำแนะนำจาก AI มาใช้งานโดยตรง (Unmodified) ได้แก่:
* **Helper Function (`isMultiple`):** โค้ดฟังก์ชันย่อย `const isMultiple = (num, divisor) => num % divisor === 0;` ที่ AI แยกออกมาเพื่อลดความซ้ำซ้อนของเงื่อนไข (DRY Principle)
* **Module Syntax:** การเปลี่ยนรูปแบบเป็น Named Export/Import เพื่อให้จัดการ Dependency ในไฟล์เทสต์ได้เป็นระเบียบขึ้น
* **โครงสร้าง Test Block:** โครงร่างพื้นฐานของเทสต์เคสบางส่วนที่ AI สร้างขึ้นมาให้ (Setup/Teardown)
* **ส่วนที่รับจาก AI โดยตรง:** คำแนะนำในการปรับจูนประสิทธิภาพของ Pipeline, การชี้เป้าจุดที่อาจเกิด Syntax Error ในไฟล์ YAML, และการยืนยันความถูกต้องของวิธีคิดตรรกะ DORA Metrics
* **ส่วนที่ทีมตรวจสอบและปรับเอง:**  กำหนดการเชื่อมต่อพอร์ตและฐานข้อมูลของ UP Board เอง, จัดการ Repository Secrets บน GitHub, รวมไปถึงการรวบรวมประวัติและวิเคราะห์ตัวเลขเพื่อคำนวณ DORA Metrics ด้วยตนเอง โดยใช้ AI เป็นเพียงผู้ช่วยรีวิวความเรียบร้อยก่อนนำไปใช้งานจริง

## Lab 11 Security Hardening and Privacy Disclosure

* **เครื่องมือ:** Google Gemini, GitHub Copilot
* **Prompt 1:** "นี่คือโค้ด Input Validation 3 ชั้น และฟังก์ชัน Parameterized Query ที่ทีมเขียนขึ้นสำหรับระบบรับแจ้งเหตุของ UP Board ช่วยตรวจทานให้หน่อยว่าครอบคลุมการป้องกัน SQL Injection และ XSS ครบถ้วนตามมาตรฐานความปลอดภัยหรือยังมีจุดไหนตกหล่นไหม"
* **Prompt 2:** "ทีมได้แยกเก็บ Secrets ในไฟล์ .env พร้อมทำ .env.example และเขียน GitHub Actions Workflow เพื่อรัน Gitleaks ไว้แล้ว ช่วยรีวิวความถูกต้องของไฟล์ YAML และตรวจเช็กว่าการคอนฟิก Secret Scanning มีข้อผิดพลาดตรงไหนหรือไม่"
* **Prompt 3:** "นี่คือคำตอบ Post-quiz และเนื้อหา Reflection เรื่อง Secure by Design, CIA Triad และ PDPA ที่ทีมสรุปและเรียบเรียงไว้ใน reflect.md ช่วยตรวจทานความถูกต้องของหลักการทางทฤษฎีและความชัดเจนของเนื้อหาให้หน่อย"
* **งานที่ให้ GitHub Copilot ช่วยทำ:** เพิ่ม API รับแจ้งเหตุใน FastAPI พร้อมตรวจข้อมูลและบันทึกลง PostgreSQL ด้วย Parameterized Query ตามข้อสังเกต Lab 11
* **ส่วนที่รับจาก AI โดยตรง:** ข้อเสนอแนะในการตรวจทานความเรียบร้อย (Review Feedback), การช่วยยืนยันความถูกต้องของ Syntax ในไฟล์ CI Workflow, และการช่วยตรวจเช็กความครอบคลุมของเนื้อหาในบันทึกสะท้อนคิด
* **ส่วนที่ทีมตรวจสอบและปรับเอง:** ทีมเป็นผู้กำหนดกฎการตรวจข้อมูลและจัดการย้าย Secrets ออกจากโค้ดพร้อมทำไฟล์ .env.example รวมถึงกำหนดการทำงานของ CI Workflow สำหรับ Gitleaks ส่วน API, Pydantic validation และ Parameterized Query ได้รับความช่วยเหลือในการเขียนและแก้ไขจาก GitHub Copilot โดยทีมควรตรวจทานโค้ดและทดสอบการเชื่อมต่อกับ PostgreSQL ก่อนใช้งานจริง
* **ขอบเขตการทดสอบ:** เทสต์ที่เพิ่มตรวจ validation และการ bind parameters โดยใช้ mock connection; ยังไม่ได้ทดสอบกับ PostgreSQL ที่กำลังทำงานจริง

## Lab 12B — Safety Net Sprint

* **เครื่องมือ:** Google Gemini
* **Prompt 1:** "ขอคำแนะนำลำดับขั้นตอนการทำ Git Workflow (pull/commit/push) ที่ปลอดภัย เพื่อป้องกัน Merge Conflict เมื่อต้องรวมโค้ด CI กับงานล่าสุดของเพื่อนร่วมทีม"
* **Prompt 2:** "ช่วยวิเคราะห์และแก้ไขปัญหา Merge Conflict ในไฟล์ package.json เนื่องจากมีไวยากรณ์ผิดพลาด (JSONParseError) และลบแพ็กเกจซ้ำซ้อนเพื่อให้รัน npm install ผ่าน"
* **Prompt 3:** "ขอตัวอย่างโครงสร้างมาตรฐานของ Pull Request Description (What, Why, Reviewer, Checklist) ตามแนวปฏิบัติที่ดีในการพัฒนาซอฟต์แวร์"
* **ส่วนที่ทีมตรวจสอบและปรับเอง:** 
  - ตรวจสอบความถูกต้องและทดสอบรันสคริปต์ CI บน GitHub Actions ให้รันผ่านทั้ง Job `lint` และ `test`
  - ตรวจสอบโครงสร้างไฟล์ `package.json` เลือกเวอร์ชันของ dependencies ให้ตรงกับที่โปรเจกต์ของทีมใช้งานจริง
  - กรอกรายละเอียด PR, Pragmatic Promise และระบุ Tag Reviewer เพื่อนร่วมทีมด้วยตนเองก่อนทำการ Merge

## UP Board Full-Stack Implementation (feat/up-board-full-stack)

* เครื่องมือ: Claude Code (Claude) — ใช้งานผ่านแอป Claude Desktop บนเครื่องของทีม โดย AI อ่านและแก้ไฟล์ให้ตรงตามความต้องการของทีม
* Prompt 1: "Act as Senior Software Architect … วิเคราะห์ README, User Stories, docs/ และ ADR ทั้งหมด ทำ Architecture Review และ Conflict Report (Requirement / Current Implementation / Conflict / Recommended Solution) โดยยังไม่แก้ไฟล์ใด ๆ ไม่ commit ไม่ push" พร้อมกำหนด Business Rules (Dashboard ranking, หมดอายุ 24 ชม., ปักหมุดสูงสุด 72 ชม., RBAC 3 บทบาท, Report flow)
* Prompt 2  "C10: งานแจ้งซ่อมควรเห็นเป็นสาธารณะ เพราะนิสิตหรือบุคลากรจะได้รู้ว่าจุดที่แจ้งมีปัญหาและหลีกเลี่ยงได้" และ "ตามที่แนะนำทั้งหมด และปรับ ADR ให้สอดคล้องกับงาน"
* ส่วนที่รับจาก AI โดยตรง:
  - รายงานวิเคราะห์สถาปัตยกรรมและ Conflict Report 19 ข้อ (เช่น `tech_stack.md` ขัดกับ ADR-001, C4 แสดง SSO ทั้งที่ยังไม่มีสิทธิ์ใช้)
  - เอกสาร ADR-002, `docs/architecture/api-contract.md`, test plan/report และการปรับ ADR-001, C4, NFR, tech_stack และ README
  - โค้ด Backend (FastAPI, SQLAlchemy, Alembic migration, seeder), Frontend (Next.js + TypeScript), docker compose, Dockerfile, CI/CD workflow และ `render.yaml`
  - ชุดทดสอบ: pytest (backend), Vitest (frontend), Playwright E2E ทั้งแบบ mock และแบบระบบจริง และสคริปต์ load test
  - การหาสาเหตุและแก้บั๊ก 18 ข้อที่พบระหว่างทดสอบ (รายละเอียดใน `docs/testing/readme.md`)
* **ส่วนที่ทีมทำเอง / ตัดสินใจเอง:**
  - กำหนดขอบเขตงานและ Business Rules ทั้งหมดตั้งแต่ต้น
  - เป็นผู้ตัดสินใจในทุกข้อขัดแย้ง (เช่น เปิดงานซ่อมเป็นสาธารณะ, อนุมัติเทคโนโลยีที่ไม่อยู่ใน ADR-001, กำหนดสิ่งที่อยู่นอกขอบเขต) โดย AI เป็นผู้เสนอทางเลือกเท่านั้น