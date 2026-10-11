"""Unit tests for pure business rules: expiration, lifecycle, pin hours, event ordering, repair
state machine, spam helpers, profanity, RBAC matrix and token security. No HTTP / DB involved."""

from datetime import UTC, date, datetime, timedelta

import pytest

from app.core import clock, profanity
from app.core.errors import AppError
from app.core.permissions import (
    PERMISSION_MATRIX,
    can_delete_post,
    can_pin,
    event_priority_allowed,
    max_event_priority,
)
from app.core.security import (
    TokenError,
    create_access_token,
    create_stream_ticket,
    decode_token,
    hash_password,
    verify_password,
)
from app.core.supabase_auth import email_domain_allowed
from app.models import (
    Event,
    EventPriority,
    LostFoundItem,
    LostFoundStatus,
    PermissionScope,
    Post,
    PostStatus,
    PostType,
    RemovalReason,
    RepairRequest,
    Role,
    RoleName,
    User,
)
from app.models import RepairStatus as RS
from app.services import ranking, spam
from app.services.expiration import (
    PIN_HOUR_CHOICES,
    compute_pin,
    dashboard_expires_at,
    event_end,
    feed_expires_at,
    is_event_active,
    is_pinned,
    is_within_dashboard_window,
    post_lifecycle,
)
from app.services.repairs import note_required, transition_actor, transition_allowed

NOW = datetime(2026, 10, 5, 12, 0, tzinfo=UTC)
H = timedelta(hours=1)


# ---------- 24h dashboard window ----------
@pytest.mark.parametrize(
    ("age", "visible"),
    [
        (timedelta(0), True),
        (23 * H + timedelta(minutes=59, seconds=59), True),
        (24 * H, False),
        (24 * H + timedelta(seconds=1), False),
    ],
)
def test_dashboard_window_boundaries(age: timedelta, visible: bool) -> None:
    assert is_within_dashboard_window(NOW - age, NOW) is visible


def test_dashboard_expires_exactly_24h_after_creation() -> None:
    assert dashboard_expires_at(NOW) == NOW + 24 * H


def test_post_from_the_future_is_not_visible() -> None:
    assert is_within_dashboard_window(NOW + H, NOW) is False


# ---------- lifecycle ----------
def make_post(ptype: PostType, created_at: datetime = NOW - H, **kw: object) -> Post:
    post = Post(id=kw.pop("id", 1), type=ptype, created_at=created_at, status=PostStatus.active)
    for key, value in kw.items():
        setattr(post, key, value)
    return post


def make_event(starts: datetime, ends: datetime | None, post_id: int = 1, **kw: object) -> Post:
    post = make_post(PostType.event, id=post_id)
    post.event = Event(
        starts_at=starts,
        ends_at=ends,
        priority_level=kw.get("priority", EventPriority.department),
    )
    return post


def test_event_end_falls_back_to_start_for_legacy_rows() -> None:
    assert event_end(NOW, None) == NOW
    assert event_end(NOW, NOW + H) == NOW + H


def test_event_is_active_until_ends_at_exactly() -> None:
    assert is_event_active(NOW - H, NOW + timedelta(seconds=1), NOW)
    assert not is_event_active(NOW - H, NOW, NOW)  # ended at ends_at
    assert not is_event_active(NOW - H, None, NOW)  # legacy: ended when it started


def test_lifecycle_general_expires_after_24h_announcement_after_7_days() -> None:
    assert post_lifecycle(make_post(PostType.general, NOW - 23 * H), NOW) == "active"
    assert post_lifecycle(make_post(PostType.general, NOW - 24 * H), NOW) == "expired"
    announcement = make_post(PostType.announcement, NOW - 6 * 24 * H)
    assert post_lifecycle(announcement, NOW) == "active"
    announcement.created_at = NOW - 7 * 24 * H
    assert post_lifecycle(announcement, NOW) == "expired"
    # ... unless its related repair is still being worked on
    assert post_lifecycle(announcement, NOW, related_repair_active=True) == "active"
    assert feed_expires_at(make_post(PostType.announcement, NOW)) == NOW + timedelta(days=7)
    assert feed_expires_at(make_post(PostType.lost_found, NOW)) == NOW + timedelta(days=7)
    assert feed_expires_at(make_post(PostType.general, NOW)) == NOW + 24 * H


