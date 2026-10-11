/**
 * Types mirrored 1:1 from docs/architecture/api-contract.md (UP Board REST API v1).
 * Do not rename fields here — the contract is the single source of truth.
 */

/**
 * One role per account. Students and teachers pick theirs once at the first sign-in
 * (onboarding); every other role is created / assigned by an admin.
 */
export type Role =
  | "student"
  | "teacher"
  | "technician"
  | "building_staff"
  | "student_club"
  | "admin";
export type PostType = "general" | "announcement" | "event" | "repair" | "lost_found";
export type Priority = "low" | "normal" | "high" | "urgent";
/** University > Faculty > Department; the server caps it by the author's role. */
export type EventPriority = "department" | "faculty" | "university";
export type RepairStatus =
  | "open"
  | "assigned"
  | "in_progress"
  | "pending_review"
  | "closed"
  | "rejected";
/** Computed by the server from the lifecycle rules (ADR-003). */
export type PostLifecycle = "active" | "expired" | "resolved" | "archived" | "removed";
export type HistoryState = "active" | "expired" | "resolved" | "archived";
export type LostFoundStatus = "lost" | "found" | "returned";
export type ReportStatus =
  | "reported"
  | "under_review"
  | "upheld"
  | "content_removed"
  | "dismissed";
export type ReportReason =
  | "profanity"
  | "spam"
  | "harassment"
  | "misinformation"
  | "other";
export type PostStatus = "active" | "removed";

/** สาขาวิชา — belongs to one faculty; retired programs are `is_active=false`, never deleted. */
export interface Program {
  id: number;
  faculty_id: number;
  code: string;
  name_th: string;
  name_en: string | null;
  is_active: boolean;
}

export interface Faculty {
  id: number;
  code: string;
  name_th: string;
  name_en: string | null;
  is_active: boolean;
  /** only an admin can assign it (university central / facilities); hidden from GET /faculties */
  admin_only?: boolean;
  /** active programs (GET /faculties) or all programs (GET /admin/faculties); absent on embedded faculties */
  programs?: Program[];
}

export interface Contacts {
  facebook: string | null;
  instagram: string | null;
  line: string | null;
}

export interface Suspension {
  starts_at: string;
  /** last suspended calendar day (YYYY-MM-DD, Asia/Bangkok) */
  last_day: string;
  /** when posting is restored */
  ends_at: string;
}

export interface Category {
  id: number;
  slug: string;
  name_th: string;
  allowed_type: PostType | null;
}

export interface User {
  id: number;
  email: string;
  display_name: string;
  role: Role;
  faculty: Faculty | null;
  is_verified: boolean;
  is_active: boolean;
  is_technician: boolean;
  /** false for accounts that only sign in with Google */
  has_password: boolean;
  program: Program | null;
  contacts: Contacts;
  /** false until a self-registered account picks student / teacher (onboarding) */
  profile_completed: boolean;
  /** set while the spam policy suspends posting (ISO time it ends) */
  posting_suspended_until: string | null;
  /** the active suspension, if any */
  suspension: Suspension | null;
  created_at: string;
}

/** GET /users/{id} — only non-empty contacts are returned. */
export interface UserPublic {
  id: number;
  display_name: string;
  role: Role;
  faculty: Faculty | null;
  program: Program | null;
  contacts: Partial<Contacts>;
}

export interface UserBrief {
  id: number;
  display_name: string;
  role: Role;
}

export interface Attachment {
  id: number;
  url: string;
  mime_type: string;
  size_bytes: number;
  kind: "image" | "repair_after";
}

export interface EventInfo {
  starts_at: string;
  /** null only for legacy events created before ends_at became required */
  ends_at: string | null;
  venue: string | null;
  priority_level: EventPriority;
}

export interface RepairHistoryItem {
  from_status: RepairStatus | null;
  to_status: RepairStatus;
  changed_at: string;
  /** null for public viewers */
  note: string | null;
  /** null for public viewers */
  changed_by: UserBrief | null;
}

export interface RepairInfo {
  location: string;
  status: RepairStatus;
  is_assigned: boolean;
  updated_at: string;
  latitude: number | null;
  longitude: number | null;
  technician: { id: number; display_name: string } | null;
  history: RepairHistoryItem[];
}

export interface LostFoundInfo {
  location: string;
  status: LostFoundStatus;
  occurred_at: string | null;
  updated_at: string;
}

export interface SpamNotice {
  action: "warning" | "suspension";
  count: number;
  suspended_until: string | null;
}

export interface PostPermissions {
  can_edit: boolean;
  can_delete: boolean;
  can_pin: boolean;
  can_update_status: boolean;
  can_assign: boolean;
  /** repairs: building staff set the urgency */
  can_set_priority: boolean;
  can_report: boolean;
}

