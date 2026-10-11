# ใช้ self-hosted runner รัน CI (ไม่ใช้นาทีของ GitHub-hosted)

`ci.yml` และ `security.yml` เลือกเครื่องรันจากตัวแปร repo `CI_RUNNER`:

- **ไม่ตั้งตัวแปร** → ใช้ `ubuntu-latest` ของ GitHub เหมือนเดิม
- **ตั้ง `CI_RUNNER`** เป็น JSON ของ label เช่น `["self-hosted","linux"]` → ทุกงานไปรันบนเครื่องของเรา
  (ไม่ถูกนับนาที / ไม่ติดข้อความ "recent account payments have failed")

## 1) เตรียมเครื่อง (Linux / WSL2 Ubuntu)
เครื่องต้องมี: `git`, `curl`, `openssl`, **Docker** (สั่ง `docker ps` ได้โดยไม่ต้อง sudo)
และ sudo สำหรับ `npx playwright install --with-deps chromium`
(Node และ Python ไม่ต้องติดตั้งเอง — `setup-node` / `setup-python` ใน workflow จัดการให้)

> งาน `backend` ใช้ service container ของ Postgres และงาน `e2e`/`build`/`gitleaks` ใช้ Docker
> จึงใช้ runner แบบ Windows ล้วนไม่ได้ ต้องเป็น Linux (หรือ WSL2 ที่เปิด Docker integration)

## 2) ลงทะเบียน runner
GitHub → repo → **Settings → Actions → Runners → New self-hosted runner → Linux**
ทำตามคำสั่งที่หน้านั้นให้ (ดาวน์โหลด, `./config.sh --url … --token …`) แล้วรัน `./run.sh`
(หรือติดตั้งเป็น service: `sudo ./svc.sh install && sudo ./svc.sh start`)
ต้องมีสิทธิ์ admin ของ repo/org จึงจะเห็นโทเค็น

## 3) สั่งให้ workflow ใช้ runner นี้
**Settings → Secrets and variables → Actions → Variables → New repository variable**

| Name | Value |
|---|---|
| `CI_RUNNER` | `["self-hosted","linux"]` |

ย้อนกลับไปใช้ GitHub-hosted: ลบตัวแปรนี้ แล้ว Re-run jobs

## 4) ข้อควรระวัง
- **ความปลอดภัย:** self-hosted runner รันโค้ดของ PR บนเครื่องเรา ใช้กับ repo private/ทีมที่ไว้ใจเท่านั้น
  และตั้ง **Settings → Actions → General → Fork pull request workflows** ให้ต้องอนุมัติก่อนรัน
- **พอร์ตชน:** งาน `e2e` เปิด `docker compose -p upboard-ci` (พอร์ต 8000/3000 ฯลฯ) และงาน `backend`
  เปิด Postgres ที่พอร์ต 5432 — ถ้าเครื่องเดียวกันรัน stack อื่นอยู่ ให้ปิดก่อน
- **รันทีละงาน:** runner ตัวเดียวทำได้ทีละ job ทั้งชุดจึงช้ากว่า GitHub-hosted
  (เพิ่ม runner หลายตัวได้ถ้าต้องการขนาน)
- **เครื่องต้องเปิดอยู่** ระหว่างที่มี PR ถ้าปิด งานจะค้างสถานะ "Queued"
- ไฟล์ `cd.yml` ไม่ได้ถูกแก้ (ยังใช้ `ubuntu-latest`) เพราะเป็นขั้นตอน deploy
