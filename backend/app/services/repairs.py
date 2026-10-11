"""Repair requests (ADR-003 / BR-04): public visibility with private fields, a strict state
machine, assignment by building staff, status history and notifications.

    open ──assign──▶ assigned ──▶ in_progress ──▶ pending_review ──▶ closed
                                       ▲               │
                                       └── send back ──┘          (any active) ──▶ rejected

* `building_staff` assigns / reassigns technicians (open → assigned happens ONLY by assigning;
  reassigning is possible while open / assigned / in_progress, and puts an in-progress job back to
  `assigned`), closes a job that is `pending_review` or sends it back to `in_progress` (a note is
  required), and may reject a request (a reason of at least 3 characters is required) from any
  active status. `closed` and `rejected` are terminal.
* `technician`: only jobs assigned to them: assigned → in_progress → pending_review, with a note
  and `repair_after` photos; never assigns, closes or rejects and never touches the original
  post (title, content, location).
* `admin`: view-only on repair status (can still set the urgency and moderate content).
Every change locks the repair row (SELECT … FOR UPDATE) so concurrent updates are applied one
after the other and the second one is validated against the new status (409 otherwise); the
actor's permission is re-checked after the lock.
"""

from datetime import timedelta
from decimal import Decimal
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core import clock
from app.core.errors import AppError, forbidden, not_found
from app.core.permissions import can, is_assigned_technician
from app.models import (
    ACTIVE_REPAIR_STATUSES,
    TERMINAL_REPAIR_STATUSES,
    AttachmentKind,
    Post,
    PostStatus,
    PostType,
    Priority,
    RepairRequest,
    RepairStatus,
    RepairStatusHistory,
    Role,
    RoleName,
    Technician,
    User,
)
from app.services import spam
from app.services.activity import audit, notify, publish_after_commit
from app.services.posts import (
    attach_files,
    category_by_slug,
    clear_related_pins,
    ensure_clean,
    get_visible_post,
)
from app.validators.schemas import RepairCreateIn, RepairStatusIn

S = RepairStatus
Actor = Literal["manager", "technician"]
MIN_REASON_LENGTH = 3

# (current, target) -> who may perform it. Anything else is an invalid transition (409).
TRANSITIONS: dict[tuple[RepairStatus, RepairStatus], Actor] = {
    (S.assigned, S.in_progress): "technician",
    (S.in_progress, S.pending_review): "technician",
    (S.pending_review, S.closed): "manager",
    (S.pending_review, S.in_progress): "manager",  # send back (note required)
    **{(current, S.rejected): "manager" for current in ACTIVE_REPAIR_STATUSES},
}
NOTE_REQUIRED = {(S.pending_review, S.in_progress)} | {
    (current, S.rejected) for current in ACTIVE_REPAIR_STATUSES
}
# Same wording as the frontend REPAIR_STATUS_LABELS (frontend/lib/constants.ts).
STATUS_LABELS_TH = {
    S.open: "รับเรื่อง",
    S.assigned: "มอบหมายช่าง",
    S.in_progress: "กำลังดำเนินการ",
    S.pending_review: "รอกองอาคารตรวจสอบ",
    S.closed: "ปิดงาน",
    S.rejected: "ปฏิเสธคำร้อง",
}


def transition_actor(current: RepairStatus, target: RepairStatus) -> Actor | None:
    """Who may move a repair from `current` to `target` via PATCH status (None: nobody)."""
    return TRANSITIONS.get((current, target))


def transition_allowed(current: RepairStatus, target: RepairStatus, *, actor: Actor) -> bool:
    return transition_actor(current, target) == actor


def note_required(current: RepairStatus, target: RepairStatus) -> bool:
    return (current, target) in NOTE_REQUIRED


def _building_staff_ids(db: Session) -> set[int]:
    """New repairs go to the building staff who dispatch them (ADR-003)."""
    return set(
        db.scalars(
            select(User.id)
            .join(Role, Role.id == User.role_id)
            .where(Role.name == RoleName.building_staff, User.is_active)
        ).all()
    )


def _lock_repair(db: Session, post_id: int) -> None:
    locked = db.scalar(
        select(RepairRequest.post_id).where(RepairRequest.post_id == post_id).with_for_update()
    )
    if locked is None:
        raise not_found("Repair")


