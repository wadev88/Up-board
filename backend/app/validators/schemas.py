"""Request/response schemas — mirror docs/architecture/api-contract.md exactly."""

import re
from datetime import date, datetime
from typing import Annotated, Literal, TypeVar

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.models import (
    EventPriority,
    LostFoundStatus,
    PostType,
    Priority,
    RepairStatus,
    ReportReason,
    ReportStatus,
    RoleName,
)

UP_EMAIL_RE = re.compile(r"^[a-z0-9._%+-]+@up\.ac\.th$")


def _up_email(value: str) -> str:
    email = value.strip().lower()
    if not UP_EMAIL_RE.fullmatch(email):
        raise ValueError("Email must be a University of Phayao address ending with @up.ac.th")
    return email


UpEmail = Annotated[str, StringConstraints(max_length=254), AfterValidator(_up_email)]

ANY_EMAIL_RE = re.compile(r"^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$")


def _plain_email(value: str) -> str:
    email = value.strip().lower()
    if not ANY_EMAIL_RE.fullmatch(email):
        raise ValueError("Enter a valid email address")
    return email


# any valid address: the domain rule (@up.ac.th except student_club) lives in the admin service
PlainEmail = Annotated[str, StringConstraints(max_length=254), AfterValidator(_plain_email)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=150)]
Content = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]
Location = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)]
DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=60)]
Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
AttachmentIds = Annotated[list[int], Field(max_length=4)]

T = TypeVar("T")


class Schema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Page[T](Schema):
    items: list[T]
    total: int
    page: int
    page_size: int


class Message(Schema):
    message: str


# ---------- reference data ----------
class ProgramOut(Schema):
    id: int
    faculty_id: int
    code: str
    name_th: str
    name_en: str | None
    is_active: bool


class FacultyOut(Schema):
    """`programs` is filled by GET /faculties and the admin catalog only; everywhere a faculty is
    nested (user, post) it is an empty list."""

    id: int
    code: str
    name_th: str
    name_en: str | None
    is_active: bool
    admin_only: bool = False
    programs: list[ProgramOut] = []


class CategoryOut(Schema):
    id: int
    slug: str
    name_th: str
    allowed_type: PostType | None


# ---------- users / auth ----------
class UserBrief(Schema):
    id: int
    display_name: str
    role: RoleName


class ContactsOut(Schema):
    facebook: str | None = None
    instagram: str | None = None
    line: str | None = None


class SuspensionOut(Schema):
    starts_at: datetime
    last_day: date  # last suspended Asia/Bangkok calendar day
    ends_at: datetime  # restore time (00:00 Bangkok of the following day)


class UserPublicOut(Schema):
    """What any signed-in user may see about another user; only non-empty contacts are set."""

    id: int
    display_name: str
    role: RoleName
    faculty: FacultyOut | None
    program: ProgramOut | None
    contacts: ContactsOut


class UserOut(Schema):
    id: int
    email: str
    display_name: str
    role: RoleName
    faculty: FacultyOut | None
    program: ProgramOut | None
    contacts: ContactsOut
    is_verified: bool
    is_active: bool
    is_technician: bool
    has_password: bool
    # False until a self-registered account picks its role at first sign-in (onboarding)
    profile_completed: bool
    posting_suspended_until: datetime | None
    suspension: SuspensionOut | None
    created_at: datetime


class RegisterIn(Input):
    email: UpEmail
    password: Annotated[str, StringConstraints(min_length=8, max_length=128)]
    display_name: DisplayName
    faculty_id: int
    program_id: int

    @field_validator("password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        if not (re.search(r"[A-Za-z]", value) and re.search(r"\d", value)):
            raise ValueError("Password must contain at least one letter and one number")
        return value


class LoginIn(Input):
    email: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=254)]
    password: Annotated[str, StringConstraints(max_length=128)]


class SupabaseExchangeIn(Input):
    """Supabase Auth access token obtained by the browser after Google sign-in (ADR-003)."""

    access_token: Annotated[str, StringConstraints(min_length=20, max_length=8192)]
    # registration password, only for a still-unverified self-registered account
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)] | None = None


class AuthConfigOut(Schema):
    google_enabled: bool
    password_signup_enabled: bool
    allowed_email_domain: str


class TokenOut(Schema):
    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105 - OAuth2 token type, not a secret
    expires_in: int
    user: UserOut