def test_lifecycle_event_follows_end_not_creation() -> None:
    old_event = make_event(NOW + H, NOW + 2 * H)
    old_event.created_at = NOW - 10 * 24 * H  # created long ago: still active until it ends
    assert post_lifecycle(old_event, NOW) == "active"
    assert post_lifecycle(make_event(NOW - 2 * H, NOW - H), NOW) == "expired"


def test_lifecycle_repair_never_expires_by_time() -> None:
    repair = make_post(PostType.repair, NOW - 400 * 24 * H)
    repair.repair = RepairRequest(status=RS.pending_review, location="x")
    assert post_lifecycle(repair, NOW) == "active"
    for terminal in (RS.closed, RS.rejected):
        repair.repair.status = terminal
        assert post_lifecycle(repair, NOW) == "resolved"


def test_lifecycle_lost_found_7_days_for_lost_and_found_and_returned() -> None:
    item = make_post(PostType.lost_found, NOW - 6 * 24 * H - 23 * H)
    item.lost_found = LostFoundItem(status=LostFoundStatus.lost, location="x")
    assert post_lifecycle(item, NOW) == "active"
    item.created_at = NOW - 7 * 24 * H
    assert post_lifecycle(item, NOW) == "archived"
    item.lost_found.status = LostFoundStatus.found  # found items expire after 7 days too
    assert post_lifecycle(item, NOW) == "archived"
    item.created_at = NOW - H
    assert post_lifecycle(item, NOW) == "active"
    item.lost_found.status = LostFoundStatus.returned  # leaves the list at once
    assert post_lifecycle(item, NOW) == "resolved"


def test_lifecycle_soft_deleted() -> None:
    archived = make_post(
        PostType.lost_found,
        status=PostStatus.removed,
        removal_reason=RemovalReason.lost_found_expired,
    )
    assert post_lifecycle(archived, NOW) == "archived"
    removed = make_post(
        PostType.general, status=PostStatus.removed, removal_reason=RemovalReason.author
    )
    assert post_lifecycle(removed, NOW) == "removed"


# ---------- pins (events + announcements, 6/12/24/48/72 hours) ----------
def test_is_pinned_window_is_half_open_and_open_ended_pins_have_no_end() -> None:
    assert is_pinned(NOW, NOW + H, NOW)
    assert not is_pinned(NOW + timedelta(seconds=1), NOW + H, NOW)  # not started
    assert not is_pinned(NOW - H, NOW, NOW)
    assert not is_pinned(None, None, NOW)
    assert is_pinned(NOW - H, None, NOW)  # announcement pinned for a repair


def test_pin_hour_choices() -> None:
    assert PIN_HOUR_CHOICES == (6, 12, 24, 48, 72)


@pytest.mark.parametrize("hours", PIN_HOUR_CHOICES)
def test_event_pin_lasts_the_chosen_hours(hours: int) -> None:
    window = compute_pin(make_event(NOW + 30 * 24 * H, NOW + 31 * 24 * H), NOW, hours)
    assert window.pinned_at == NOW and window.pinned_until == NOW + hours * H


def test_default_pin_is_48_hours() -> None:
    window = compute_pin(make_event(NOW + 30 * 24 * H, NOW + 31 * 24 * H), NOW)
    assert window.pinned_until == NOW + 48 * H


def test_event_pin_is_capped_by_the_start_time() -> None:
    soon = compute_pin(make_event(NOW + 5 * H, NOW + 6 * H), NOW, 24)
    assert soon.pinned_until == NOW + 5 * H  # min(now + 24 h, start)
    assert compute_pin(make_event(NOW + 12 * H, NOW + 13 * H), NOW, 6).pinned_until == NOW + 6 * H


def test_started_event_cannot_be_pinned() -> None:
    with pytest.raises(AppError) as err:
        compute_pin(make_event(NOW - H, NOW + H), NOW)
    assert err.value.code == "PIN_NOT_ELIGIBLE"


@pytest.mark.parametrize("hours", [0, 1, 5, 36, 73, 96])
def test_pin_hours_outside_the_choices_are_rejected(hours: int) -> None:
    with pytest.raises(AppError) as err:
        compute_pin(make_event(NOW + 9 * 24 * H, NOW + 10 * 24 * H), NOW, hours)
    assert err.value.status_code == 422


