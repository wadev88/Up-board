import { describe, expect, it } from "vitest";
import { loginSchema, onboardingSchema, registerSchema, upEmailSchema } from "@/features/auth/schemas";
import { postFormSchema } from "@/features/posts/schemas";
import { createReportSchema } from "@/features/moderation/schemas";
import { repairFormSchema } from "@/features/repairs/schemas";
import { adminCreateUserSchema, adminUserSchema } from "@/features/admin/schemas";

function issuesFor(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, field: string) {
  return result.error?.issues.filter((i) => i.path[0] === field).map((i) => i.message) ?? [];
}

describe("@up.ac.th email rule", () => {
  it("accepts university emails (case/space-insensitive)", () => {
    expect(upEmailSchema.parse("  65000001@UP.AC.TH ")).toBe("65000001@up.ac.th");
    expect(loginSchema.safeParse({ email: "staff.name@up.ac.th", password: "x" }).success).toBe(true);
  });

  it("rejects other domains and look-alikes", () => {
    for (const email of ["a@gmail.com", "a@up.ac.th.evil.com", "a@notup.ac.th.com", "up.ac.th", ""]) {
      expect(upEmailSchema.safeParse(email).success, email).toBe(false);
    }
  });

  it("shows a Thai message for a non-university email", () => {
    const r = loginSchema.safeParse({ email: "someone@gmail.com", password: "x" });
    expect(issuesFor(r, "email").join(" ")).toContain("@up.ac.th");
  });
});

describe("registerSchema", () => {
  const base = {
    email: "65000001@up.ac.th",
    display_name: "สมชาย",
    password: "password123",
    confirm_password: "password123",
    faculty_id: 1,
    program_id: 2,
  };
  it("accepts valid input", () => {
    expect(registerSchema.safeParse(base).success).toBe(true);
  });
  it("requires matching passwords", () => {
    const r = registerSchema.safeParse({ ...base, confirm_password: "different1" });
    expect(issuesFor(r, "confirm_password")).toContain("รหัสผ่านไม่ตรงกัน");
  });
  it("enforces password 8–128 and display name 2–60", () => {
    expect(registerSchema.safeParse({ ...base, password: "short", confirm_password: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, display_name: "ก" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, display_name: "ก".repeat(61) }).success).toBe(false);
  });
  it("requires a program", () => {
    expect(registerSchema.safeParse({ ...base, program_id: 0 }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, program_id: Number.NaN }).success).toBe(false);
  });
  it("requires a faculty", () => {
    expect(registerSchema.safeParse({ ...base, faculty_id: 0 }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, faculty_id: Number.NaN }).success).toBe(false);
  });
});

describe("postFormSchema", () => {
  const base = {
    type: "general" as const,
    title: "หัวข้อทดสอบ",
    content: "เนื้อหา",
    priority: "normal" as const,
    event_priority: "department" as const,
    related_repair_id: 0,
    attachment_ids: [],
  };

  it("accepts a general post and an announcement without event times", () => {
    expect(postFormSchema.safeParse(base).success).toBe(true);
    expect(postFormSchema.safeParse({ ...base, type: "announcement" }).success).toBe(true);
  });

  it("event requires both start and end (BR-01)", () => {
    const r = postFormSchema.safeParse({ ...base, type: "event" });
    expect(r.success).toBe(false);
    expect(issuesFor(r, "event_starts_at").length).toBe(1);
    expect(issuesFor(r, "event_ends_at").length).toBe(1);
    const noEnd = postFormSchema.safeParse({ ...base, type: "event", event_starts_at: "2026-10-10T09:00" });
    expect(issuesFor(noEnd, "event_ends_at")).toContain("กรุณาระบุวันเวลาสิ้นสุดกิจกรรม");
  });

  it("event with start and later end is valid", () => {
    expect(
      postFormSchema.safeParse({
        ...base,
        type: "event",
        event_starts_at: "2026-10-10T09:00",
        event_ends_at: "2026-10-10T12:00",
      }).success,
    ).toBe(true);
  });

  it.each(["2026-10-10T08:00", "2026-10-10T09:00"])("end %s must be after the start", (end) => {
    const r = postFormSchema.safeParse({
      ...base,
      type: "event",
      event_starts_at: "2026-10-10T09:00",
      event_ends_at: end,
    });
    expect(issuesFor(r, "event_ends_at")).toContain("เวลาสิ้นสุดต้องหลังเวลาเริ่ม");
  });

  it("limits attachments to 4", () => {
    expect(postFormSchema.safeParse({ ...base, attachment_ids: [1, 2, 3, 4, 5] }).success).toBe(false);
  });

  it("has no category: the server derives it from the type", () => {
    expect(postFormSchema.safeParse(base).success).toBe(true);
  });
});