export interface Post {
  id: number;
  type: PostType;
  title: string;
  content: string;
  priority: Priority;
  status: PostStatus;
  category: Category;
  faculty: Faculty | null;
  /** null for repairs when the viewer is public (reporter hidden) */
  author: UserBrief | null;
  created_at: string;
  updated_at: string;
  pinned_at: string | null;
  pinned_until: string | null;
  is_pinned: boolean;
  /** created_at + 24h */
  dashboard_expires_at: string;
  lifecycle: PostLifecycle;
  attachments: Attachment[];
  event: EventInfo | null;
  repair: RepairInfo | null;
  lost_found: LostFoundInfo | null;
  /** announcements only: the repair post this announcement is about */
  related_repair_id: number | null;
  permissions: PostPermissions;
  /** only filled in the create-post response */
  spam_notice?: SpamNotice | null;
}

export interface Notification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ReportAction {
  id: number;
  admin: UserBrief;
  from_status: ReportStatus;
  to_status: ReportStatus;
  note: string | null;
  created_at: string;
}

export interface Report {
  id: number;
  reason: ReportReason;
  detail: string | null;
  status: ReportStatus;
  created_at: string;
  post: { id: number; title: string; type: PostType; status: PostStatus };
  reporter: UserBrief;
  actions: ReportAction[];
}

export interface Technician {
  id: number;
  user: UserBrief;
  specialty: string | null;
  zone: string | null;
  is_available: boolean;
}

/* ---------- envelopes & responses ---------- */

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ApiErrorDetail {
  field?: string;
  message?: string;
  terms?: string[];
  [key: string]: unknown;
}

export interface ApiErrorEnvelope {
  error: { code: string; message: string; details?: ApiErrorDetail[] };
}

export interface AuthConfig {
  google_enabled: boolean;
  password_signup_enabled: boolean;
  allowed_email_domain: string;
}

export interface MessageResponse {
  message: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  user: User;
}

export interface DashboardResponse {
  pinned: Post[];
  upcoming: Post[];
  recent: Post[];
  /** active repairs, priority desc then newest */
  repairs: Post[];
  /** lost / found items still searched for (within 7 days) */
  lost_found: Post[];
  generated_at: string;
}

export interface UploadResponse {
  id: number;
  url: string;
  mime_type: string;
  size_bytes: number;
}

export interface StreamTicket {
  ticket: string;
  expires_in: number;
}

export interface UnreadCount {
  count: number;
}

export interface AdminStats {
  users_total: number;
  posts_today: number;
  open_reports: number;
  pending_repairs: number;
}

/* ---------- request bodies ---------- */

export interface RegisterBody {
  email: string;
  password: string;
  display_name: string;
  faculty_id: number;
  program_id: number;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface EventInput {
  starts_at: string;
  ends_at: string;
  venue?: string | null;
  priority_level?: EventPriority;
}

export interface CreatePostBody {
  type: "general" | "announcement" | "event";
  /** announcements only */
  related_repair_id?: number | null;
  title: string;
  content: string;
  /** optional: the server derives the category from the type */
  category_id?: number;
  priority: Priority;
  event?: EventInput;
  attachment_ids?: number[];
}

export type UpdatePostBody = Partial<Omit<CreatePostBody, "type">>;

export interface CreateRepairBody {
  title: string;
  content: string;
  location: string;
  latitude?: number;
  longitude?: number;
  /** at least 1 image */
  attachment_ids: number[];
}

export interface UpdateRepairStatusBody {
  status: RepairStatus;
  note?: string;
  attachment_ids?: number[];
}

export interface CreateLostFoundBody {
  title: string;
  content: string;
  location: string;
  status: "lost" | "found";
  occurred_at?: string;
  attachment_ids?: number[];
}

export interface UpdateLostFoundBody {
  status?: LostFoundStatus;
  location?: string;
}

export interface CreateReportBody {
  post_id: number;
  reason: ReportReason;
  detail?: string;
}

export interface UpdateReportBody {
  status: ReportStatus;
  note?: string;
}

/** The role follows the email (numeric student id → student, name → teacher). */
export interface OnboardingBody {
  faculty_id: number;
  program_id: number;
}

/** Admin-created account: no password, the owner signs in with Google using this address. */
export interface AdminCreateUserBody {
  email: string;
  display_name: string;
  role: Role;
  faculty_id?: number | null;
  program_id?: number | null;
  technician_specialty?: string | null;
  technician_zone?: string | null;
}

export interface AdminUpdateUserBody {
  role?: Role;
  faculty_id?: number | null;
  program_id?: number | null;
  is_active?: boolean;
  /** admin verifies (or un-verifies) the email by hand */
  is_verified?: boolean;
  lift_suspension?: true;
  technician_specialty?: string | null;
  technician_zone?: string | null;
}

/* ---------- SSE payloads ---------- */

export interface PostCreatedEvent {
  id: number;
  type: PostType;
}

export interface RepairUpdatedEvent {
  id: number;
  status: RepairStatus;
}

/* ---------- admin catalog (faculties / programs) ---------- */

export interface AdminFacultyBody {
  code: string;
  name_th: string;
  name_en?: string | null;
}

export interface AdminFacultyUpdateBody {
  name_th?: string;
  name_en?: string | null;
  is_active?: boolean;
}

export interface AdminProgramBody {
  faculty_id: number;
  code: string;
  name_th: string;
  name_en?: string | null;
}

export interface AdminProgramUpdateBody {
  name_th?: string;
  name_en?: string | null;
  is_active?: boolean;
  faculty_id?: number;
}
