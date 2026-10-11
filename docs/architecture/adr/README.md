# 📚 บันทึกการตัดสินใจเชิงสถาปัตยกรรม (Architecture Decision Records — ADR Index)

รายการ ADR ทั้งหมดของโครงงาน **UP Board** เรียงตามหมายเลข ADR ที่ใหม่กว่าอาจแก้ไขเพิ่มเติม (Amend) หรือแทนที่ (Supersede) ADR ก่อนหน้า — หากข้อความขัดกัน ให้ยึด ADR ที่ใหม่กว่า

| หมายเลข | หัวข้อ | สถานะ | วันที่ | ลิงก์ |
| :---: | :--- | :--- | :---: | :--- |
| **ADR-001** | การเลือกเทคโนโลยีหลักของระบบ (Core Tech Stack) | ✅ ยอมรับแล้ว (Accepted) — แก้ไขเพิ่มเติมบางส่วนโดย ADR-002 | 2026-07-20 | [001-use-restful-api-internal-commu.md](./001-use-restful-api-internal-commu.md) |
| **ADR-002** | กฎทางธุรกิจ บทบาทผู้ใช้ (RBAC) และไลบรารีเสริมของระบบ | ✅ ยอมรับแล้ว (Accepted) — Amends ADR-001 | 2026-10-05 | [002-business-rules-rbac-and-frontend-libraries.md](./002-business-rules-rbac-and-frontend-libraries.md) |
| **ADR-003** | บทบาท 6 แบบ ขั้นตอนงานซ่อม กฎ Spam (3/5) การปักหมุด สาขาวิชา/ช่องทางติดต่อ และการจัดการรายงาน | ✅ ยอมรับแล้ว (Accepted) — Amends ADR-002 | 2026-10-11 | [003-roles-repair-flow-spam-programs.md](./003-roles-repair-flow-spam-programs.md) |

> 📝 ชื่อไฟล์ของ ADR-001 (`use-restful-api-internal-commu`) เป็นชื่อเดิมที่คงไว้เพื่อไม่ให้ลิงก์เสีย เนื้อหาจริงคือการเลือก Tech Stack หลัก

## 📝 แนวทางการเพิ่ม ADR ใหม่

1. ตั้งชื่อไฟล์ `NNN-short-kebab-title.md` โดยใช้หมายเลขถัดไป
2. ใช้โครงสร้างหัวข้อเดียวกับ ADR-001: บริบทและเหตุผล (Context & Rationale) → การตัดสินใจ (Decision) → เหตุผล (Rationale) → ผลที่ตามมา (Consequences +/−) → ประเด็นด้านความปลอดภัย (Security Considerations) → เงื่อนไขในการทบทวน (Review Triggers)
3. ระบุสถานะ (Proposed / Accepted / Superseded) และความสัมพันธ์กับ ADR เดิม
4. เพิ่มแถวในตารางด้านบน และอัปเดต [tech_stack.md](../tech_stack.md) หากมีการเปลี่ยนเทคโนโลยี

## 🔗 เอกสารที่เกี่ยวข้อง

- [ภาพรวมสถาปัตยกรรม (Architecture Overview)](../README.md)
- [เทคโนโลยีที่เลือกใช้ (Tech Stack)](../tech_stack.md)
- [สัญญา API (API Contract)](../api-contract.md)