class OnboardingIn(Input):
    """First sign-in of a self-registered account. The role is NOT chosen here: it follows the
    email (student ids start with a digit, staff addresses with a letter); building staff,
    technicians, clubs and admins are created by an admin instead. Faculty and programme are both
    required, and the programme must belong to the faculty."""

    faculty_id: int
    program_id: int


ContactValue = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None


class ContactsIn(Input):
    """Partial update: omitted = unchanged, null or an empty string = clear."""

    facebook: ContactValue = None
    instagram: ContactValue = None
    line: ContactValue = None


class ProfileUpdateIn(Input):
    """Self-service: name, faculty + programme and contacts. Changing the faculty requires a
    programme of the new faculty."""

    display_name: DisplayName | None = None
    faculty_id: int | None = None
    program_id: int | None = None
    contacts: ContactsIn | None = None


# ---------- posts ----------
class AttachmentOut(Schema):
    id: int
    url: str
    mime_type: str
    size_bytes: int
    kind: Literal["image", "repair_after"]


class EventIn(Input):
    """ADR-003 / BR-01: both times are required, timezone-aware, and ends_at > starts_at."""

    starts_at: datetime
    ends_at: datetime
    venue: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None
    # omitted → the highest level the author's role may use
    priority_level: EventPriority | None = None

    @model_validator(mode="after")
    def _check(self) -> "EventIn":
        if self.starts_at.tzinfo is None or self.ends_at.tzinfo is None:
            raise ValueError("starts_at and ends_at must include a timezone")
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class EventOut(Schema):
    starts_at: datetime
    ends_at: datetime | None
    venue: str | None
    priority_level: EventPriority


class RepairHistoryOut(Schema):
    from_status: RepairStatus | None
    to_status: RepairStatus
    changed_at: datetime
    note: str | None
    changed_by: UserBrief | None


class TechnicianBrief(Schema):
    id: int
    display_name: str


class RepairOut(Schema):
    location: str
    status: RepairStatus
    is_assigned: bool
    updated_at: datetime
    latitude: float | None
    longitude: float | None
    technician: TechnicianBrief | None
    history: list[RepairHistoryOut]


class LostFoundOut(Schema):
    location: str
    status: LostFoundStatus
    occurred_at: datetime | None
    updated_at: datetime


class PostPermissions(Schema):
    can_edit: bool
    can_delete: bool
    can_pin: bool
    can_update_status: bool
    can_assign: bool
    can_set_priority: bool
    can_report: bool


class SpamNotice(Schema):
    action: Literal["warning", "suspension"]
    count: int
    suspended_until: datetime | None


class PostOut(Schema):
    id: int
    type: PostType
    title: str
    content: str
    priority: Priority
    status: Literal["active", "removed"]
    category: CategoryOut
    faculty: FacultyOut | None
    author: UserBrief | None
    created_at: datetime
    updated_at: datetime
    pinned_at: datetime | None
    pinned_until: datetime | None
    is_pinned: bool
    dashboard_expires_at: datetime
    # computed on the server from the lifecycle rules (ADR-003)
    lifecycle: Literal["active", "expired", "resolved", "archived", "removed"]
    attachments: list[AttachmentOut]
    event: EventOut | None
    repair: RepairOut | None
    lost_found: LostFoundOut | None
    permissions: PostPermissions
    # announcements only: the repair post this announcement is about
    related_repair_id: int | None = None
    # only filled in the response of a create (general posts), so the UI can toast
    spam_notice: SpamNotice | None = None


class PostCreateIn(Input):
    type: Literal["general", "announcement", "event"]
    title: Title
    content: Content
    # optional: derived from the type (general / announcement / activities); kept for old clients
    category_id: int | None = None
    priority: Priority = Priority.normal
    event: EventIn | None = None
    # announcements only: link the announcement to a repair request (post id of a repair)
    related_repair_id: int | None = None
    attachment_ids: AttachmentIds = []

    @model_validator(mode="after")
    def _event_rules(self) -> "PostCreateIn":
        if self.related_repair_id is not None and self.type != "announcement":
            raise ValueError("related_repair_id is only allowed for announcements")
        if self.type == "event" and self.event is None:
            raise ValueError("event (starts_at, ends_at) is required for events")
        if self.type != "event" and self.event is not None:
            raise ValueError("event details are only allowed for events")
        return self


class PostUpdateIn(Input):
    title: Title | None = None
    content: Content | None = None
    category_id: int | None = None
    priority: Priority | None = None
    event: EventIn | None = None
    attachment_ids: AttachmentIds | None = None


class PinIn(Input):
    """Pin duration in hours; omitted body = 48."""

    hours: Literal[6, 12, 24, 48, 72] = 48