def test_announcement_pin_follows_the_hours_rule() -> None:
    window = compute_pin(make_post(PostType.announcement, NOW - H), NOW, 12)
    assert window.pinned_until == NOW + 12 * H
    with pytest.raises(AppError):  # left its 7-day feed window
        compute_pin(make_post(PostType.announcement, NOW - 7 * 24 * H), NOW)


def test_announcement_about_a_repair_is_pinned_without_an_end() -> None:
    notice = make_post(PostType.announcement, NOW - H, related_repair_id=99)
    window = compute_pin(notice, NOW, 6, related_repair_active=True)
    assert window.pinned_at == NOW and window.pinned_until is None
    with pytest.raises(AppError) as err:  # the repair is already over
        compute_pin(notice, NOW, 6, related_repair_active=False)
    assert err.value.code == "PIN_NOT_ELIGIBLE"


@pytest.mark.parametrize("kind", [PostType.general, PostType.repair, PostType.lost_found])
def test_other_post_types_are_not_pinnable(kind: PostType) -> None:
    with pytest.raises(AppError):
        compute_pin(make_post(kind, NOW), NOW)


# ---------- dashboard ordering ----------
def test_events_sort_by_priority_then_start_then_id() -> None:
    dept_early = make_event(NOW + H, NOW + 3 * H, post_id=4, priority=EventPriority.department)
    dept_late = make_event(NOW + 2 * H, NOW + 3 * H, post_id=1, priority=EventPriority.department)
    univ_late = make_event(NOW + 9 * H, NOW + 10 * H, post_id=2, priority=EventPriority.university)
    faculty = make_event(NOW + 2 * H, NOW + 3 * H, post_id=3, priority=EventPriority.faculty)
    univ_tie = make_event(NOW + 9 * H, NOW + 10 * H, post_id=0, priority=EventPriority.university)
    ordered = sorted(
        [dept_early, dept_late, univ_late, faculty, univ_tie], key=ranking.event_sort_key
    )
    # university first (even though it starts last), then faculty, then department by start time
    assert [p.id for p in ordered] == [0, 2, 3, 4, 1]


def pinned(post_id: int, until_hours: int) -> Post:
    return make_post(
        PostType.general, id=post_id, pinned_at=NOW - H, pinned_until=NOW + until_hours * H
    )


def test_pinned_section_never_exceeds_limit_and_rotation_is_stable() -> None:
    posts = [pinned(i, i) for i in range(1, 9)]
    first = ranking.pick_pinned(posts, NOW)
    assert len(first) == 5
    assert len({p.id for p in first}) == 5  # no duplicates
    assert [p.id for p in ranking.pick_pinned(list(reversed(posts)), NOW)] == [p.id for p in first]
    same_slot = NOW + timedelta(minutes=1) if NOW.minute % 10 < 9 else NOW
    assert [p.id for p in ranking.pick_pinned(posts, same_slot)] == [p.id for p in first]
    seen: set[int] = set()
    for slot in range(30):  # over time every pinned post gets shown
        seen |= {p.id for p in ranking.pick_pinned(posts, NOW + slot * timedelta(minutes=10))}
    assert seen == {p.id for p in posts}


def test_few_pins_are_all_shown_soonest_ending_first() -> None:
    ordered = ranking.pick_pinned([pinned(1, 9), pinned(2, 3)], NOW)
    assert [p.id for p in ordered] == [2, 1]
    open_ended = make_post(PostType.announcement, id=3, pinned_at=NOW - H, pinned_until=None)
    assert [p.id for p in ranking.pick_pinned([open_ended, pinned(2, 3)], NOW)] == [2, 3]


