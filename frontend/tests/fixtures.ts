import type { Post, User, RepairStatus } from "@/types/api";

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    email: "65000001@up.ac.th",
    display_name: "สมชาย ใจดี",
    role: "student",
    faculty: {
      id: 10,
      code: "ICT",
      name_th: "คณะเทคโนโลยีสารสนเทศและการสื่อสาร",
      name_en: "ICT",
      is_active: true,
    },
    is_verified: true,
    is_active: true,
    is_technician: false,
    has_password: false,
    program: null,
    contacts: { facebook: null, instagram: null, line: null },
    profile_completed: true,
    posting_suspended_until: null,
    suspension: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

export function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 42,
    type: "general",
    title: "ประกาศปิดปรับปรุงห้องสมุด",
    content: "ห้องสมุดกลางปิดปรับปรุงชั่วคราว",
    priority: "normal",
    status: "active",
    category: { id: 3, slug: "general", name_th: "โพสต์ทั่วไป", allowed_type: null },
    faculty: {
      id: 10,
      code: "ICT",
      name_th: "คณะเทคโนโลยีสารสนเทศและการสื่อสาร",
      name_en: "ICT",
      is_active: true,
    },
    author: { id: 7, display_name: "อาจารย์สมศรี", role: "teacher" },
    created_at: "2026-10-05T00:00:00Z",
    updated_at: "2026-10-05T00:00:00Z",
    pinned_at: null,
    pinned_until: null,
    is_pinned: false,
    dashboard_expires_at: "2026-10-06T00:00:00Z",
    lifecycle: "active",
    attachments: [],
    event: null,
    repair: null,
    lost_found: null,
    related_repair_id: null,
    permissions: {
      can_edit: false,
      can_delete: false,
      can_pin: false,
      can_update_status: false,
      can_assign: false,
      can_set_priority: false,
      can_report: true,
    },
    ...overrides,
  };
}

export function makeRepair(status: RepairStatus): NonNullable<Post["repair"]> {
  return {
    location: "อาคาร ICT ชั้น 1",
    status,
    is_assigned: status !== "open",
    updated_at: "2026-10-05T00:00:00Z",
    latitude: null,
    longitude: null,
    technician: null,
    history: [],
  };
}
