/**
 * Role helpers mirroring the RBAC matrix (ADR-003, backend/app/core/permissions.py).
 * UX ONLY — the backend always decides. When a Post carries `permissions`
 * (computed by the backend for the current caller) prefer those.
 */
import type {
  EventPriority,
  Post,
  PostPermissions,
  PostType,
  Priority,
  RepairStatus,
  ReportStatus,
  Role,
  User,
} from "@/types/api";
import { EVENT_PRIORITY_ORDER } from "@/lib/constants";

export type Permission =
  | "post:create"
  | "post:announce"
  | "post:create_event"
  | "post:set_priority"
  | "post:update"
  | "post:delete"
  | "post:pin"
  | "post:urgent"
  | "repair:read_public"
  | "repair:read_private"
  | "repair:update_status"
  | "repair:assign"
  | "repair:set_priority"
  | "technician:list"
  | "lost_found:update_status"
  | "report:create"
  | "report:manage"
  | "user:manage";

type MinimalUser = Pick<User, "id" | "role"> & {
  faculty?: { id: number } | null;
  is_technician?: boolean;
};

/** Which backend-computed flag answers a given permission for a specific post. */
export const POST_PERMISSION_FLAG: Partial<Record<Permission, keyof PostPermissions>> = {
  "post:update": "can_edit",
  "post:delete": "can_delete",
  "post:pin": "can_pin",
  "repair:update_status": "can_update_status",
  "lost_found:update_status": "can_update_status",
  "repair:assign": "can_assign",
  "repair:set_priority": "can_set_priority",
  "report:create": "can_report",
};

/** Only building staff and admins publish announcements and set priorities (incl. urgent). */
const ANNOUNCER_ROLES: Role[] = ["building_staff", "admin"];
/** Clubs (สโมสร / ชมรม / องค์การ / สภา …) and admins publish events. */
const EVENT_ROLES: Role[] = ["student_club", "admin"];

/** The post facts the role checks need (a full Post satisfies this). */
type PostLike = Pick<Post, "author"> & Partial<Pick<Post, "faculty" | "repair" | "type">>;

export const isAdmin = (u: MinimalUser | null | undefined) => u?.role === "admin";
export const isBuildingStaff = (u: MinimalUser | null | undefined) => u?.role === "building_staff";
export const isTechnician = (u: MinimalUser | null | undefined) => u?.role === "technician";
export const isStudentClub = (u: MinimalUser | null | undefined) => u?.role === "student_club";

export function hasRole(u: MinimalUser | null | undefined, roles: Role[]): boolean {
  return !!u && roles.includes(u.role);
}

function isOwner(u: MinimalUser, post?: Pick<Post, "author"> | null): boolean {
  return !!post?.author && post.author.id === u.id;
}

/**
 * Role-based check (no backend flags). `post` narrows ownership rules.
 * Without a post, returns whether the role *can ever* have the permission.
 */
export function roleCan(
  u: MinimalUser | null | undefined,
  perm: Permission,
  post?: PostLike | null,
): boolean {
  if (!u) return false;
  const role = u.role;
  switch (perm) {
    case "post:create":
      return true;
    case "post:set_priority":
    case "post:urgent":
      return ANNOUNCER_ROLES.includes(role);
    case "post:announce":
      return ANNOUNCER_ROLES.includes(role);
    case "post:create_event":
      return EVENT_ROLES.includes(role);
    case "repair:read_public":
    case "report:create":
      return true;
    case "post:update":
      // owners only (never somebody else's post)
      return post ? isOwner(u, post) : true;
    case "post:delete":
      // owners delete their own posts, but never a repair; admins moderate any post
      if (role === "admin") return true;
      if (post?.type === "repair") return false;
      return post ? isOwner(u, post) : true;
    case "post:pin": {
      // events: the club that wrote it · announcements: the staff member that wrote it · admin: any
      if (post?.type && post.type !== "event" && post.type !== "announcement") return false;
      if (role === "admin") return true;
      if (post?.type === "event" && role !== "student_club") return false;
      if (post?.type === "announcement" && role !== "building_staff") return false;
      if (!post?.type && role !== "student_club" && role !== "building_staff") return false;
      return post ? isOwner(u, post) : true;
    }
    case "repair:assign":
      return role === "building_staff";
    case "repair:set_priority":
      return role === "building_staff" || role === "admin";
    case "technician:list":
      return role === "building_staff" || role === "admin";
    case "repair:read_private":
      if (role === "building_staff" || role === "admin") return true;
      return isOwner(u, post);
    case "repair:update_status":
      // technicians: only jobs assigned to them — only the backend flag knows that
      // (admin is view-only on repair status)
      return role === "building_staff" || role === "technician";
    case "lost_found:update_status":
      if (role === "admin") return true;
      return post ? isOwner(u, post) : true;
    case "report:manage":
    case "user:manage":
      return role === "admin";
    default:
      return false;
  }
}

