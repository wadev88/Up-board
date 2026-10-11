import enum


class RoleName(enum.StrEnum):
    """One role per account. Students and teachers pick their role once at sign-up
    (onboarding); every other role is assigned by an admin."""

    student = "student"
    teacher = "teacher"
    technician = "technician"
    building_staff = "building_staff"
    student_club = "student_club"  # club / student-union accounts
    admin = "admin"


class PostType(enum.StrEnum):
    general = "general"
    announcement = "announcement"
    event = "event"
    repair = "repair"
    lost_found = "lost_found"


class PostStatus(enum.StrEnum):
    active = "active"
    removed = "removed"


class Priority(enum.StrEnum):
    low = "low"
    normal = "normal"
    high = "high"
    urgent = "urgent"


class EventPriority(enum.StrEnum):
    """Declaration order = PostgreSQL enum sort order: ORDER BY ... DESC puts university first."""

    department = "department"
    faculty = "faculty"
    university = "university"


class RepairStatus(enum.StrEnum):
    open = "open"  # รับเรื่อง
    assigned = "assigned"  # มอบหมายช่าง
    in_progress = "in_progress"  # กำลังดำเนินการ
    pending_review = "pending_review"  # รอกองอาคารตรวจสอบ
    closed = "closed"  # ปิดงาน (terminal)
    rejected = "rejected"  # ปฏิเสธคำร้อง (terminal)


ACTIVE_REPAIR_STATUSES = (
    RepairStatus.open,
    RepairStatus.assigned,
    RepairStatus.in_progress,
    RepairStatus.pending_review,
)
TERMINAL_REPAIR_STATUSES = (RepairStatus.closed, RepairStatus.rejected)


class LostFoundStatus(enum.StrEnum):
    lost = "lost"
    found = "found"
    returned = "returned"


class RemovalReason(enum.StrEnum):
    author = "author"
    admin = "admin"
    moderation = "moderation"
    lost_found_expired = "lost_found_expired"  # 7-day archive job; stays in the owner's history
    account_deleted = "account_deleted"  # the author's account was deleted: gone for everyone


class ViolationAction(enum.StrEnum):
    warning = "warning"
    suspension = "suspension"


class ReportStatus(enum.StrEnum):
    reported = "reported"
    under_review = "under_review"
    upheld = "upheld"
    content_removed = "content_removed"
    dismissed = "dismissed"


class ReportReason(enum.StrEnum):
    profanity = "profanity"
    spam = "spam"
    harassment = "harassment"
    misinformation = "misinformation"
    other = "other"


class AttachmentKind(enum.StrEnum):
    image = "image"
    repair_after = "repair_after"


class PermissionScope(enum.StrEnum):
    own = "own"
    faculty = "faculty"
    any = "any"