describe("other schemas", () => {
  it("report reason 'other' requires detail", () => {
    expect(createReportSchema.safeParse({ reason: "spam" }).success).toBe(true);
    expect(createReportSchema.safeParse({ reason: "other", detail: "" }).success).toBe(false);
    expect(createReportSchema.safeParse({ reason: "other", detail: "เหตุผล" }).success).toBe(true);
  });

  it("repair form requires a location", () => {
    const r = repairFormSchema.safeParse({
      attachment_ids: [],
      location: "",
      latitude: null,
      longitude: null,
      title: "ไฟดับ",
      content: "ไฟทางเดินดับ",
    });
    expect(issuesFor(r, "location").length).toBeGreaterThan(0);
  });

  it("admin user: teachers must have a faculty", () => {
    const base = { role: "teacher" as const, faculty_id: 0, program_id: 0, is_active: true, is_verified: true, lift_suspension: false };
    expect(adminUserSchema.safeParse(base).success).toBe(false);
    expect(adminUserSchema.safeParse({ ...base, faculty_id: 3 }).success).toBe(false); // program missing
    expect(adminUserSchema.safeParse({ ...base, faculty_id: 3, program_id: 9 }).success).toBe(true);
    for (const role of ["student", "technician", "building_staff", "student_club", "admin"] as const) {
      expect(adminUserSchema.safeParse({ ...base, role }).success, role).toBe(true);
    }
    expect(adminUserSchema.safeParse({ ...base, role: "faculty_staff" }).success).toBe(false);
  });

  it("admin create user: @up.ac.th required, except club accounts which may use any email", () => {
    const base = { email: "club@up.ac.th", display_name: "สโมสร", role: "student_club" as const, faculty_id: 0, program_id: 0 };
    expect(adminCreateUserSchema.safeParse(base).success).toBe(true);
    expect(adminCreateUserSchema.safeParse({ ...base, email: "club@gmail.com" }).success).toBe(true);
    expect(adminCreateUserSchema.safeParse({ ...base, role: "building_staff", email: "x@gmail.com" }).success).toBe(false);
    expect(adminCreateUserSchema.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
    expect(adminCreateUserSchema.safeParse({ ...base, display_name: "" }).success).toBe(false);
    expect(adminCreateUserSchema.safeParse({ ...base, role: "teacher" }).success).toBe(false);
  });

  it("a chosen faculty needs a program", () => {
    const base = { email: "t@up.ac.th", display_name: "อาจารย์", role: "teacher" as const, faculty_id: 1, program_id: 0 };
    expect(adminCreateUserSchema.safeParse(base).success).toBe(false);
    expect(adminCreateUserSchema.safeParse({ ...base, program_id: 5 }).success).toBe(true);
  });

  it("onboarding: faculty and program are both required", () => {
    expect(onboardingSchema.safeParse({ faculty_id: 1, program_id: 2 }).success).toBe(true);
    expect(onboardingSchema.safeParse({ faculty_id: 1, program_id: 0 }).success).toBe(false);
    expect(onboardingSchema.safeParse({ faculty_id: 0, program_id: 0 }).success).toBe(false);
  });
});
