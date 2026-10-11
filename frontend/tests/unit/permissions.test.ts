import { describe, expect, it } from "vitest";
import {
  allowedEventPriorities,
  allowedPostTypes,
  allowedPriorities,
  can,
  hasRole,
  maxEventPriority,
  creatablePostTypes,
  nextReportStatuses,
  repairActions,
  roleCan,
  type Permission,
} from "@/lib/permissions";
import type { Role } from "@/types/api";
import { makePost, makeUser } from "../fixtures";

const ICT = { id: 10, code: "ICT", name_th: "ICT", name_en: null, is_active: true };
const student = makeUser({ id: 1, role: "student" });
const teacher = makeUser({ id: 2, role: "teacher", faculty: ICT });
const building = makeUser({ id: 4, role: "building_staff", faculty: null });
const technician = makeUser({ id: 5, role: "technician", faculty: null, is_technician: true });
const club = makeUser({ id: 6, role: "student_club" });
const admin = makeUser({ id: 9, role: "admin", faculty: null });
const everyone = [student, teacher, building, technician, club, admin];

/** Which roles have the permission (no post context), per ADR-003. */
const MATRIX: [Permission, Role[]][] = [
  ["post:create", ["student", "teacher", "building_staff", "technician", "student_club", "admin"]],
  ["post:announce", ["building_staff", "admin"]],
  ["post:create_event", ["student_club", "admin"]],
  ["post:set_priority", ["building_staff", "admin"]],
  ["post:pin", ["student_club", "building_staff", "admin"]],
  ["post:urgent", ["building_staff", "admin"]],
  ["repair:assign", ["building_staff"]],
  ["repair:set_priority", ["building_staff", "admin"]],
  ["repair:update_status", ["building_staff", "technician"]],
  ["technician:list", ["building_staff", "admin"]],
  ["report:manage", ["admin"]],
  ["user:manage", ["admin"]],
];

describe("roleCan — 6-role RBAC matrix (UX mirror of the API)", () => {
  it.each(MATRIX)("%s → %j", (perm, roles) => {
    for (const u of everyone) {
      expect(roleCan(u, perm), `${u.role} ${perm}`).toBe(roles.includes(u.role));
    }
  });

  it("returns false for anonymous users", () => {
    expect(roleCan(null, "post:create")).toBe(false);
    expect(can(undefined, "report:create")).toBe(false);
  });

  it("post:update / delete — owners only, admins any (no faculty-wide rights any more)", () => {
    const own = makePost({ author: { id: teacher.id, display_name: "x", role: "teacher" }, faculty: ICT });
    const other = makePost({ author: { id: 50, display_name: "y", role: "student" }, faculty: ICT });
    for (const u of [student, teacher, building, technician, club]) {
      expect(roleCan(u, "post:delete", other), u.role).toBe(false);
      expect(roleCan(u, "post:update", other), u.role).toBe(false);
    }
    expect(roleCan(teacher, "post:delete", own)).toBe(true);
    expect(roleCan(admin, "post:delete", other)).toBe(true);
  });

  it("repairs cannot be deleted by their owner (admin still can)", () => {
    const own = makePost({ type: "repair", author: { id: student.id, display_name: "x", role: "student" } });
    expect(roleCan(student, "post:delete", own)).toBe(false);
    expect(roleCan(student, "post:update", own)).toBe(true);
    expect(roleCan(admin, "post:delete", own)).toBe(true);
  });

  it("post:pin — clubs pin own events, building staff own announcements, admin any event/announcement", () => {
    const clubId = { id: club.id, display_name: "club", role: "student_club" as const };
    const staffId = { id: building.id, display_name: "staff", role: "building_staff" as const };
    const ownEvent = makePost({ type: "event", author: clubId });
    const ownAnn = makePost({ type: "announcement", author: staffId });
    const otherEvent = makePost({ type: "event", author: { id: 50, display_name: "y", role: "student_club" } });
    expect(roleCan(club, "post:pin", ownEvent)).toBe(true);
    expect(roleCan(club, "post:pin", otherEvent)).toBe(false);
    expect(roleCan(building, "post:pin", ownAnn)).toBe(true);
    expect(roleCan(building, "post:pin", ownEvent)).toBe(false);
    expect(roleCan(admin, "post:pin", otherEvent)).toBe(true);
    // general / repair / lost & found posts are never pinnable
    for (const type of ["general", "repair", "lost_found"] as const) {
      expect(roleCan(admin, "post:pin", makePost({ type }))).toBe(false);
    }
  });

  it("repair:update_status — technicians rely on the backend flag (assigned jobs only), admin is view-only", () => {
    const repairPost = makePost({
      type: "repair",
      repair: {
        location: "CE",
        status: "assigned",
        is_assigned: true,
        updated_at: "2026-10-05T00:00:00Z",
        latitude: null,
        longitude: null,
        technician: { id: 77, display_name: "ช่าง" },
        history: [],
      },
    });
    // a technician may update status in principle; only the backend flag knows it is *this* job
    expect(roleCan(technician, "repair:update_status", repairPost)).toBe(true);
    expect(can(technician, "repair:update_status", repairPost)).toBe(false);
    expect(roleCan(admin, "repair:update_status", repairPost)).toBe(false); // admin: view-only
    expect(roleCan(building, "repair:update_status", repairPost)).toBe(true);
    const flagged = { ...repairPost, permissions: { ...repairPost.permissions, can_update_status: true } };
    expect(can(technician, "repair:update_status", flagged)).toBe(true);
    expect(can(student, "repair:update_status", repairPost)).toBe(false);
  });

  it("repair:read_private — reporter, building staff and admin", () => {
    const report = makePost({ type: "repair", author: { id: student.id, display_name: "x", role: "student" } });
    expect(roleCan(student, "repair:read_private", report)).toBe(true);
    expect(roleCan(building, "repair:read_private", report)).toBe(true);
    expect(roleCan(admin, "repair:read_private", report)).toBe(true);
    expect(roleCan(teacher, "repair:read_private", report)).toBe(false);
  });

  it("lost_found:update_status — owner and admin", () => {
    const own = makePost({ type: "lost_found", author: { id: student.id, display_name: "x", role: "student" } });
    const other = makePost({ type: "lost_found", author: { id: 999, display_name: "x", role: "student" } });
    expect(roleCan(student, "lost_found:update_status", own)).toBe(true);
    expect(roleCan(student, "lost_found:update_status", other)).toBe(false);
    expect(roleCan(teacher, "lost_found:update_status", other)).toBe(false);
    expect(roleCan(admin, "lost_found:update_status", other)).toBe(true);
  });
});

