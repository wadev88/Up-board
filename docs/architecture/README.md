# 📐 สถาปัตยกรรมระบบ UP Board (Architecture Overview)

เอกสารในไดเรกทอรีนี้อธิบายสถาปัตยกรรม การตัดสินใจเชิงเทคนิค และโครงสร้างข้อมูลของระบบ **UP Board** — แหล่งอ้างอิงหลักคือ ADR และ API Contract หากเอกสารอื่นขัดแย้ง ให้ยึดตามสองแหล่งนี้

## 🗂️ เอกสารในไดเรกทอรีนี้

| เอกสาร | รายละเอียด |
| :--- | :--- |
| [C4 Level 1: System Context](./c4-context.md) | ผู้ใช้ 3 บทบาท ระบบ UP Board และระบบภายนอก (SMTP; University SSO เป็นแผนในอนาคต) |
| [C4 Level 2: Container](./c4-container.md) | Frontend (Vercel), Backend API (Render), Background Worker, PostgreSQL, File Storage, SMTP และ SSE |
| [Tech Stack](./tech_stack.md) | ตารางเทคโนโลยีแต่ละ Layer พร้อมเหตุผล ตัวเลือกสำรอง และ ADR ที่อ้างอิง |
| [ADR Index](./adr/README.md) | รายการบันทึกการตัดสินใจเชิงสถาปัตยกรรม ([ADR-001](./adr/001-use-restful-api-internal-commu.md), [ADR-002](./adr/002-business-rules-rbac-and-frontend-libraries.md)) |
| [API Contract](./api-contract.md) | สัญญา REST API v1 ระหว่าง Frontend และ Backend รวมถึง RBAC Matrix |
| [UML Models](./uml_models.md) | แผนภาพ UML เพิ่มเติม |

## 🧩 โมดูลของระบบ (Modules)

| โมดูล | หน้าที่โดยสรุป |
| :--- | :--- |
| **Authentication** | สมัครด้วยอีเมล `@up.ac.th` ยืนยันอีเมลด้วยการเข้าสู่ระบบ Google ครั้งแรก (ไม่ส่งอีเมล) เข้าสู่ระบบด้วย JWT (Access Token 15 นาที + Refresh Cookie) และ Hash รหัสผ่านด้วย Argon2 |
| **Dashboard** | แสดงโพสต์เป็นชั้น Pinned → Important → Upcoming → Recent ซ่อนโพสต์ทั่วไปที่เกิน 24 ชม. ณ เวลา Query |
| **Announcements / Events** | โพสต์ประกาศพร้อมเวลากิจกรรม กิจกรรมที่เริ่มภายใน 7 วันแสดงบน Dashboard เสมอ |
| **Repair Requests** | แจ้งซ่อมพร้อมรูป/ตำแหน่ง มอบหมายช่าง และติดตามสถานะ `pending → accepted → in_progress → completed` เปิดเป็นสาธารณะแต่กรองฟิลด์ส่วนตัว |
| **Lost & Found** | ประกาศของหาย/พบของ สถานะ `lost` / `found` / `returned` |
| **Reports & Moderation** | Profanity Filter (ไทย/อังกฤษ ด้วย PyThaiNLP) และการรายงานเนื้อหา `reported → under_review → upheld → content_removed` / `dismissed` (Soft Delete เท่านั้น) |
| **Notifications** | แจ้งเตือนในแอปและส่งแบบเรียลไทม์ผ่าน SSE (Stream Ticket 60 วินาที) |
| **Admin** | สถิติพื้นฐาน จัดการรายงาน และจัดการผู้ใช้ |
| **Role Management** | 3 บทบาท `student` / `staff` / `admin` โปรไฟล์ช่าง (`technicians`) ของ staff และ Bootstrap Admin จาก Environment Variables |

## 🗄️ แผนภาพฐานข้อมูล (Database ER Diagram)

ตาราง `posts` เป็น Supertype ของโพสต์ทุกประเภท โดยมีตารางย่อยแบบ 1:1 (`events`, `repair_requests`, `lost_found_items`) ที่ใช้ `post_id` เป็น Primary Key และ Foreign Key

