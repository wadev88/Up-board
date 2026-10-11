# Refactoring Journal: Lab 7

## Smell ที่เจอ

**Long Method** พบใน `prototypes/sprint1/Aphisit_auto_remove_24h_post_prototype.js` ที่ `renderAdminTable()` เดิม เพราะ method เดียวทำหลายหน้าที่ ได้แก่ กรองโพสต์ สร้าง table row และผูก event ให้ปุ่ม View ทำให้โค้ดอ่านยากและทดสอบแต่ละส่วนได้ยาก

นอกจากนี้ยังพบ code smell ที่ควรพิจารณาในงานถัดไป:

- `renderFeed()` และ `renderDetail()` ยังทำงานด้านข้อมูลและ DOM หลายอย่างใน method เดียว
- มีการใช้ค่าคงที่แบบเขียนตรง ๆ เช่นอายุโพสต์ 24 ชั่วโมง ช่วง expiring 3 ชั่วโมง และ timeout ของ toast
- state หลัก (`posts`, `activeFilter`, `selectedPostId`) เป็น global mutable state
- การสร้าง HTML ด้วย `innerHTML` ต้องระวังเมื่อข้อมูลมาจากผู้ใช้จริง

## AI Usage

เครื่องมือที่ใช้ใน Lab นี้คือ GitHub Copilot Chat

Prompts ที่ใช้:

1. "โค้ดนี้มี code smell อะไรบ้าง? อธิบายว่าทำไมถึงเป็น smell และส่งผลเสียอย่างไร โดยยังไม่ต้องแก้โค้ด"
2. "เสนอวิธี refactor renderAdminTable() โดยใช้ Extract Method และอธิบายว่าควรแยกส่วนไหนออกมา เพราะอะไร"
3. "ช่วยตรวจว่า refactor นี้ยังคง behavior เดิมของระบบ auto-remove โพสต์ 24 ชั่วโมงหรือไม่ และเสนอ test case ที่ควรมี"

AI ช่วยระบุ smell, เสนอจุดที่ควรแยก method และเสนอกรณีทดสอบ ส่วนทีมเป็นผู้เลือกขอบเขต อ่านทำความเข้าใจ และแก้ implementation หลักเอง โดยเก็บ `renderAdminTable()` เดิมไว้เป็นคอมเมนต์ตามที่ทีมต้องการ

## Before / After

| ประเด็น | Before | After |
| --- | --- | --- |
| ความรับผิดชอบของ `renderAdminTable()` | กรองข้อมูล สร้าง row และผูก event ใน method เดียว | ทำหน้าที่ประสานการ render เท่านั้น |
| โครงสร้าง | Long Method ประมาณ 40 บรรทัด | แยกเป็น `getFilteredPosts()`, `createAdminRow()` และ `bindAdminTableActions()` |
| Coupling | Logic การกรอง, DOM และ event ผูกอยู่ด้วยกัน | แยกความรับผิดชอบให้อ่านและแก้ไขง่ายขึ้น |
| Testability | ทดสอบส่วนย่อยได้ยาก | กฎ behavior อายุโพสต์มี regression test แยกไว้ |

Regression tests อยู่ที่ `src/tests/auto_remove_behavior.test.js` ครอบคลุม active, expiring, expired และ hidden post

## Test และ Smoke Check

ก่อน refactor ได้เพิ่ม test cases เพื่อบันทึก behavior ของระบบ auto-remove โพสต์ 24 ชั่วโมง หลัง refactor ตรวจ JavaScript diagnostics และ `git diff --check` แล้วไม่พบ error

ไม่สามารถ execute Node test ได้ใน environment นี้เพราะไม่มีคำสั่ง `node` ใน PATH และ browser smoke test ไม่ได้ถูกรัน จึงควรรันคำสั่งต่อไปนี้ใน environment ที่ติดตั้ง Node ก่อนส่งงาน:

```text
node --test src/tests/auto_remove_behavior.test.js
```

ควรทำ manual smoke test เพิ่มโดยเปิด prototype, ตรวจ feed, เปลี่ยน tab ใน admin, เปิดรายละเอียดโพสต์ และกด run cleanup

## Lesson

การ refactor ควรเริ่มจากการล็อก behavior ด้วย test แล้วค่อยเปลี่ยนโครงสร้าง วิธี Extract Method ช่วยให้ method หลักอ่านเป็นลำดับขั้นและทำให้แต่ละหน้าที่มีขอบเขตชัดขึ้น แต่การเก็บโค้ดเก่าไว้เป็นคอมเมนต์ควรใช้เป็นหลักฐานชั่วคราวของ Lab เท่านั้น ไม่ควรเก็บไว้ใน production code ระยะยาว

Workflow ที่ใช้คือ Explain -> Propose -> Apply -> Test โดยทีมตรวจสอบข้อเสนอและเป็นผู้ตัดสินใจ implementation ก่อนนำไปใช้