# ---------- repair state machine ----------
@pytest.mark.parametrize(
    ("current", "target", "actor", "allowed"),
    [
        (RS.open, RS.assigned, "manager", False),  # only by assigning a technician
        (RS.open, RS.assigned, "technician", False),
        (RS.assigned, RS.in_progress, "technician", True),
        (RS.assigned, RS.in_progress, "manager", False),  # only the assigned technician
        (RS.in_progress, RS.pending_review, "technician", True),
        (RS.in_progress, RS.pending_review, "manager", False),
        (RS.pending_review, RS.closed, "manager", True),
        (RS.pending_review, RS.closed, "technician", False),
        (RS.pending_review, RS.in_progress, "manager", True),  # send back
        (RS.pending_review, RS.in_progress, "technician", False),
        (RS.open, RS.in_progress, "manager", False),  # no skipping
        (RS.assigned, RS.pending_review, "technician", False),
        (RS.in_progress, RS.closed, "manager", False),
        (RS.assigned, RS.open, "manager", False),  # never back to open
        (RS.assigned, RS.assigned, "manager", False),
        (RS.closed, RS.in_progress, "manager", False),  # terminal
        (RS.rejected, RS.in_progress, "manager", False),
        (RS.closed, RS.rejected, "manager", False),
        (RS.rejected, RS.closed, "manager", False),
    ],
)
def test_repair_transitions(current: RS, target: RS, actor: str, allowed: bool) -> None:
    assert transition_allowed(current, target, actor=actor) is allowed


@pytest.mark.parametrize("current", [RS.open, RS.assigned, RS.in_progress, RS.pending_review])
def test_building_staff_alone_can_reject_from_any_active_status(current: RS) -> None:
    assert transition_actor(current, RS.rejected) == "manager"
    assert transition_allowed(current, RS.rejected, actor="technician") is False
    assert note_required(current, RS.rejected)


def test_notes_are_required_for_reject_and_send_back_only() -> None:
    assert note_required(RS.pending_review, RS.in_progress)
    assert not note_required(RS.in_progress, RS.pending_review)
    assert not note_required(RS.pending_review, RS.closed)
    assert not note_required(RS.assigned, RS.in_progress)


# ---------- spam helpers ----------
def test_consecutive_general_counts_the_run_at_the_head() -> None:
    g, e, r = PostType.general, PostType.event, PostType.repair
    assert spam.consecutive_general([]) == 0
    assert spam.consecutive_general([g, g, g]) == 3
    assert spam.consecutive_general([g, g, e, g, g, g]) == 2  # newest first; the event ends it
    assert spam.consecutive_general([r, g, g]) == 0
    assert spam.consecutive_general([PostType.announcement, g]) == 0


def test_bangkok_calendar_helpers() -> None:
    late = datetime(2026, 10, 10, 16, 59, 59, tzinfo=UTC)  # 23:59:59 Bangkok
    assert clock.bangkok_date(late) == date(2026, 10, 10)
    assert clock.bangkok_date(late + timedelta(seconds=1)) == date(2026, 10, 11)
    assert clock.bangkok_midnight(date(2026, 10, 11)) == datetime(2026, 10, 10, 17, 0, tzinfo=UTC)


def test_suspension_calendar_days_start_counting_on_the_first_day() -> None:
    now = datetime(2026, 10, 10, 3, 0, tzinfo=UTC)
    assert spam.suspension_window(now, 1) == (
        date(2026, 10, 10),
        clock.bangkok_midnight(date(2026, 10, 11)),
    )
    last_day, restored = spam.suspension_window(now, 3)
    assert last_day == date(2026, 10, 12)
    assert restored == clock.bangkok_midnight(date(2026, 10, 13))


# ---------- permission flags on a post ----------
def test_pin_flag_follows_the_type_and_role_rules() -> None:
    club, building, admin = (
        user_with(RoleName.student_club),
        user_with(RoleName.building_staff),
        user_with(RoleName.admin),
    )
    for u in (club, building, admin):
        u.profile_completed_at = NOW
    event = make_event(NOW + H, NOW + 2 * H, post_id=5)
    event.author_id = 1
    notice = make_post(PostType.announcement, id=6, author_id=1)
    general = make_post(PostType.general, id=7, author_id=1)
    assert can_pin(club, event) and can_pin(admin, event) and not can_pin(building, event)
    assert can_pin(building, notice) and can_pin(admin, notice) and not can_pin(club, notice)
    assert not any(can_pin(u, general) for u in (club, building, admin))