```mermaid
erDiagram
    roles ||--o{ role_permissions : grants
    permissions ||--o{ role_permissions : "granted by"
    roles ||--o{ users : "assigned to"
    faculties ||--o{ users : "belongs to"
    users |o--o| technicians : "has profile"

    users ||--o{ posts : authors
    post_categories ||--o{ posts : categorizes
    faculties |o--o{ posts : "scoped to"
    posts ||--o| events : "is (announcement)"
    posts ||--o| repair_requests : "is (repair)"
    posts ||--o| lost_found_items : "is (lost_found)"
    posts ||--o{ attachments : has
    users ||--o{ attachments : uploads

    technicians |o--o{ repair_requests : "assigned to"
    repair_requests ||--o{ repair_status_history : tracks
    users ||--o{ repair_status_history : "changed by"

    posts ||--o{ reports : "reported in"
    users ||--o{ reports : files
    reports ||--o{ report_actions : "handled by"
    users ||--o{ report_actions : performs

    users ||--o{ notifications : receives
    users |o--o{ audit_logs : "acts in"

    roles {
        int id PK
        string name "student | staff | admin"
    }
    permissions {
        int id PK
        string code "e.g. post:pin"
    }
    role_permissions {
        int role_id PK, FK
        int permission_id PK, FK
    }
    faculties {
        int id PK
        string code
        string name_th
        string name_en
    }
    users {
        int id PK
        string email "unique, @up.ac.th"
        string password_hash "Argon2"
        string display_name
        int role_id FK
        int faculty_id FK "required for staff"
        bool is_verified
        bool is_active
        datetime created_at
    }
    technicians {
        int id PK
        int user_id FK "unique, staff only"
        string specialty
        string zone
        bool is_available
    }
    post_categories {
        int id PK
        string slug
        string name_th
        string allowed_type
    }
    posts {
        int id PK
        string type "general | announcement | repair | lost_found"
        string title
        text content
        string priority "low | normal | high | urgent"
        string status "active | removed"
        int author_id FK
        int category_id FK
        int faculty_id FK
        datetime created_at
        datetime updated_at
        datetime pinned_at
        datetime pinned_until "CHECK <= pinned_at + 72h"
    }
    events {
        int post_id PK, FK
        datetime starts_at
        datetime ends_at
        string venue
    }
    repair_requests {
        int post_id PK, FK
        string location
        decimal latitude "private"
        decimal longitude "private"
        string status "pending | accepted | in_progress | completed"
        int technician_id FK "private"
        datetime updated_at
    }
    repair_status_history {
        int id PK
        int repair_post_id FK
        string from_status
        string to_status
        int changed_by FK
        text note "private"
        datetime changed_at
    }
    lost_found_items {
        int post_id PK, FK
        string location
        string status "lost | found | returned"
        datetime occurred_at
        datetime updated_at
    }
    attachments {
        int id PK
        int post_id FK "null = orphan"
        int uploader_id FK
        string storage_key "UUID"
        string mime_type
        int size_bytes
        string kind "image | repair_after"
        datetime created_at
    }
    reports {
        int id PK
        int post_id FK
        int reporter_id FK
        string reason
        text detail
        string status "reported | under_review | upheld | content_removed | dismissed"
        datetime created_at
    }
    report_actions {
        int id PK
        int report_id FK
        int admin_id FK
        string from_status
        string to_status
        text note
        datetime created_at
    }
    notifications {
        int id PK
        int user_id FK
        string type
        string title
        text body
        string link
        datetime read_at
        datetime created_at
    }
    audit_logs {
        int id PK
        int actor_id FK
        string action
        string entity_type
        int entity_id
        json metadata
        datetime created_at
    }
```

> คอลัมน์ในแผนภาพเป็นภาพรวมระดับแนวคิด (Conceptual) อ้างอิงจาก [API Contract](./api-contract.md) — โครงสร้างจริงให้ยึดตาม Alembic Migration ในโค้ด