def _ensure_cooldown(db: Session, user: User, now) -> None:
    """Under the user's row lock (taken by spam.check_before_create): at most one repair request
    every `repair_cooldown_seconds` (default 120)."""
    seconds = get_settings().repair_cooldown_seconds
    if seconds <= 0:
        return
    last = db.scalar(
        select(func.max(Post.created_at)).where(
            Post.author_id == user.id, Post.type == PostType.repair
        )
    )
    if last is not None and now < last + timedelta(seconds=seconds):
        retry_at = last + timedelta(seconds=seconds)
        raise AppError(
            429,
            "REPAIR_TOO_FAST",
            "Please wait before sending another repair request",
            [{"field": "retry_at", "message": retry_at.isoformat()}],
        )


def create_repair(db: Session, user: User, data: RepairCreateIn) -> Post:
    ensure_clean(title=data.title, content=data.content, location=data.location)
    now = spam.check_before_create(db, user, PostType.repair)  # suspension applies; locks the user
    _ensure_cooldown(db, user, now)
    post = Post(
        type=PostType.repair,
        title=data.title,
        content=data.content,
        category_id=category_by_slug(db, "repair").id,
        author_id=user.id,
        faculty_id=user.faculty_id,
        priority=Priority.normal,
        status=PostStatus.active,
        created_at=now,
    )
    db.add(post)
    db.flush()
    post.repair = RepairRequest(
        post_id=post.id,
        location=data.location,
        latitude=Decimal(str(data.latitude)) if data.latitude is not None else None,
        longitude=Decimal(str(data.longitude)) if data.longitude is not None else None,
        status=RepairStatus.open,
    )
    db.flush()
    db.add(
        RepairStatusHistory(
            repair_id=post.id,
            from_status=None,
            to_status=RepairStatus.open,
            changed_by=user.id,
        )
    )
    attach_files(db, user, post, data.attachment_ids)
    notify(
        db,
        _building_staff_ids(db),
        "repair.created",
        f"แจ้งซ่อมใหม่: {post.title}",
        data.location,
        f"/repairs/{post.id}",
        exclude=user.id,
    )
    notify(
        db,
        [user.id],
        "repair.received",
        f"รับเรื่องแจ้งซ่อมแล้ว (#{post.id})",
        post.title,
        f"/repairs/{post.id}",
    )
    publish_after_commit(db, "post.created", {"id": post.id, "type": post.type.value})
    db.commit()
    db.refresh(post)
    return post


def _reason_error(field: str = "note") -> AppError:
    return AppError(
        422,
        "VALIDATION_ERROR",
        f"A note of at least {MIN_REASON_LENGTH} characters is required",
        [{"field": field, "message": f"min {MIN_REASON_LENGTH} characters"}],
    )


def update_status(db: Session, user: User, post_id: int, data: RepairStatusIn) -> Post:
    _lock_repair(db, post_id)
    post = get_visible_post(db, post_id, PostType.repair)
    db.refresh(post.repair)  # read the status AFTER acquiring the lock
    is_manager = can(user, "repair:update_status", post)
    is_technician = is_assigned_technician(user, post)
    if not (is_manager or is_technician):
        raise forbidden("You cannot update this repair")
    ensure_clean(note=data.note)
    repair = post.repair
    current, target = repair.status, data.status
    required = transition_actor(current, target)
    if required is None:
        raise AppError(
            409,
            "INVALID_TRANSITION",
            f"Cannot change status from {current.value} to {target.value}",
        )
    if (required == "manager" and not is_manager) or (
        required == "technician" and not is_technician
    ):
        who = "building staff" if required == "manager" else "the assigned technician"
        raise forbidden(f"Only {who} can do this")
    note = (data.note or "").strip() or None
    if note_required(current, target) and (note is None or len(note) < MIN_REASON_LENGTH):
        raise _reason_error()
    repair.status = target
    db.add(
        RepairStatusHistory(
            repair_id=post.id,
            from_status=current,
            to_status=target,
            changed_by=user.id,
            note=note,
        )
    )
    if data.attachment_ids:
        attach_files(db, user, post, data.attachment_ids, kind=AttachmentKind.repair_after)
    audit(
        db,
        user,
        "repair.status",
        "post",
        post.id,
        {"from": current.value, "to": target.value},
    )
    link = f"/repairs/{post.id}"
    if target is S.rejected:
        notify(
            db,
            [post.author_id],
            "repair.rejected",
            f"คำร้องแจ้งซ่อม #{post.id} ถูกปฏิเสธ",
            f"{post.title}\nเหตุผล: {note}",
            link,
            exclude=user.id,
        )
    else:
        notify(
            db,
            [post.author_id],
            "repair.status",
            f"งานซ่อม #{post.id}: {STATUS_LABELS_TH[target]}",
            post.title if not note else f"{post.title}\nหมายเหตุ: {note}",
            link,
            exclude=user.id,
        )
    if target is S.pending_review:  # building staff have a job to review
        notify(
            db,
            _building_staff_ids(db),
            "repair.review",
            f"งานซ่อม #{post.id} รอตรวจสอบ",
            post.title,
            link,
            exclude=user.id,
        )
    if target in TERMINAL_REPAIR_STATUSES:
        clear_related_pins(db, post.id)  # announcements pinned for this repair lose their pin
    publish_after_commit(db, "repair.updated", {"id": post.id, "status": target.value})
    db.commit()
    db.refresh(post)
    return post


