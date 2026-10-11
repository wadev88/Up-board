import type {
  EventPriority,
  HistoryState,
  LostFoundStatus,
  PostType,
  Priority,
  RepairStatus,
  ReportReason,
  ReportStatus,
  Role,
} from "@/types/api";

export const APP_NAME = "UP Board";
export const ANONYMOUS_AUTHOR = "ผู้ใช้ UP Board";

export const UP_EMAIL_DOMAIN = "@up.ac.th";
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES = 4;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Pin durations offered for events / announcements (hours); the server caps it at the event start. */
export const PIN_HOUR_OPTIONS = [6, 12, 24, 48, 72] as const;
export const DEFAULT_PIN_HOURS = 48;
export const PINNED_DISPLAY_LIMIT = 5;
/** Lost & found posts stay visible this many days after creation (server: lost_found_archive_days). */
export const LOST_FOUND_VISIBLE_DAYS = 7;
/** Minimum gap between two repair reports of the same user (server: repair_cooldown_seconds). */
export const REPAIR_COOLDOWN_SECONDS = 120;
export const DEFAULT_PAGE_SIZE = 20;
/** backend limit for the `q` search param */
export const SEARCH_MAX_LENGTH = 100;

export const ROLE_LABELS: Record<Role, string> = {
  student: "นิสิต",
  teacher: "อาจารย์",
  technician: "ช่างซ่อมบำรุง",
  building_staff: "เจ้าหน้าที่กองอาคารสถานที่",
  student_club: "ชมรม / สโมสรนิสิต",
  admin: "ผู้ดูแลระบบ",
};

export const ROLE_ORDER: Role[] = [
  "student",
  "teacher",
  "student_club",
  "building_staff",
  "technician",
  "admin",
];

/** Roles that must belong to a faculty (enforced by the API). */
export const FACULTY_REQUIRED_ROLES: Role[] = ["teacher"];

export const POST_TYPE_LABELS: Record<PostType, string> = {
  general: "โพสต์ทั่วไป",
  announcement: "ประกาศ",
  event: "กิจกรรม",
  repair: "แจ้งซ่อม",
  lost_found: "ของหาย/พบของ",
};

/** Card header colour per post type (light / dark), used with the type icon. */
export const POST_TYPE_STYLES: Record<PostType, string> = {
  general: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  announcement: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  event: "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/50 dark:text-fuchsia-300",
  repair: "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
  lost_found: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
};

export const EVENT_PRIORITY_LABELS: Record<EventPriority, string> = {
  university: "ระดับมหาวิทยาลัย",
  faculty: "ระดับคณะ",
  department: "ระดับสาขา / ชมรม",
};

/** Highest → lowest, as the server sorts them. */
export const EVENT_PRIORITY_ORDER: EventPriority[] = ["university", "faculty", "department"];

export const HISTORY_STATE_LABELS: Record<HistoryState, string> = {
  active: "แสดงอยู่",
  expired: "หมดเวลาแสดง",
  resolved: "เสร็จสิ้น / คืนแล้ว",
  archived: "เก็บถาวร",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "ต่ำ",
  normal: "ปกติ",
  high: "สำคัญ",
  urgent: "ด่วนมาก",
};

const RED = "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-400/30";
const ORANGE = "bg-orange-50 text-orange-800 ring-orange-600/20 dark:bg-orange-950/60 dark:text-orange-300 dark:ring-orange-400/30";
const AMBER = "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-400/30";
const BLUE = "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-400/30";
const VIOLET = "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-950/60 dark:text-violet-300 dark:ring-violet-400/30";
const GREEN = "bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-950/60 dark:text-green-300 dark:ring-green-400/30";
const ZINC = "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-400/20";
const ZINC_LIGHT = "bg-zinc-50 text-zinc-600 ring-zinc-400/20 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-500/20";

export const PRIORITY_STYLES: Record<Priority, string> = {
  urgent: RED,
  high: ORANGE,
  normal: ZINC,
  low: ZINC_LIGHT,
};

export const REPAIR_STATUS_LABELS: Record<RepairStatus, string> = {
  open: "รับเรื่อง",
  assigned: "มอบหมายช่าง",
  in_progress: "กำลังดำเนินการ",
  pending_review: "รอกองอาคารตรวจสอบ",
  closed: "ปิดงาน",
  rejected: "ปฏิเสธคำร้อง",
};

/** Happy path, in order (rejected is a terminal branch). */
export const REPAIR_STATUS_ORDER: RepairStatus[] = ["open", "assigned", "in_progress", "pending_review", "closed"];
/** Every status, for filters. */
export const REPAIR_STATUS_FILTER_ORDER: RepairStatus[] = [...REPAIR_STATUS_ORDER, "rejected"];
/** Statuses that count as an unfinished job (leave active lists once closed / rejected). */
export const ACTIVE_REPAIR_STATUSES: RepairStatus[] = ["open", "assigned", "in_progress", "pending_review"];

/** "รับเรื่อง → มอบหมายช่าง → กำลังดำเนินการ → รอกองอาคารตรวจสอบ → ปิดงาน" */
export const REPAIR_STATUS_SEQUENCE_TEXT = REPAIR_STATUS_ORDER.map((s) => REPAIR_STATUS_LABELS[s]).join(" → ");

export const REPAIR_STATUS_STYLES: Record<RepairStatus, string> = {
  open: AMBER,
  assigned: BLUE,
  in_progress: VIOLET,
  pending_review: ORANGE,
  closed: GREEN,
  rejected: RED,
};