/**
 * Preferred check for UI: uses `post.permissions` from the backend when present,
 * otherwise falls back to the role matrix.
 */
export function can(
  u: MinimalUser | null | undefined,
  perm: Permission,
  post?: PostLike & { permissions?: PostPermissions | null },
): boolean {
  if (!u) return false;
  const flag = POST_PERMISSION_FLAG[perm];
  if (post?.permissions && flag) return post.permissions[flag];
  return roleCan(u, perm, post);
}

/** Post types (general / announcement / event) the role may create; the API checks the same. */
export function allowedPostTypes(u: MinimalUser | null | undefined): ("general" | "announcement" | "event")[] {
  const types: ("general" | "announcement" | "event")[] = [];
  if (roleCan(u, "post:create")) types.push("general");
  if (roleCan(u, "post:announce")) types.push("announcement");
  if (roleCan(u, "post:create_event")) types.push("event");
  return types;
}

/** Every post type the role may create, including repairs and lost & found (everyone may). */
export function creatablePostTypes(u: MinimalUser | null | undefined): PostType[] {
  if (!u) return [];
  return [...allowedPostTypes(u), "repair", "lost_found"];
}

/** Priorities a user may choose in the post form (only building staff and admins; others: "normal"). */
export function allowedPriorities(u: MinimalUser | null | undefined): readonly Priority[] {
  if (!roleCan(u, "post:set_priority")) return ["normal"] as const;
  const base = ["low", "normal", "high"] as const;
  return roleCan(u, "post:urgent") ? ([...base, "urgent"] as const) : base;
}

/** Highest event priority the role may use; the API enforces the same cap. */
export function maxEventPriority(u: MinimalUser | null | undefined): EventPriority {
  if (u?.role === "admin" || u?.role === "building_staff") return "university";
  return "department";
}

/** Event priorities a user may choose, highest first. */
export function allowedEventPriorities(u: MinimalUser | null | undefined): EventPriority[] {
  const cap = EVENT_PRIORITY_ORDER.indexOf(maxEventPriority(u));
  return EVENT_PRIORITY_ORDER.slice(cap);
}

/* ---------- state machines (UX hints; backend returns 409 INVALID_TRANSITION) ---------- */

/** Report: admins either remove the content or close without removal (from reported / under_review / upheld). */
export function nextReportStatuses(status: ReportStatus): ReportStatus[] {
  switch (status) {
    case "reported":
    case "under_review":
    case "upheld":
      return ["content_removed", "dismissed"];
    default:
      return [];
  }
}

export type RepairAction = "assign" | "start" | "submit_review" | "close" | "send_back" | "reject";

/**
 * Repair workflow actions (UX hints; the backend decides and returns 409 INVALID_TRANSITION):
 * building staff assign (or reassign while open / assigned / in progress), reject with a reason,
 * close or send back a job that awaits review; only the assigned technician starts a job and
 * sends it for review. Admins are view-only; closed and rejected are terminal.
 */
export function repairActions(
  status: RepairStatus,
  role: Role | undefined,
  isAssignedTechnician: boolean,
): RepairAction[] {
  const actions: RepairAction[] = [];
  if (role === "building_staff") {
    if (status === "open" || status === "assigned" || status === "in_progress") actions.push("assign");
    if (status === "pending_review") actions.push("close", "send_back");
    if (status !== "closed" && status !== "rejected") actions.push("reject");
  }
  if (role === "technician" && isAssignedTechnician) {
    if (status === "assigned") actions.push("start");
    if (status === "in_progress") actions.push("submit_review");
  }
  return actions;
}