def set_priority(db: Session, user: User, post_id: int, priority: Priority) -> Post:
    """Building staff / admin triage: the reporter's request always starts as 'normal'."""
    _lock_repair(db, post_id)
    post = get_visible_post(db, post_id, PostType.repair)
    if not can(user, "repair:set_priority", post):
        raise forbidden("Only building staff can set the urgency of a repair")
    previous = post.priority
    if previous is not priority:
        post.priority = priority
        post.updated_at = clock.utcnow()
        audit(
            db,
            user,
            "repair.priority",
            "post",
            post.id,
            {"from": previous.value, "to": priority.value},
        )
        publish_after_commit(
            db, "repair.updated", {"id": post.id, "status": post.repair.status.value}
        )
    db.commit()
    db.refresh(post)
    return post


REASSIGNABLE = (S.open, S.assigned, S.in_progress)


def assign(db: Session, user: User, post_id: int, technician_id: int) -> Post:
    _lock_repair(db, post_id)
    post = get_visible_post(db, post_id, PostType.repair)
    db.refresh(post.repair)
    if not can(user, "repair:assign", post):
        raise forbidden("Only building staff can assign repairs")
    technician = db.get(Technician, technician_id)
    if (
        technician is None
        or not technician.is_available
        or not technician.user.is_active
        or technician.user.role_name is not RoleName.technician
    ):
        raise not_found("Technician")
    repair = post.repair
    if repair.status not in REASSIGNABLE:
        raise AppError(
            409,
            "INVALID_TRANSITION",
            f"A repair that is {repair.status.value} cannot be (re)assigned",
        )
    previous = repair.assigned_technician_id
    if previous == technician.id:
        raise AppError(409, "CONFLICT", "This technician is already assigned")
    repair.assigned_technician_id = technician.id
    if repair.status is not RepairStatus.assigned:
        db.add(
            RepairStatusHistory(
                repair_id=post.id,
                from_status=repair.status,
                to_status=RepairStatus.assigned,
                changed_by=user.id,
                note="มอบหมายช่างแล้ว" if previous is None else "เปลี่ยนช่างผู้รับผิดชอบ",
            )
        )
        repair.status = RepairStatus.assigned
    elif previous is not None:
        db.add(
            RepairStatusHistory(
                repair_id=post.id,
                from_status=RepairStatus.assigned,
                to_status=RepairStatus.assigned,
                changed_by=user.id,
                note="เปลี่ยนช่างผู้รับผิดชอบ",
            )
        )
    audit(
        db,
        user,
        "repair.assign" if previous is None else "repair.reassign",
        "post",
        post.id,
        {"from": previous, "to": technician.id},
    )
    notify(
        db,
        [technician.user_id],
        "repair.assigned",
        f"คุณได้รับมอบหมายงานซ่อม #{post.id}",
        repair.location,
        f"/repairs/{post.id}",
        exclude=user.id,
    )
    if previous is not None:
        old = db.get(Technician, previous)
        if old is not None:
            notify(
                db,
                [old.user_id],
                "repair.unassigned",
                f"งานซ่อม #{post.id} ถูกโอนให้ช่างคนอื่น",
                repair.location,
                f"/repairs/{post.id}",
                exclude=user.id,
            )
    notify(
        db,
        [post.author_id],
        "repair.status",
        f"งานซ่อม #{post.id}: {STATUS_LABELS_TH[RepairStatus.assigned]}",
        post.title,
        f"/repairs/{post.id}",
        exclude=user.id,
    )
    publish_after_commit(db, "repair.updated", {"id": post.id, "status": repair.status.value})
    db.commit()
    db.expire(post)
    return get_visible_post(db, post_id, PostType.repair)
