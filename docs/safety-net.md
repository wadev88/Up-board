# Safety Net ของทีม se-sec1-team-05

## 1. ฟังก์ชันที่เลือกทดสอบ (snapshot ตอนทำ Lab 12)
- **ฟังก์ชัน:** `validateIncident` และ `getPostStatus` — ณ ตอนเก็บผล Lab 12 อยู่ไฟล์ `src/validators/incidentValidator.js` และ `src/auto_remove.js`; ปัจจุบัน validation ของเหตุแจ้งซ่อมอยู่ใน `services/stats-service/app.py` ที่ API `POST /incidents`
- **เหตุผลที่เลือก:** เป็น business logic หลักในการคัดกรองข้อมูลปัญหาของแพลตฟอร์ม UP Board และคอยเช็กสถานะการหมดอายุของโพสต์ ซึ่งมีผลต่อการแสดงผลโพสต์ในคอมมูนิตี้โดยตรง และสามารถทดสอบแยกส่วนได้

## 2. เทสต์ที่เขียน (≥ 5 ตัว)
| # | ชื่อเทสต์ | ประเภท | ยืนยันอะไร |
|---|---|---|---|
| 1 | a post is expired after 24 hours | happy | โพสต์ที่มีอายุเกิน 24 ชั่วโมง → สถานะ expired |
| 2 | a post becomes expiring during its final three hours | happy | โพสต์ที่อยู่ในช่วง 3 ชั่วโมงสุดท้าย → สถานะ expiring |
| 3 | a post is expired exactly at the 24-hour boundary | edge | เวลาครบ 24 ชั่วโมงพอดีเป๊ะ → สถานะ expired |
| 4 | a hidden post stays hidden even when it is not expired | edge | โพสต์ที่ถูกซ่อน (hidden) จะไม่ถูกเปลี่ยนสถานะเวลาเดินผ่านไป |
| 5 | throws an error when a post has no createdAt | error | ส่งข้อมูลโพสต์ที่ไม่มี createdAt → โยน Error สกัดกั้นไว้ |
| 6 | a post created in the future is still treated as active | edge | จัดการกรณีเวลาเครื่องผิด (วันที่ล้ำไปในอนาคต) → สถานะ active |

## 3. Coverage 
```text
-------------------------------------|---------|----------|---------|-------------------
File                                 | % Line  | % Branch | % Funcs | Uncovered Line #s
-------------------------------------|---------|----------|---------|-------------------
All files                            |   85.71 |    81.25 |  100.00 |
 src/auto_remove.js                  |  100.00 |   100.00 |  100.00 |
 src/fizzbuzz.js                     |  100.00 |   100.00 |  100.00 |
 src/validators/incidentValidator.js |   77.27 |    50.00 |  100.00 | 7-...
-------------------------------------|---------|----------|---------|-------------------
``` 
**ตีความ (ผลย้อนหลังจาก Lab 12):** การทดสอบทั้งหมด 24 เคสผ่านใน snapshot นั้น โดย `auto_remove.js` ครอบคลุมครบทุกเส้นทางเงื่อนไข (100%) ตัวเลขในตารางไม่ใช่ coverage ปัจจุบันของ repository
**ส่วนที่ยังไม่ครอบคลุมใน snapshot:** `incidentValidator.js` มี Branch Coverage 50% ในตอนนั้น; implementation JavaScript ดังกล่าวถูกแทนที่ด้วย Pydantic validation ใน API `POST /incidents` และมี unit tests แยกใน `services/stats-service/test_app.py`

## 4. CI block อะไรบ้าง
- **lint (eslint):** รูปแบบโค้ด — เจอ import ไม่ได้ใช้ หรือพิมพ์ syntax ผิด = แดง
- **test (npm test / node:test):** เทสต์ทั้งหมด + วัดค่า coverage
- **Branch Protection:** `main` ต้องผ่านทั้ง 2 checks ก่อน merge
- **หลักฐาน:** ภาพหน้า PR ตอนขึ้น "Merging is blocked" (แนบในคอมเมนต์ PR)

## 5. บทเรียนที่ได้
- ได้เรียนรู้ความสำคัญของการทำ Boundary Testing ของวันที่และเวลา (เช่น ทดสอบเวลาที่ 24 ชั่วโมงพอดีเป๊ะ) ซึ่งเป็นจุดที่มักจะทำให้เกิด Off-by-one error จากการใส่เครื่องหมายเปรียบเทียบผิด
- การตั้งค่าหุ่นยนต์ CI ช่วยให้รู้ตัวทันทีหากมีการแก้ไขโค้ดใหม่แล้วเผลอทำให้ logic เช็กสถานะโพสต์พัง ทำให้ทีมพัฒนา One-Tap reporting ได้อย่างมั่นใจ