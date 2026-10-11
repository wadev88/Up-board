"""RBAC policy (ADR-003, replacing the 3-role matrix of ADR-002). This matrix is the runtime
source of truth and is also seeded into the roles / permissions / role_permissions tables so the
database documents the same policy. The frontend only uses the computed `permissions` object for
UX; the backend always re-checks."""

from app.models import EventPriority, Post, PostStatus, PostType, User
from app.models.enums import PermissionScope as S
from app.models.enums import RoleName as R

PERMISSION_DESCRIPTIONS: dict[str, str] = {
    "post:create": "Create general posts",
    "post:announce": "Create announcements (building staff, admin)",
    "post:create_event": "Create events (student clubs, admin)",
    "post:set_priority": "Choose the priority of posts (building staff, admin; otherwise 'normal')",
    "post:update": "Edit posts",
    "post:delete": "Soft-delete posts (repair requests: admin only)",
    "post:pin": "Pin events (clubs: own) and announcements (building staff: own); admin: any",
    "post:priority_urgent": "Use the 'urgent' priority",
    "repair:create": "Create repair requests",
    "repair:read_private": "See reporter, GPS, technician and internal notes of repairs",
    "repair:update_status": "Review, close, send back or reject repairs (building staff)",
    "repair:assign": "Assign / reassign technicians to repairs",
    "repair:set_priority": "Set the urgency of repair requests (building staff, admin)",
    "lost_found:create": "Create lost & found posts",
    "lost_found:update_status": "Change lost & found status",
    "report:create": "Report a post to moderators",
    "report:manage": "Review reports and remove content",
    "user:manage": "Manage users, roles, faculties and programmes",
    "technician:list": "List technicians",
}

# Everyone may do these on their own content (repair posts: edit but never delete, see below).
_BASE: dict[str, S] = {
    "post:create": S.any,  # general posts
    "post:update": S.own,
    "post:delete": S.own,
    "repair:create": S.any,
    "repair:read_private": S.own,
    "lost_found:create": S.any,
    "lost_found:update_status": S.own,
    "report:create": S.any,
}

PERMISSION_MATRIX: dict[R, dict[str, S]] = {
    R.student: {**_BASE},
    R.teacher: {**_BASE},
    # technicians update the status of jobs ASSIGNED to them (is_assigned_technician), never assign
    R.technician: {**_BASE},
    R.building_staff: {
        **_BASE,
        "post:announce": S.any,
        "post:set_priority": S.any,
        "post:priority_urgent": S.any,
        "post:pin": S.own,
        "repair:read_private": S.any,
        "repair:update_status": S.any,
        "repair:assign": S.any,
        "repair:set_priority": S.any,
        "technician:list": S.any,
    },
    # student_club = every club-like account (สโมสร / ชมรม / สารวัตร / องค์การ / สภา / เวียง)
    R.student_club: {**_BASE, "post:create_event": S.any, "post:pin": S.own},
    # admin: moderation + users; repairs are view-only (no update_status / assign)
    R.admin: {
        **_BASE,
        "post:announce": S.any,
        "post:create_event": S.any,
        "post:set_priority": S.any,
        "post:priority_urgent": S.any,
        "post:pin": S.any,
        "post:update": S.any,
        "post:delete": S.any,
        "repair:read_private": S.any,
        "repair:set_priority": S.any,
        "lost_found:update_status": S.any,
        "report:manage": S.any,
        "user:manage": S.any,
        "technician:list": S.any,
    },
}

ROLE_WEIGHTS: dict[R, int] = {
    R.student: 0,
    R.technician: 0,
    R.teacher: 5,
    R.student_club: 5,
    R.building_staff: 10,
    R.admin: 15,
}

# The highest event priority each role may use (University > Faculty > Department);
# everybody else (student_club) is fixed at department level
EVENT_PRIORITY_CAP: dict[R, EventPriority] = {
    R.admin: EventPriority.university,
    R.building_staff: EventPriority.university,
}
EVENT_PRIORITY_RANK = {p: i for i, p in enumerate(EventPriority)}