class DashboardOut(Schema):
    pinned: list[PostOut]
    upcoming: list[PostOut]
    recent: list[PostOut]
    repairs: list[PostOut]  # unfinished repairs, priority then newest
    lost_found: list[PostOut]  # not returned, within 7 days, newest first
    generated_at: datetime


# ---------- repairs ----------
class RepairCreateIn(Input):
    title: Title
    content: Content
    location: Location
    latitude: Annotated[float, Field(ge=-90, le=90)] | None = None
    longitude: Annotated[float, Field(ge=-180, le=180)] | None = None
    # no priority: building staff set the urgency afterwards (PATCH /repairs/{id}/priority)
    # at least one photo is required
    attachment_ids: Annotated[list[int], Field(min_length=1, max_length=4)]


class RepairStatusIn(Input):
    status: RepairStatus
    note: Note | None = None
    attachment_ids: AttachmentIds = []


class AssignIn(Input):
    technician_id: int


class RepairPriorityIn(Input):
    priority: Priority


class TechnicianOut(Schema):
    id: int
    user: UserBrief
    specialty: str | None
    zone: str | None
    is_available: bool


# ---------- lost & found ----------
class LostFoundCreateIn(Input):
    title: Title
    content: Content
    location: Location
    status: Literal["lost", "found"]
    occurred_at: datetime | None = None
    attachment_ids: AttachmentIds = []


class LostFoundUpdateIn(Input):
    status: LostFoundStatus | None = None
    location: Location | None = None


# ---------- uploads ----------
class UploadOut(Schema):
    id: int
    url: str
    mime_type: str
    size_bytes: int


# ---------- reports ----------
class ReportCreateIn(Input):
    post_id: int
    reason: ReportReason
    detail: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None


class ReportUpdateIn(Input):
    status: ReportStatus
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None


class ReportPostBrief(Schema):
    id: int
    title: str
    type: PostType
    status: Literal["active", "removed"]


class ReportActionOut(Schema):
    id: int
    admin: UserBrief
    from_status: ReportStatus
    to_status: ReportStatus
    note: str | None
    created_at: datetime


class ReportOut(Schema):
    id: int
    reason: ReportReason
    detail: str | None
    status: ReportStatus
    created_at: datetime
    post: ReportPostBrief
    reporter: UserBrief
    actions: list[ReportActionOut]


# ---------- notifications ----------
class NotificationOut(Schema):
    id: int
    type: str
    title: str
    body: str | None
    link: str | None
    read_at: datetime | None
    created_at: datetime


class CountOut(Schema):
    count: int


class StreamTicketOut(Schema):
    ticket: str
    expires_in: int


# ---------- admin ----------
class AdminStatsOut(Schema):
    users_total: int
    posts_today: int
    open_reports: int
    pending_repairs: int


class AdminUserCreateIn(Input):
    """Admin-created account (building staff, technicians, clubs, admins, ...). It has no password:
    the owner signs in with Google using this exact address. The address must be @up.ac.th,
    except for `student_club` accounts, which may use any valid email (checked in the service)."""

    email: PlainEmail
    display_name: DisplayName
    role: RoleName
    faculty_id: int | None = None
    program_id: int | None = None
    technician_specialty: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None
    ) = None
    technician_zone: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None
    ) = None


class AdminUserUpdateIn(Input):
    role: RoleName | None = None
    # omitted -> unchanged; explicit null -> clear
    faculty_id: int | None = None
    program_id: int | None = None
    is_active: bool | None = None
    is_verified: bool | None = None  # admin can verify an email manually (support)
    lift_suspension: Literal[True] | None = None
    technician_specialty: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None
    ) = None
    technician_zone: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None
    ) = None


# ---------- admin catalog (faculties / programmes) ----------
CatalogCode = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
CatalogName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)]
OptionalName = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None


class FacultyCreateIn(Input):
    code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=16)]
    name_th: CatalogName
    name_en: OptionalName = None
    is_active: bool = True


class FacultyUpdateIn(Input):
    name_th: CatalogName | None = None
    name_en: OptionalName = None
    is_active: bool | None = None


class ProgramCreateIn(Input):
    faculty_id: int
    code: CatalogCode
    name_th: CatalogName
    name_en: OptionalName = None
    is_active: bool = True


class ProgramUpdateIn(Input):
    name_th: CatalogName | None = None
    name_en: OptionalName = None
    is_active: bool | None = None
    faculty_id: int | None = None
