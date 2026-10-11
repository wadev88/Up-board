import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dashboardCountdown,
  formatDateTime,
  formatDuration,
  formatRelative,
  getCountdown,
  pinCountdown,
} from "@/lib/format";

const NOW = new Date("2026-10-05T12:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;

describe("format (fake timers)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("formatRelative", () => {
    it("just now", () => {
      expect(formatRelative(new Date(NOW.getTime() - 20_000).toISOString())).toBe("เมื่อสักครู่");
    });
    it("minutes / hours / days ago", () => {
      expect(formatRelative(new Date(NOW.getTime() - 5 * MIN).toISOString())).toBe("5 นาทีที่แล้ว");
      expect(formatRelative(new Date(NOW.getTime() - 3 * HOUR).toISOString())).toBe("3 ชั่วโมงที่แล้ว");
      expect(formatRelative(new Date(NOW.getTime() - 2 * 24 * HOUR).toISOString())).toBe("2 วันที่แล้ว");
    });
    it("future", () => {
      expect(formatRelative(new Date(NOW.getTime() + 2 * HOUR).toISOString())).toBe("อีก 2 ชั่วโมง");
    });
    it("falls back to a Thai date after 7 days", () => {
      const s = formatRelative("2026-09-01T00:00:00Z");
      expect(s).toMatch(/2569/); // Buddhist era year
    });
    it("re-evaluates as time passes", () => {
      const created = new Date(NOW.getTime() - 59 * MIN).toISOString();
      expect(formatRelative(created)).toBe("59 นาทีที่แล้ว");
      vi.advanceTimersByTime(2 * MIN);
      expect(formatRelative(created)).toBe("1 ชั่วโมงที่แล้ว");
    });
  });

  describe("countdowns", () => {
    it("formatDuration", () => {
      expect(formatDuration(30_000)).toBe("ไม่ถึง 1 นาที");
      expect(formatDuration(45 * MIN)).toBe("45 นาที");
      expect(formatDuration(3 * HOUR + 20 * MIN)).toBe("3 ชม. 20 นาที");
      expect(formatDuration(2 * HOUR)).toBe("2 ชม.");
      expect(formatDuration(26 * HOUR)).toBe("1 วัน 2 ชม.");
      expect(formatDuration(48 * HOUR)).toBe("2 วัน");
    });

    it("getCountdown before and after the target", () => {
      const target = new Date(NOW.getTime() + 90 * MIN).toISOString();
      expect(getCountdown(target)).toMatchObject({ expired: false, label: "เหลือ 1 ชม. 30 นาที" });
      vi.advanceTimersByTime(91 * MIN);
      expect(getCountdown(target)).toMatchObject({ expired: true, remainingMs: 0 });
    });

    it("dashboard_expires_at chip shows remaining time, then 'หมดเวลาบนหน้าแรก'", () => {
      const expires = new Date(NOW.getTime() + 5 * HOUR).toISOString();
      expect(dashboardCountdown(expires).label).toBe("บนหน้าแรกอีก 5 ชม.");
      vi.advanceTimersByTime(5 * HOUR + 1);
      const c = dashboardCountdown(expires);
      expect(c.expired).toBe(true);
      expect(c.label).toBe("หมดเวลาบนหน้าแรก");
    });

    it("pinned_until countdown and expiry", () => {
      expect(pinCountdown(null)).toBeNull();
      const until = new Date(NOW.getTime() + 24 * HOUR).toISOString();
      expect(pinCountdown(until)?.label).toBe("ปักหมุดอีก 1 วัน");
      vi.advanceTimersByTime(24 * HOUR);
      expect(pinCountdown(until)).toBeNull();
    });
  });

  it("formats dates in Asia/Bangkok (UTC+7)", () => {
    // 2026-10-05T20:30Z is 03:30 next day in Bangkok
    const s = formatDateTime("2026-10-05T20:30:00Z");
    expect(s).toContain("03:30");
    expect(s).toMatch(/6/);
  });
});
