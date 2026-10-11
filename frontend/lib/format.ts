/**
 * Thai date/time helpers. The backend always sends UTC ISO-8601; we display in
 * Asia/Bangkok using Intl "th-TH" (Buddhist-era calendar).
 */
export const TIME_ZONE = "Asia/Bangkok";
export const LOCALE = "th-TH";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type DateInput = string | Date | number;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDateTime(value: DateInput): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(toDate(value));
}

export function formatDate(value: DateInput): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(toDate(value));
}

export function formatTime(value: DateInput): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(toDate(value));
}

/** Day of month in Bangkok time, e.g. "5". */
export function formatDayOfMonth(value: DateInput): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, day: "numeric" }).format(toDate(value));
}

/** Short Thai month in Bangkok time, e.g. "ต.ค.". */
export function formatMonthShort(value: DateInput): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, month: "short" }).format(toDate(value));
}

/** e.g. "3 ชม. 20 นาที", "2 วัน 4 ชม.", "45 นาที", "ไม่ถึง 1 นาที" */
export function formatDuration(ms: number): string {
  if (ms < MINUTE) return "ไม่ถึง 1 นาที";
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  if (days > 0) return hours > 0 ? `${days} วัน ${hours} ชม.` : `${days} วัน`;
  if (hours > 0) return minutes > 0 ? `${hours} ชม. ${minutes} นาที` : `${hours} ชม.`;
  return `${minutes} นาที`;
}

/** Relative time in Thai: "เมื่อสักครู่", "5 นาทีที่แล้ว", "อีก 2 ชั่วโมง"; ≥7 days → date. */
export function formatRelative(value: DateInput, now: number = Date.now()): string {
  const diff = toDate(value).getTime() - now;
  const abs = Math.abs(diff);
  const past = diff <= 0;
  if (abs < MINUTE) return past ? "เมื่อสักครู่" : "อีกไม่ถึง 1 นาที";
  let amount: string;
  if (abs < HOUR) amount = `${Math.floor(abs / MINUTE)} นาที`;
  else if (abs < DAY) amount = `${Math.floor(abs / HOUR)} ชั่วโมง`;
  else if (abs < 7 * DAY) amount = `${Math.floor(abs / DAY)} วัน`;
  else return formatDate(value);
  return past ? `${amount}ที่แล้ว` : `อีก ${amount}`;
}

export interface Countdown {
  expired: boolean;
  remainingMs: number;
  label: string;
}

/** Generic countdown to a future instant. */
export function getCountdown(target: DateInput, now: number = Date.now()): Countdown {
  const remainingMs = toDate(target).getTime() - now;
  if (remainingMs <= 0) return { expired: true, remainingMs: 0, label: "หมดเวลาแล้ว" };
  return { expired: false, remainingMs, label: `เหลือ ${formatDuration(remainingMs)}` };
}

/** Countdown chip for `dashboard_expires_at` (created_at + 24h). */
export function dashboardCountdown(
  dashboardExpiresAt: string,
  now: number = Date.now(),
): Countdown {
  const c = getCountdown(dashboardExpiresAt, now);
  return c.expired
    ? { ...c, label: "หมดเวลาบนหน้าแรก" }
    : { ...c, label: `บนหน้าแรกอีก ${formatDuration(c.remainingMs)}` };
}

/** Pin badge label for `pinned_until`; null when not pinned / already expired. */
export function pinCountdown(pinnedUntil: string | null, now: number = Date.now()): Countdown | null {
  if (!pinnedUntil) return null;
  const c = getCountdown(pinnedUntil, now);
  return c.expired ? null : { ...c, label: `ปักหมุดอีก ${formatDuration(c.remainingMs)}` };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat(LOCALE).format(n);
}

/** `<input type="datetime-local">` value (browser local time) → ISO-8601 UTC. */
export function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

/** ISO-8601 → `<input type="datetime-local">` value in browser local time. */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