def test_repair_owner_cannot_delete_but_admin_can() -> None:
    owner, admin = user_with(RoleName.student), user_with(RoleName.admin)
    owner.profile_completed_at = admin.profile_completed_at = NOW
    repair = make_post(PostType.repair, author_id=owner.id)
    assert not can_delete_post(owner, repair)
    assert can_delete_post(admin, repair)
    general = make_post(PostType.general, author_id=owner.id)
    assert can_delete_post(owner, general)


# ---------- profanity ----------
@pytest.mark.parametrize(
    "text",
    [
        "ไอ้ควายเอ้ย",
        "มึงมันเหี้ยยยยย",
        "ค ว ย",
        "what the f.u.c.k",
        "sh1t happens",
        "FUUUUCK",
        "อี​ดอก",  # zero-width space evasion
        "ไอ้สัส",
    ],
)
def test_profanity_detected(text: str) -> None:
    assert not profanity.check(text).is_clean


@pytest.mark.parametrize(
    "text",
    [
        "หีบเพลงนี้สวยมาก",  # หี inside หีบ (box)
        "วันนี้ควายเดินผ่านหน้าตึก",  # ควาย = buffalo
        "ประชุมสัสดีจังหวัด",  # สัสดี = recruitment officer
        "Scunthorpe class assignment",
        "ห้องน้ำชั้น 2 พังครับ",
        "",
    ],
)
def test_profanity_no_false_positive(text: str) -> None:
    assert profanity.check(text).is_clean


def test_check_fields_reports_contract_shape() -> None:
    assert profanity.check_fields(title="ok title", content="ไอ้เหี้ย") == [
        {"field": "content", "terms": 1}
    ]


# ---------- RBAC matrix (ADR-003) ----------
def user_with(role: RoleName) -> User:
    user = User(id=1)
    user.role = Role(name=role)
    return user


def test_exactly_six_roles_exist() -> None:
    assert {r.value for r in RoleName} == {
        "student",
        "teacher",
        "technician",
        "building_staff",
        "student_club",
        "admin",
    }
    assert set(PERMISSION_MATRIX) == set(RoleName)


def grants(role: RoleName) -> set[str]:
    return set(PERMISSION_MATRIX[role])


def test_permission_matrix_create_rights() -> None:
    general = "post:create"
    for role in RoleName:  # everybody: general, repair, lost & found
        assert {general, "repair:create", "lost_found:create"} <= grants(role), role
    events = {r for r in RoleName if "post:create_event" in grants(r)}
    announce = {r for r in RoleName if "post:announce" in grants(r)}
    priority = {r for r in RoleName if "post:set_priority" in grants(r)}
    assert events == {RoleName.student_club, RoleName.admin}
    assert announce == {RoleName.building_staff, RoleName.admin}
    assert priority == {RoleName.building_staff, RoleName.admin}
    urgent = {r for r in RoleName if "post:priority_urgent" in grants(r)}
    assert urgent == {RoleName.building_staff, RoleName.admin}
    # teachers lost every publisher power
    assert grants(RoleName.teacher) == grants(RoleName.student) == grants(RoleName.technician)


def test_only_admin_deletes_or_edits_other_peoples_posts() -> None:
    for role, granted in PERMISSION_MATRIX.items():
        expected = PermissionScope.any if role is RoleName.admin else PermissionScope.own
        assert granted["post:delete"] is expected, role
        assert granted["post:update"] is expected, role


def test_pin_permission_holders() -> None:
    holders = {role for role, granted in PERMISSION_MATRIX.items() if "post:pin" in granted}
    assert holders == {RoleName.student_club, RoleName.building_staff, RoleName.admin}
    assert PERMISSION_MATRIX[RoleName.student_club]["post:pin"] is PermissionScope.own
    assert PERMISSION_MATRIX[RoleName.building_staff]["post:pin"] is PermissionScope.own
    assert PERMISSION_MATRIX[RoleName.admin]["post:pin"] is PermissionScope.any


def test_only_building_staff_assigns_or_manages_repairs() -> None:
    for code in ("repair:assign", "repair:update_status"):
        holders = {role for role, granted in PERMISSION_MATRIX.items() if code in granted}
        assert holders == {RoleName.building_staff}, code


def test_repair_priority_is_for_building_staff_and_admin() -> None:
    holders = {r for r, g in PERMISSION_MATRIX.items() if "repair:set_priority" in g}
    assert holders == {RoleName.building_staff, RoleName.admin}