/** Solid dot colours for the status timeline (same hues as REPAIR_STATUS_STYLES). */
export const REPAIR_STATUS_DOT_STYLES: Record<RepairStatus, string> = {
  open: "bg-amber-500",
  assigned: "bg-blue-500",
  in_progress: "bg-violet-500",
  pending_review: "bg-orange-500",
  closed: "bg-green-500",
  rejected: "bg-red-500",
};

export const LOST_FOUND_STATUS_LABELS: Record<LostFoundStatus, string> = {
  lost: "ของหาย",
  found: "พบของ",
  returned: "ได้รับของแล้ว",
};

export const LOST_FOUND_STATUS_ORDER: LostFoundStatus[] = ["lost", "found", "returned"];

export const LOST_FOUND_STATUS_STYLES: Record<LostFoundStatus, string> = {
  lost: RED,
  found: BLUE,
  returned: GREEN,
};

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  profanity: "ใช้คำหยาบคาย",
  spam: "สแปม / โฆษณา",
  harassment: "คุกคาม / กลั่นแกล้ง",
  misinformation: "ข้อมูลเท็จ",
  other: "อื่น ๆ",
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  reported: "รายงานใหม่",
  under_review: "กำลังตรวจสอบ",
  upheld: "รับรายงาน",
  content_removed: "ลบเนื้อหาแล้ว",
  dismissed: "ปิดรายงาน (ไม่ลบเนื้อหา)",
};

export const REPORT_STATUS_STYLES: Record<ReportStatus, string> = {
  reported: AMBER,
  under_review: BLUE,
  upheld: ORANGE,
  content_removed: RED,
  dismissed: ZINC,
};

/** Thai messages for API error codes (fallback to the server message). */
export const ERROR_MESSAGES: Record<string, string> = {
  BAD_REQUEST: "คำขอไม่ถูกต้อง",
  UNAUTHENTICATED: "กรุณาเข้าสู่ระบบ",
  INVALID_CREDENTIALS: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  TOKEN_EXPIRED: "ลิงก์หรือเซสชันหมดอายุแล้ว",
  FORBIDDEN: "คุณไม่มีสิทธิ์ทำรายการนี้",
  EMAIL_NOT_VERIFIED: "ยังไม่ได้ยืนยันอีเมล กรุณายืนยันด้วยการเข้าสู่ระบบด้วย Google (@up.ac.th) ครั้งแรก",
  PASSWORD_CONFIRMATION_REQUIRED: "ใส่รหัสผ่านที่ตั้งไว้ตอนสมัครเพื่อยืนยันอีเมล",
  ACCOUNT_DISABLED: "บัญชีนี้ถูกระงับการใช้งาน",
  NOT_FOUND: "ไม่พบข้อมูลที่ต้องการ",
  CONFLICT: "ข้อมูลขัดแย้งกับสถานะปัจจุบัน",
  INVALID_TRANSITION: "ไม่สามารถเปลี่ยนสถานะตามลำดับนี้ได้ อาจมีผู้อื่นอัปเดตไปก่อนแล้ว",
  PIN_NOT_ELIGIBLE: "โพสต์นี้ปักหมุดไม่ได้แล้ว (กิจกรรมเริ่มแล้ว หรือโพสต์หมดเวลาแสดงในฟีด)",
  POSTING_TOO_FAST: "คุณโพสต์ถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
  REPAIR_TOO_FAST: "แจ้งซ่อมได้ทุก 2 นาที กรุณารอสักครู่แล้วลองใหม่",
  POSTING_SUSPENDED: "บัญชีของคุณถูกระงับการโพสต์ชั่วคราว",
  GOOGLE_LOGIN_DISABLED: "ยังไม่ได้ตั้งค่าการเข้าสู่ระบบด้วย Google",
  GOOGLE_ACCOUNT_REJECTED: "บัญชี Google นี้ใช้งานไม่ได้ กรุณาใช้บัญชี @up.ac.th ที่ยืนยันแล้ว",
  EMAIL_DOMAIN_NOT_ALLOWED: "ใช้ได้เฉพาะบัญชี Google ของมหาวิทยาลัย (@up.ac.th) เท่านั้น",
  NOT_REGISTERED: "ยังไม่มีบัญชีสำหรับอีเมลนี้ กรุณาสมัครสมาชิกก่อน แล้วจึงเข้าสู่ระบบด้วยรหัสผ่านหรือ Google",
  PASSWORD_SIGNUP_DISABLED: "กรุณาเข้าสู่ระบบด้วยบัญชี Google @up.ac.th",
  DUPLICATE_REPORT: "คุณได้รายงานโพสต์นี้ไปแล้ว",
  EMAIL_TAKEN: "อีเมลนี้ถูกใช้สมัครแล้ว",
  PROFILE_INCOMPLETE: "กรุณาเลือกบทบาท (นิสิต / อาจารย์) ให้เสร็จก่อนใช้งาน",
  FILE_TOO_LARGE: "ไฟล์มีขนาดเกิน 5 MB",
  UNSUPPORTED_MEDIA_TYPE: "รองรับเฉพาะไฟล์ JPEG, PNG หรือ WebP",
  VALIDATION_ERROR: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง",
  PROFANITY_DETECTED: "พบคำไม่สุภาพในเนื้อหา กรุณาแก้ไข",
  RATE_LIMITED: "ทำรายการบ่อยเกินไป กรุณาลองใหม่ภายหลัง",
  NETWORK_ERROR: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต",
  INTERNAL_ERROR: "เซิร์ฟเวอร์ขัดข้อง กรุณาลองใหม่ภายหลัง",
  HTTP_ERROR: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์ กรุณาลองใหม่",
};
