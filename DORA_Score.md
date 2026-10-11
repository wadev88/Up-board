# Lab 10 — DevOps และ Continuous Delivery (UP Board)

เอกสารนี้อธิบาย CI/CD pipeline ของแพลตฟอร์ม UP Board (ระบบแจ้งเหตุและชุมชนของมหาวิทยาลัย) และ DORA Metrics ของทีม ตัวเลขทั้งหมดคำนวณจากประวัติ merge เข้า `main` ใน Git (PR #64–#81)
ณ วันที่ 2026-10-03

## 1. Stack ที่ pipeline รองรับ (ตามไฟล์จริงใน repo)

| ส่วน | เทคโนโลยี | คำสั่ง / ไฟล์ |
| --- | --- | --- |
| Business logic + tests | JavaScript (Node.js 20), `node:test` + `fast-check` | `npm test` (`src/tests/*.test.js`) |
| Coverage | coverage ที่มากับ Node.js | `node --test --experimental-test-coverage src/tests/*.test.js` |
| Lint | ESLint (`eslint.config.mjs`) | `npx eslint .` |
| Backend service | Python FastAPI (`services/stats-service/app.py`) | `uvicorn app:api` พอร์ต 8000 |
| Database / Cache | PostgreSQL 15 + Redis 7 | `compose.yaml` |
| Infrastructure | Docker (`Dockerfile` ที่ root), Docker Compose | `docker compose up -d --build` |
| Secret scanning | Gitleaks (Lab 11) | `.github/workflows/security.yml` |

## 2. Pipeline

```text
Pull Request -> main  /  push -> main
        │
        ▼
 CI (.github/workflows/ci.yml, name: CI) — 3 jobs รันขนานกัน
 ├─ lint   npm ci → npx eslint .
 ├─ test   npm ci → test + coverage (ต้องไม่น้อยกว่า 60%)
 └─ build  docker build
        │  (CI สำเร็จ + เป็น push เข้า main เท่านั้น)
        ▼
 CD (.github/workflows/cd.yml, trigger: workflow_run ของ "CI")
 └─ push-image   checkout commit ที่ CI ผ่าน → docker build → push ไป Docker Hub
                 tag = <DOCKERHUB_USERNAME>/up-board-web:<commit SHA>

 Security Scan (.github/workflows/security.yml) — รันแยก
 └─ gitleaks     สแกน secret ทั้ง git history
```

* **Cache:** npm ผ่าน `actions/setup-node` (`cache: npm`)
* **Branch Protection:** `main` ต้องผ่าน check `lint` และ `test` ก่อน merge (ทดสอบแล้วใน Lab 12B ด้วย commit "temp break")

### ข้อจำกัดที่ต้องรู้

* ยังไม่มี runtime host — เป็น Continuous **Delivery** (push image ไปรอที่ Docker Hub) ยังไม่ใช่ Continuous **Deployment**
* `Dockerfile` เป็นแบบ single-stage สำหรับ `services/stats-service` (Python) — image ที่ push จึงเป็น backend service ไม่ใช่หน้าเว็บ
* ช่วง 2026-09-29 ถึง 2026-10-03 CD ไม่ถูกเรียกเลย เพราะ PR #79 เปลี่ยนชื่อ workflow จาก `Tests` เป็น `CI` แต่ `cd.yml` ยังรอ `"Tests"` (แก้แล้วใน PR เดียวกับที่อัปเดตเอกสารนี้ — ดู Change Failure Rate)

## 3. Docker / IaC

* `Dockerfile` (root): `python:3.12-slim` → ติดตั้ง `services/stats-service/requirements.txt` → รัน `uvicorn` พอร์ต 8000 ด้วย `USER nobody` (non-root)
* `compose.yaml`: 3 services
  * `web` — build จาก `Dockerfile` map พอร์ต `8000:8000` รอ `db` ผ่าน healthcheck
  * `db` — `postgres:15-alpine` + volume `up-board-db-data` + healthcheck `pg_isready`
  * `cache` — `redis:7-alpine`
* Environment: ค่า `POSTGRES_USER` / `POSTGRES_DB` อ่านจากไฟล์ `.env` (อยู่ใน `.gitignore`) โดยมี `.env.example` เป็นแม่แบบ; `POSTGRES_PASSWORD` ถูก mount เป็น Compose secret ให้บริการที่ต้องใช้

## 4. สิ่งที่ต้องตั้งค่าบน GitHub

| ชื่อ | ประเภท | ใช้ทำอะไร |
| --- | --- | --- |
| `DOCKERHUB_USERNAME` | Repository secret | account Docker Hub ที่ push image |
| `DOCKERHUB_TOKEN` | Repository secret | Docker Hub access token สิทธิ์ Read & Write |

ถ้ายังไม่ตั้ง secrets ขั้น `Login to Docker Hub` ใน CD จะ fail (CI ไม่ได้รับผลกระทบ)

## 5. DORA Metrics

### นิยามที่ใช้

* **Deployment** = PR ที่ merge เข้า `main` (ผ่าน CI แล้ว) — ใช้แทนการ push image เพราะ CD ยังไม่มีประวัติการรันที่ตรวจสอบได้จาก repo
* **ช่วงเวลาที่วัด:** 2026-08-25 ถึง 2026-10-03 (≈ 5.5 สัปดาห์, PR #64–#81 รวม 18 PR)
* **Failure** = merge ที่ทำให้ต้องมี PR แก้ตามมา

### ผลการวัด

| Metric | ผล | ระดับ | ที่มา |
| --- | --- | --- | --- |
| **Deployment Frequency** | 18 ครั้ง / 5.5 สัปดาห์ ≈ **3.3 ครั้ง/สัปดาห์** | Medium–High | กระจุกตัวตามกำหนดส่ง Lab เช่น 26 ส.ค. merge 8 PR (#66–#73) ในวันเดียว แต่บางสัปดาห์ไม่มีเลย (3–16 ก.ย.) |
| **Lead Time for Changes** | **< 1 วัน** (ทุก PR ไม่เกิน ~4 ชม. จาก commit แรกถึง merge) | Elite | PR ส่วนใหญ่มี 1–2 commit และถูก merge ในวันเดียวกับที่ commit |
| **Change Failure Rate** | 3 / 18 ≈ **17%** | Medium | (1) PR #75 CI Lab 9 ยังไม่สมบูรณ์ → แก้ใน PR #76 · (2) PR #78 gitleaks action ใช้ไม่ได้เพราะ license → แก้ใน PR #80 · (3) PR #79 เปลี่ยนชื่อ workflow ทำให้ CD ไม่ถูกเรียก → แก้ใน PR นี้ |
| **MTTR** | #75→#76 ≈ 5 วัน · #78→#80 ≈ 1.5 ชม. · #79 → PR นี้ ≈ 4 วัน+ | Medium–Low | เฉลี่ยหลายวัน เพราะปัญหาของ CI/CD ถูกพบช้า (ไม่มีใครดูหน้า Actions ของ CD) |

**สรุป:** Lead Time ดีมากเพราะ PR เล็กและ merge เร็ว แต่ MTTR ยังสูง — สาเหตุหลักคือไม่มีการแจ้งเตือนเมื่อ workflow fail หรือไม่ถูกเรียก เป้าหมายถัดไปคือดูสถานะ CD หลัง merge ทุกครั้ง และเพิ่ม notification เมื่อ pipeline fail

### วิธีเก็บข้อมูลหลังจากนี้

* **Deployment Frequency** = จำนวนครั้งที่ CD (`push-image`) สำเร็จต่อสัปดาห์ (ดูจากแท็บ Actions → CD Pipeline)
* **Lead Time for Changes** = เวลาที่ CD สำเร็จ ลบด้วยเวลา commit (`git log -1 --format=%cI <sha>`)
* **Change Failure Rate** = จำนวน merge ที่ต้องมี PR `fix:` ตามมา ÷ จำนวน merge ทั้งหมด
* **MTTR** = เวลา merge PR ที่แก้ไข ลบด้วยเวลา merge PR ที่ทำให้เกิดปัญหา