describe("can — prefers backend post.permissions", () => {
  it("uses the backend flag even when the role would allow it", () => {
    const own = makePost({
      type: "event",
      author: { id: club.id, display_name: "club", role: "student_club" },
      permissions: { ...makePost().permissions, can_pin: false },
    });
    expect(roleCan(club, "post:pin", own)).toBe(true);
    expect(can(club, "post:pin", own)).toBe(false);
  });

  it("uses the backend flag even when the role would deny it", () => {
    const post = makePost({ permissions: { ...makePost().permissions, can_edit: true } });
    expect(can(student, "post:update", post)).toBe(true);
  });

  it("falls back to the role matrix for permissions without a post flag", () => {
    expect(can(admin, "user:manage", makePost())).toBe(true);
    expect(can(student, "user:manage", makePost())).toBe(false);
  });
});

describe("helpers", () => {
  it("hasRole", () => {
    expect(hasRole(admin, ["admin"])).toBe(true);
    expect(hasRole(teacher, ["admin"])).toBe(false);
    expect(hasRole(null, ["admin"])).toBe(false);
  });

  it("allowedPriorities: only building staff and admin choose a priority (urgent included)", () => {
    for (const u of [student, teacher, technician, club]) expect(allowedPriorities(u)).toEqual(["normal"]);
    for (const u of [building, admin]) expect(allowedPriorities(u)).toContain("urgent");
  });

  it("allowedPostTypes / creatablePostTypes follow the role matrix", () => {
    for (const u of [student, teacher, technician]) expect(allowedPostTypes(u)).toEqual(["general"]);
    expect(allowedPostTypes(club)).toEqual(["general", "event"]);
    expect(allowedPostTypes(building)).toEqual(["general", "announcement"]);
    expect(allowedPostTypes(admin)).toEqual(["general", "announcement", "event"]);
    expect(creatablePostTypes(student)).toEqual(["general", "repair", "lost_found"]);
    expect(creatablePostTypes(club)).toEqual(["general", "event", "repair", "lost_found"]);
    expect(creatablePostTypes(null)).toEqual([]);
  });

  it("event priority is capped by role: admin/building staff=university, everyone else=department", () => {
    expect(maxEventPriority(admin)).toBe("university");
    expect(maxEventPriority(building)).toBe("university");
    for (const u of [student, teacher, club, technician]) expect(maxEventPriority(u)).toBe("department");
    expect(allowedEventPriorities(admin)).toEqual(["university", "faculty", "department"]);
    expect(allowedEventPriorities(club)).toEqual(["department"]);
  });

  it("nextReportStatuses: remove content or close without removal", () => {
    for (const s of ["reported", "under_review", "upheld"] as const) {
      expect(nextReportStatuses(s)).toEqual(["content_removed", "dismissed"]);
    }
    expect(nextReportStatuses("content_removed")).toEqual([]);
    expect(nextReportStatuses("dismissed")).toEqual([]);
  });

  it("repairActions: building staff manage, only the assigned technician works the job", () => {
    expect(repairActions("open", "building_staff", false)).toEqual(["assign", "reject"]);
    expect(repairActions("assigned", "technician", true)).toEqual(["start"]);
    expect(repairActions("assigned", "technician", false)).toEqual([]);
    expect(repairActions("in_progress", "technician", true)).toEqual(["submit_review"]);
    expect(repairActions("pending_review", "building_staff", false)).toEqual(["close", "send_back", "reject"]);
    expect(repairActions("pending_review", "technician", true)).toEqual([]);
    expect(repairActions("closed", "building_staff", false)).toEqual([]);
    expect(repairActions("rejected", "building_staff", false)).toEqual([]);
    expect(repairActions("open", "admin", false)).toEqual([]);
  });
});