# Roles that must belong to a faculty
FACULTY_REQUIRED_ROLES = {R.teacher}
# Roles a self-registered account may pick during onboarding; the rest are created by admins
SELF_SERVICE_ROLES = {R.student, R.teacher}

# Only events and announcements can be pinned (general / repair / lost_found never)
PINNABLE_TYPES = {PostType.announcement, PostType.event}
PIN_ROLES: dict[PostType, R] = {
    PostType.event: R.student_club,
    PostType.announcement: R.building_staff,
}

CREATE_PERMISSION: dict[PostType, str] = {
    PostType.general: "post:create",
    PostType.announcement: "post:announce",
    PostType.event: "post:create_event",
    PostType.repair: "repair:create",
    PostType.lost_found: "lost_found:create",
}


def max_event_priority(user: User) -> EventPriority:
    return EVENT_PRIORITY_CAP.get(user.role_name, EventPriority.department)


def event_priority_allowed(user: User, priority: EventPriority) -> bool:
    return EVENT_PRIORITY_RANK[priority] <= EVENT_PRIORITY_RANK[max_event_priority(user)]


def scope_of(user: User, permission: str) -> S | None:
    # accounts that have not finished onboarding can read but not act
    if user.profile_completed_at is None:
        return None
    return PERMISSION_MATRIX[user.role_name].get(permission)


def can_create(user: User, post_type: PostType) -> bool:
    return has_permission(user, CREATE_PERMISSION[post_type])


def has_permission(user: User, permission: str) -> bool:
    return scope_of(user, permission) is not None


def is_assigned_technician(user: User, post: Post) -> bool:
    repair = post.repair
    return bool(
        user.role_name is R.technician
        and repair is not None
        and repair.technician is not None
        and repair.technician.user_id == user.id
    )


def can(user: User, permission: str, post: Post | None = None) -> bool:
    """Check a permission, applying own/faculty scope against the target post."""
    scope = scope_of(user, permission)
    if scope is None:
        return False
    if scope is S.any or post is None:
        return scope is S.any
    is_owner = post.author_id == user.id
    if scope is S.own:
        return is_owner
    # faculty scope always includes the user's own posts
    return is_owner or (post.faculty_id is not None and post.faculty_id == user.faculty_id)


def can_read_repair_private(user: User, post: Post) -> bool:
    return can(user, "repair:read_private", post) or is_assigned_technician(user, post)


def can_update_repair_status(user: User, post: Post) -> bool:
    return can(user, "repair:update_status", post) or is_assigned_technician(user, post)


def can_pin(user: User, post: Post) -> bool:
    """Events: their author when a student_club (or admin, any). Announcements: their author when
    building staff (or admin, any). Nothing else is pinnable."""
    if post.type not in PINNABLE_TYPES or not can(user, "post:pin", post):
        return False
    return user.role_name is R.admin or user.role_name is PIN_ROLES[post.type]


def can_delete_post(user: User, post: Post) -> bool:
    """Repair requests are a public record: the owner may edit but not delete them; only an admin
    (soft delete) can remove one."""
    if post.type is PostType.repair:
        return scope_of(user, "post:delete") is S.any
    return can(user, "post:delete", post)


def post_permissions(user: User, post: Post) -> dict[str, bool]:
    if post.status is not PostStatus.active:  # archived posts in the owner's history: read-only
        return {
            "can_edit": False,
            "can_delete": False,
            "can_pin": False,
            "can_update_status": False,
            "can_assign": False,
            "can_set_priority": False,
            "can_report": False,
        }
    is_repair = post.type is PostType.repair
    is_lost_found = post.type is PostType.lost_found
    if is_repair:
        can_update_status = can_update_repair_status(user, post)
    elif is_lost_found:
        can_update_status = can(user, "lost_found:update_status", post)
    else:
        can_update_status = False
    return {
        "can_edit": can(user, "post:update", post),
        "can_delete": can_delete_post(user, post),
        "can_pin": can_pin(user, post),
        "can_update_status": can_update_status,
        "can_assign": is_repair and can(user, "repair:assign", post),
        "can_set_priority": is_repair and can(user, "repair:set_priority", post),
        "can_report": post.author_id != user.id and has_permission(user, "report:create"),
    }