def test_technician_has_no_assign_and_admin_repairs_are_view_only() -> None:
    assert "repair:assign" not in PERMISSION_MATRIX[RoleName.technician]
    admin = PERMISSION_MATRIX[RoleName.admin]
    assert admin["repair:read_private"] is PermissionScope.any
    assert "repair:update_status" not in admin and "repair:assign" not in admin


def test_lost_found_status_owner_or_admin() -> None:
    for role, granted in PERMISSION_MATRIX.items():
        expected = PermissionScope.any if role is RoleName.admin else PermissionScope.own
        assert granted["lost_found:update_status"] is expected, role


def test_only_admin_manages_users_and_reports() -> None:
    for code in ("user:manage", "report:manage"):
        holders = {role for role, granted in PERMISSION_MATRIX.items() if code in granted}
        assert holders == {RoleName.admin}, code


@pytest.mark.parametrize(
    ("role", "cap"),
    [
        (RoleName.admin, EventPriority.university),
        (RoleName.building_staff, EventPriority.university),
        (RoleName.teacher, EventPriority.department),  # teacher cap removed
        (RoleName.student_club, EventPriority.department),
        (RoleName.student, EventPriority.department),
    ],
)
def test_event_priority_cap_by_role(role: RoleName, cap: EventPriority) -> None:
    user = user_with(role)
    assert max_event_priority(user) is cap
    assert event_priority_allowed(user, cap)
    assert event_priority_allowed(user, EventPriority.department)
    if cap is not EventPriority.university:
        assert not event_priority_allowed(user, EventPriority.university)


# ---------- Google sign-in domain check ----------
@pytest.mark.parametrize(
    ("email", "ok"),
    [
        ("67024841@up.ac.th", True),
        ("First.Last@UP.AC.TH", True),
        ("someone@gmail.com", False),
        ("x@up.ac.th.evil.com", False),
        ("x@evil-up.ac.th", False),
        ("x@sub.up.ac.th", False),
        ("up.ac.th@gmail.com", False),
        ('"a@up.ac.th"@evil.com', False),
        ("@up.ac.th", False),
        ("", False),
    ],
)
def test_email_domain_is_matched_exactly(email: str, ok: bool) -> None:
    assert email_domain_allowed(email, "up.ac.th") is ok


# ---------- security ----------
def test_password_hash_is_argon2_and_verifies() -> None:
    hashed = hash_password("Secret123")
    assert hashed.startswith("$argon2id$")
    assert verify_password("Secret123", hashed)
    assert not verify_password("wrong", hashed)
    assert not verify_password("Secret123", None)


def test_access_token_roundtrip_and_type_confusion() -> None:
    token, ttl = create_access_token(5, "student", 0)
    assert ttl == 900
    assert decode_token(token, "access")["sub"] == "5"
    with pytest.raises(TokenError):
        decode_token(token, "stream")
    ticket, _, _ = create_stream_ticket(5)
    with pytest.raises(TokenError):
        decode_token(ticket, "access")


def test_tampered_token_rejected() -> None:
    token, _ = create_access_token(5, "student", 0)
    with pytest.raises(TokenError):
        decode_token(token[:-2] + ("A" if token[-2] != "A" else "B") + token[-1], "access")


def test_argon2_uses_owasp_parameters_and_upgrades_old_hashes() -> None:
    from argon2 import PasswordHasher

    from app.core.security import password_needs_rehash

    hashed = hash_password("Secret123")
    assert "$m=19456,t=2,p=1$" in hashed
    legacy = PasswordHasher().hash("Secret123")  # library defaults (64 MiB)
    assert verify_password("Secret123", legacy)
    assert password_needs_rehash(legacy)
    assert not password_needs_rehash(hashed)


@pytest.mark.parametrize(
    ("email", "role"),
    [
        ("67024841@up.ac.th", RoleName.student),
        ("6502@up.ac.th", RoleName.student),
        ("somchai.j@up.ac.th", RoleName.teacher),
        ("a65@up.ac.th", RoleName.teacher),
    ],
)
def test_role_follows_the_email(email: str, role: RoleName) -> None:
    from app.services.auth import role_from_email

    assert role_from_email(email) is role
