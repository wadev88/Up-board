"""Posts & events, permission matrix, delete/edit RBAC, pins (events / announcements, 6-72 h),
event ordering, dashboard, active feeds and Post History."""

from datetime import datetime, timedelta

import pytest
import time_machine
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.clock import utcnow
from app.models import Event, Post, PostStatus, RemovalReason, RepairStatus, RoleName
from app.worker.jobs import unpin_expired
from tests.conftest import API, UserFactory, attachment_id, auth, category_id


def new_post(client: TestClient, db: Session, user, **overrides: object) -> dict:
    body: dict[str, object] = {
        "type": "general",
        "title": "ประกาศทดสอบ",
        "content": "เนื้อหาทดสอบ",
        "category_id": category_id(db, "general"),
        "priority": "normal",
    }
    body.update(overrides)
    response = client.post(f"{API}/posts", json=body, headers=auth(user))
    assert response.status_code == 201, response.text
    return response.json()


def event_body(db: Session, starts: datetime, hours: float = 2, **event: object) -> dict:
    return {
        "type": "event",
        "title": "กิจกรรมทดสอบ",
        "content": "รายละเอียดกิจกรรม",
        "category_id": category_id(db, "activities"),
        "event": {
            "starts_at": starts.isoformat(),
            "ends_at": (starts + timedelta(hours=hours)).isoformat(),
            **event,
        },
    }


def new_event(
    client: TestClient, db: Session, user, starts: datetime, hours: float = 2, **event: object
) -> dict:
    response = client.post(
        f"{API}/posts", json=event_body(db, starts, hours, **event), headers=auth(user)
    )
    assert response.status_code == 201, response.text
    return response.json()


def announcement_body(db: Session, **overrides: object) -> dict:
    return {
        "type": "announcement",
        "title": "ประกาศจากกองอาคาร",
        "content": "รายละเอียดประกาศ",
        "category_id": category_id(db, "general"),
        **overrides,
    }


def new_announcement(client: TestClient, db: Session, user, **overrides: object) -> dict:
    response = client.post(
        f"{API}/posts", json=announcement_body(db, **overrides), headers=auth(user)
    )
    assert response.status_code == 201, response.text
    return response.json()


def new_repair(client: TestClient, reporter) -> dict:
    body = {
        "title": "ไฟดับ",
        "content": "ห้อง 101",
        "location": "ICT 101",
        "attachment_ids": [attachment_id(reporter)],
    }
    response = client.post(f"{API}/repairs", json=body, headers=auth(reporter))
    assert response.status_code == 201, response.text
    return response.json()


def pin(client: TestClient, user, post_id: int, hours: int | None = None):
    kwargs = {"json": {"hours": hours}} if hours is not None else {}
    return client.post(f"{API}/posts/{post_id}/pin", headers=auth(user), **kwargs)


def ids(items: list[dict]) -> list[int]:
    return [p["id"] for p in items]


def test_create_post_sets_author_faculty_lifecycle_and_permissions(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    student = make_user()
    post = new_post(client, db, student)
    assert post["author"]["id"] == student.id
    assert post["faculty"]["code"] == "ICT"
    assert post["permissions"]["can_edit"] is True
    assert post["permissions"]["can_pin"] is False
    assert post["is_pinned"] is False
    assert post["lifecycle"] == "active"


# ---------- events: validation (BR-01) ----------
def test_event_requires_start_and_end(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    user = make_user(RoleName.student_club)
    starts = utcnow() + timedelta(days=1)
    body = event_body(db, starts)
    del body["event"]["ends_at"]
    assert client.post(f"{API}/posts", json=body, headers=auth(user)).status_code == 422
    body = event_body(db, starts)
    del body["event"]
    assert client.post(f"{API}/posts", json=body, headers=auth(user)).status_code == 422


@pytest.mark.parametrize("hours", [0, -1])
def test_event_end_must_be_after_start(
    client: TestClient, db: Session, make_user: UserFactory, hours: int
) -> None:
    body = event_body(db, utcnow() + timedelta(days=1), hours=hours)
    response = client.post(
        f"{API}/posts", json=body, headers=auth(make_user(RoleName.student_club))
    )
    assert response.status_code == 422


def test_event_times_need_a_timezone(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    body = event_body(db, utcnow() + timedelta(days=1))
    body["event"]["starts_at"] = "2030-01-01T10:00:00"
    body["event"]["ends_at"] = "2030-01-01T12:00:00"
    club = make_user(RoleName.student_club)
    assert client.post(f"{API}/posts", json=body, headers=auth(club)).status_code == 422


def test_event_details_only_on_events(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    body = event_body(db, utcnow() + timedelta(days=1))
    body["type"] = "announcement"
    assert client.post(f"{API}/posts", json=body, headers=auth(make_user())).status_code == 422


def test_database_requires_ends_at_for_new_events(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    post = new_event(client, db, make_user(RoleName.student_club), utcnow() + timedelta(days=1))
    row = db.get(Event, post["id"])
    row.ends_at = None
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


@pytest.mark.parametrize(
    ("role", "requested", "status", "stored"),
    [
        (RoleName.student, None, 403, None),  # students cannot create events at all
        (RoleName.technician, None, 403, None),
        (RoleName.teacher, None, 403, None),  # teachers lost their event powers
        (RoleName.student_club, None, 201, "department"),
        (RoleName.student_club, "faculty", 403, None),
        (
            RoleName.building_staff,
            None,
            403,
            None,
        ),  # building staff announce, they do not host events
        (RoleName.admin, None, 201, "university"),
        (RoleName.admin, "department", 201, "department"),
    ],
)
def test_event_priority_is_capped_by_role_on_the_server(
    client: TestClient,
    db: Session,
    make_user: UserFactory,
    role: RoleName,
    requested: str | None,
    status: int,
    stored: str | None,
) -> None:
    extra = {"priority_level": requested} if requested else {}
    body = event_body(db, utcnow() + timedelta(days=1), **extra)
    response = client.post(f"{API}/posts", json=body, headers=auth(make_user(role)))
    assert response.status_code == status, response.text
    if stored:
        assert response.json()["event"]["priority_level"] == stored


def test_profanity_blocks_create(client: TestClient, db: Session, make_user: UserFactory) -> None:
    body = {
        "type": "general",
        "title": "ไอ้ควาย",
        "content": "x",
        "category_id": category_id(db, "general"),
    }
    response = client.post(f"{API}/posts", json=body, headers=auth(make_user()))
    assert response.status_code == 422
    assert response.json()["error"] == {
        "code": "PROFANITY_DETECTED",
        "message": "Content contains inappropriate language",
        "details": [{"field": "title", "terms": 1}],
    }


def test_type_bound_categories_rejected_for_general_posts(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    body = {
        "type": "general",
        "title": "abc",
        "content": "x",
        "category_id": category_id(db, "repair"),
    }
    assert client.post(f"{API}/posts", json=body, headers=auth(make_user())).status_code == 422


@pytest.mark.parametrize(
    ("role", "status"),
    [
        (RoleName.student, 403),
        (RoleName.technician, 403),
        (RoleName.student_club, 403),
        (RoleName.teacher, 403),  # only building staff and admin set a priority
        (RoleName.building_staff, 201),
        (RoleName.admin, 201),
    ],
)
def test_urgent_priority_by_role(
    client: TestClient, db: Session, make_user: UserFactory, role: RoleName, status: int
) -> None:
    body = {
        "type": "general",
        "title": "ด่วน",
        "content": "x",
        "category_id": category_id(db, "general"),
        "priority": "urgent",
    }
    assert (
        client.post(f"{API}/posts", json=body, headers=auth(make_user(role))).status_code == status
    )


# ---------- RBAC: edit / delete (BR-03) ----------
@pytest.mark.parametrize(
    ("editor_role", "editor_faculty", "allowed"),
    [
        (RoleName.student, "ICT", False),
        (RoleName.teacher, "ICT", False),
        (RoleName.technician, "CENTRAL", False),
        (RoleName.building_staff, "CENTRAL", False),
        (RoleName.student_club, "ICT", False),
        (RoleName.admin, "CENTRAL", True),
    ],
)
def test_only_owner_or_admin_edits_and_deletes(
    client: TestClient,
    db: Session,
    make_user: UserFactory,
    editor_role: RoleName,
    editor_faculty: str,
    allowed: bool,
) -> None:
    post = new_post(client, db, make_user(faculty="ICT"))
    editor = make_user(editor_role, editor_faculty)
    shown = client.get(f"{API}/posts/{post['id']}", headers=auth(editor)).json()
    assert shown["permissions"]["can_delete"] is allowed
    response = client.patch(
        f"{API}/posts/{post['id']}", json={"title": "แก้ไขแล้ว"}, headers=auth(editor)
    )
    assert response.status_code == (200 if allowed else 403)
    assert client.delete(f"{API}/posts/{post['id']}", headers=auth(editor)).status_code == (
        204 if allowed else 403
    )
    if allowed:
        db.expire_all()
        assert db.get(Post, post["id"]).removal_reason is RemovalReason.admin


def test_owner_can_edit_and_soft_delete(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    owner = make_user()
    post = new_post(client, db, owner)
    assert (
        client.patch(
            f"{API}/posts/{post['id']}", json={"content": "อัปเดต"}, headers=auth(owner)
        ).json()["content"]
        == "อัปเดต"
    )
    assert client.delete(f"{API}/posts/{post['id']}", headers=auth(owner)).status_code == 204
    assert client.get(f"{API}/posts/{post['id']}", headers=auth(owner)).status_code == 404
    row = db.get(Post, post["id"])
    assert row is not None and row.status is PostStatus.removed and row.deleted_at is not None
    assert row.removal_reason is RemovalReason.author
    # deleted by the owner → not part of the history either
    history = client.get(f"{API}/me/posts", headers=auth(owner)).json()
    assert history["total"] == 0


# ---------- pins: events (clubs) + announcements (building staff), hours 6-72 ----------
@pytest.mark.parametrize(
    "role",
    [
        RoleName.student,
        RoleName.teacher,
        RoleName.technician,
        RoleName.student_club,
        RoleName.building_staff,
        RoleName.admin,
    ],
)
def test_general_posts_cannot_be_pinned_by_anyone(
    client: TestClient, db: Session, make_user: UserFactory, role: RoleName
) -> None:
    user = make_user(role)
    post = new_post(client, db, user)
    assert post["permissions"]["can_pin"] is False
    assert pin(client, user, post["id"]).status_code == 403


def test_repairs_and_lost_found_cannot_be_pinned(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    club, admin = make_user(RoleName.student_club), make_user(RoleName.admin, "CENTRAL")
    repair = new_repair(client, club)
    assert pin(client, club, repair["id"]).status_code == 403
    assert pin(client, admin, repair["id"]).status_code == 403
    item = client.post(
        f"{API}/lost-found",
        json={"title": "กุญแจหาย", "content": "x", "location": "ICT", "status": "lost"},
        headers=auth(club),
    ).json()
    assert pin(client, club, item["id"]).status_code == 403
    assert item["permissions"]["can_pin"] is False and repair["permissions"]["can_pin"] is False


def test_pin_permission_matrix_for_events_and_announcements(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    club, other_club = make_user(RoleName.student_club), make_user(RoleName.student_club)
    building, other_building = (
        make_user(RoleName.building_staff, "CENTRAL"),
        make_user(RoleName.building_staff, "CENTRAL"),
    )
    admin, student = make_user(RoleName.admin, "CENTRAL"), make_user()
    teacher = make_user(RoleName.teacher)
    event = new_event(client, db, club, utcnow() + timedelta(days=2))
    notice = new_announcement(client, db, building)
    expected = {
        ("event", club): True,
        ("event", other_club): False,  # not the author
        ("event", building): False,  # wrong role for events
        ("event", student): False,
        ("event", teacher): False,
        ("event", admin): True,  # admin: any
        ("notice", building): True,
        ("notice", other_building): False,
        ("notice", club): False,  # wrong role for announcements
        ("notice", teacher): False,
        ("notice", admin): True,
    }
    for (kind, user), allowed in expected.items():
        post = event if kind == "event" else notice
        shown = client.get(f"{API}/posts/{post['id']}", headers=auth(user)).json()
        assert shown["permissions"]["can_pin"] is allowed, (kind, user.role_name)
        assert pin(client, user, post["id"]).status_code == (200 if allowed else 403)


def test_pin_hours_default_48_and_allowed_choices(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    club = make_user(RoleName.student_club)
    event = new_event(client, db, club, utcnow() + timedelta(days=10))
    default = pin(client, club, event["id"])  # no body at all
    assert default.status_code == 200 and default.json()["is_pinned"] is True
    pinned_at = datetime.fromisoformat(default.json()["pinned_at"])
    assert datetime.fromisoformat(default.json()["pinned_until"]) - pinned_at == timedelta(hours=48)
    for hours in (6, 12, 24, 48, 72):
        response = pin(client, club, event["id"], hours)
        assert response.status_code == 200, hours
        started = datetime.fromisoformat(response.json()["pinned_at"])
        until = datetime.fromisoformat(response.json()["pinned_until"])
        assert until - started == timedelta(hours=hours)
    for bad in (0, 5, 7, 36, 73, "x"):
        response = client.post(
            f"{API}/posts/{event['id']}/pin", json={"hours": bad}, headers=auth(club)
        )
        assert response.status_code == 422, bad


def test_event_pin_never_outlives_the_event_start(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    club, viewer = make_user(RoleName.student_club), make_user()
    starts = utcnow() + timedelta(hours=5)
    event = new_event(client, db, club, starts)
    pinned = pin(client, club, event["id"], 24).json()
    assert datetime.fromisoformat(pinned["pinned_until"]) == starts  # min(now+24h, start)
    assert pinned["is_pinned"] is True
    dashboard = client.get(f"{API}/dashboard", headers=auth(viewer)).json()
    assert ids(dashboard["pinned"]) == [event["id"]]
    assert event["id"] not in ids(dashboard["upcoming"])  # shown once
    with time_machine.travel(starts + timedelta(minutes=1), tick=False):
        dashboard = client.get(f"{API}/dashboard", headers=auth(viewer)).json()
        assert ids(dashboard["pinned"]) == []  # pin ends when the event starts
        assert ids(dashboard["upcoming"]) == [event["id"]]  # still running until ends_at


def test_started_event_cannot_be_pinned(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    club = make_user(RoleName.student_club)
    start = utcnow()
    event = new_event(client, db, club, start + timedelta(hours=1), hours=3)
    with time_machine.travel(start + timedelta(hours=2), tick=False):
        response = pin(client, club, event["id"])
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PIN_NOT_ELIGIBLE"


def test_there_is_no_one_pin_limit_per_account(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    club = make_user(RoleName.student_club)
    events = [new_event(client, db, club, utcnow() + timedelta(days=3 + i)) for i in range(3)]
    for event in events:
        assert pin(client, club, event["id"]).status_code == 200
    viewer = make_user()
    dashboard = client.get(f"{API}/dashboard", headers=auth(viewer)).json()
    assert set(ids(dashboard["pinned"])) == {e["id"] for e in events}


def test_announcement_pin_by_building_staff_uses_the_hours_rule(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    building, viewer = make_user(RoleName.building_staff, "CENTRAL"), make_user()
    notice = new_announcement(client, db, building)
    pinned = pin(client, building, notice["id"], 12).json()
    started = datetime.fromisoformat(pinned["pinned_at"])
    assert datetime.fromisoformat(pinned["pinned_until"]) - started == timedelta(hours=12)
    dashboard = client.get(f"{API}/dashboard", headers=auth(viewer)).json()
    assert ids(dashboard["pinned"]) == [notice["id"]]
    with time_machine.travel(utcnow() + timedelta(hours=13), tick=False):
        dashboard = client.get(f"{API}/dashboard", headers=auth(viewer)).json()
        assert ids(dashboard["pinned"]) == []
        assert ids(dashboard["recent"]) == [notice["id"]]  # announcements stay 7 days


def test_announcement_about_a_repair_stays_pinned_until_the_repair_ends(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    building, reporter = make_user(RoleName.building_staff, "CENTRAL"), make_user()
    repair = new_repair(client, reporter)
    notice = new_announcement(client, db, building, related_repair_id=repair["id"])
    assert notice["related_repair_id"] == repair["id"]
    pinned = pin(client, building, notice["id"], 6).json()  # hours are ignored for repairs
    assert pinned["pinned_until"] is None and pinned["is_pinned"] is True
    with time_machine.travel(utcnow() + timedelta(days=30), tick=False):
        # far beyond 7 days and every hour choice: still pinned while the repair is active
        dashboard = client.get(f"{API}/dashboard", headers=auth(reporter)).json()
        assert ids(dashboard["pinned"]) == [notice["id"]]
        assert unpin_expired(db) == 0
    closed = client.patch(
        f"{API}/repairs/{repair['id']}",
        json={"status": "rejected", "note": "ไม่ใช่งานซ่อม"},
        headers=auth(building),
    )
    assert closed.status_code == 200
    dashboard = client.get(f"{API}/dashboard", headers=auth(reporter)).json()
    assert ids(dashboard["pinned"]) == []
    db.expire_all()
    assert db.get(Post, notice["id"]).pinned_at is None
    assert pin(client, building, notice["id"]).status_code == 409  # the repair is over


def test_related_repair_must_be_an_unfinished_repair(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    building, student = make_user(RoleName.building_staff, "CENTRAL"), make_user()
    general = new_post(client, db, student)
    for related in (general["id"], 999999):
        response = client.post(
            f"{API}/posts",
            json=announcement_body(db, related_repair_id=related),
            headers=auth(building),
        )
        assert response.status_code == 422, related
    body = {**announcement_body(db, related_repair_id=1), "type": "general"}
    assert client.post(f"{API}/posts", json=body, headers=auth(student)).status_code == 422


def test_announcement_with_related_repair_stays_in_the_feed_while_the_repair_is_active(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    building, reporter = make_user(RoleName.building_staff, "CENTRAL"), make_user()
    repair = new_repair(client, reporter)
    start = utcnow()
    with time_machine.travel(start - timedelta(days=8), tick=False):
        linked = new_announcement(client, db, building, related_repair_id=repair["id"])
        plain = new_announcement(client, db, building, title="ประกาศธรรมดา")
    feed = client.get(f"{API}/posts?type=announcement", headers=auth(reporter)).json()
    assert ids(feed["items"]) == [linked["id"]]
    assert plain["id"] not in ids(
        client.get(f"{API}/dashboard", headers=auth(reporter)).json()["recent"]
    )


def test_admin_unpin_and_deleting_a_post_releases_its_pin(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    club, admin = make_user(RoleName.student_club), make_user(RoleName.admin, "CENTRAL")
    first = new_event(client, db, club, utcnow() + timedelta(days=2))
    second = new_event(client, db, club, utcnow() + timedelta(days=3))
    pin(client, club, first["id"])
    unpinned = client.delete(f"{API}/posts/{first['id']}/pin", headers=auth(admin))
    assert unpinned.status_code == 200 and unpinned.json()["is_pinned"] is False
    student = make_user()
    pin(client, club, second["id"])
    assert (
        client.delete(f"{API}/posts/{second['id']}/pin", headers=auth(student)).status_code == 403
    )
    client.delete(f"{API}/posts/{second['id']}", headers=auth(club))
    db.expire_all()
    assert db.get(Post, second["id"]).pinned_by is None


def test_worker_auto_unpins_and_is_idempotent(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    club = make_user(RoleName.student_club)
    event = new_event(client, db, club, utcnow() + timedelta(days=10))
    pin(client, club, event["id"], 6)
    with time_machine.travel(utcnow() + timedelta(hours=7), tick=False):
        assert unpin_expired(db) == 1
        assert unpin_expired(db) == 0
    db.expire_all()
    row = db.get(Post, event["id"])
    assert row.pinned_until is None and row.pinned_by is None


def test_worker_unpins_announcements_of_ended_repairs(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    building = make_user(RoleName.building_staff, "CENTRAL")
    repair = new_repair(client, make_user())
    notice = new_announcement(client, db, building, related_repair_id=repair["id"])
    pin(client, building, notice["id"])
    row = db.get(Post, repair["id"])
    row.repair.status = RepairStatus.closed  # closed behind the API's back
    db.commit()
    assert unpin_expired(db) == 1
    db.expire_all()
    assert db.get(Post, notice["id"]).pinned_at is None


def test_database_pin_constraints(db: Session, client: TestClient, make_user: UserFactory) -> None:
    club = make_user(RoleName.student_club)
    now = utcnow()
    event = db.get(Post, new_event(client, db, club, now + timedelta(days=10))["id"])
    # long pins are fine now (no 72 h limit) and one account may hold many
    event.pinned_at, event.pinned_until, event.pinned_by = now, now + timedelta(days=9), club.id
    db.commit()
    event.pinned_by = None  # pinned_at without pinned_by is inconsistent
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    event = db.get(Post, event.id)
    event.pinned_until = event.pinned_at - timedelta(hours=1)  # an end before the start
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_dashboard_shows_at_most_five_pins(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    viewer = make_user()
    for _ in range(7):
        club = make_user(RoleName.student_club)
        event = new_event(client, db, club, utcnow() + timedelta(days=3))
        assert pin(client, club, event["id"]).status_code == 200
    first = client.get(f"{API}/dashboard", headers=auth(viewer)).json()["pinned"]
    again = client.get(f"{API}/dashboard", headers=auth(viewer)).json()["pinned"]
    assert len(first) == 5 and len(set(ids(first))) == 5
    assert ids(first) == ids(again)  # stable between reloads


# ---------- dashboard & feeds (BR-01, BR-06) ----------
def test_dashboard_sections_and_lifecycle_rules(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    student = make_user()
    club = make_user(RoleName.student_club)
    admin = make_user(RoleName.admin, "CENTRAL")
    building = make_user(RoleName.building_staff, "CENTRAL")
    start = utcnow()
    with time_machine.travel(start - timedelta(hours=30), tick=False):
        old = new_post(client, db, student, title="โพสต์เก่า")
        ended = new_event(client, db, club, start - timedelta(hours=10), hours=2)
        later = new_event(client, db, club, start + timedelta(days=9))  # created long ago
    with time_machine.travel(start - timedelta(days=3), tick=False):
        notice = new_announcement(client, db, building, title="ประกาศ 3 วันก่อน")
    with time_machine.travel(start - timedelta(days=8), tick=False):
        old_notice = new_announcement(client, db, building, title="ประกาศ 8 วันก่อน")
    running = new_event(client, db, club, start - timedelta(hours=1), hours=3)
    tie_dept = new_event(client, db, club, start + timedelta(days=2))
    tie_university = new_event(client, db, admin, start + timedelta(days=2))
    recent_a = new_post(client, db, student, title="ล่าสุด 1")
    recent_b = new_post(client, db, admin, title="ล่าสุด 2")

    dashboard = client.get(f"{API}/dashboard", headers=auth(student)).json()
    assert {"pinned", "upcoming", "recent", "repairs", "lost_found"} <= set(dashboard)
    # University > Faculty > Department FIRST, then starts_at ascending
    assert ids(dashboard["upcoming"]) == [
        tie_university["id"],
        running["id"],
        tie_dept["id"],
        later["id"],
    ]
    # general posts (24 h) and announcements (7 days), newest first
    assert ids(dashboard["recent"]) == [recent_b["id"], recent_a["id"], notice["id"]]
    every = [p["id"] for s in ("pinned", "upcoming", "recent") for p in dashboard[s]]
    assert old["id"] not in every and ended["id"] not in every and old_notice["id"] not in every
    # expired posts stay in the author's history
    history = client.get(f"{API}/me/posts", headers=auth(building)).json()
    assert {old_notice["id"], notice["id"]} <= set(ids(history["items"]))


def test_legacy_event_without_end_counts_as_ended_at_start(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    from sqlalchemy import text

    user = make_user(RoleName.student_club)
    start = utcnow()
    event = new_event(client, db, user, start + timedelta(hours=1))
    # simulate a pre-0002 row (the NOT VALID check only guards new writes)
    db.execute(text("ALTER TABLE events DROP CONSTRAINT ck_events_ends_at_required"))
    db.execute(text("UPDATE events SET ends_at = NULL WHERE post_id = :id"), {"id": event["id"]})
    db.execute(
        text(
            "ALTER TABLE events ADD CONSTRAINT ck_events_ends_at_required "
            "CHECK (ends_at IS NOT NULL) NOT VALID"
        )
    )
    db.commit()
    upcoming = client.get(f"{API}/dashboard", headers=auth(user)).json()["upcoming"]
    assert ids(upcoming) == [event["id"]]
    with time_machine.travel(start + timedelta(hours=1, minutes=1), tick=False):
        upcoming = client.get(f"{API}/dashboard", headers=auth(user)).json()["upcoming"]
        assert ids(upcoming) == []
        assert client.get(f"{API}/posts/{event['id']}", headers=auth(user)).json()["lifecycle"] == (
            "expired"
        )


def test_community_feed_hides_expired_posts(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    user = make_user()
    start = utcnow()
    with time_machine.travel(start - timedelta(hours=25), tick=False):
        old = new_post(client, db, user, title="เก่า")
    fresh = new_post(client, db, user, title="ใหม่")
    feed = client.get(f"{API}/posts?category=general", headers=auth(user)).json()
    assert ids(feed["items"]) == [fresh["id"]]
    assert old["id"] not in ids(client.get(f"{API}/posts", headers=auth(user)).json()["items"])


def test_event_feed_is_ordered_and_excludes_ended(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    user, admin = make_user(RoleName.student_club), make_user(RoleName.admin, "CENTRAL")
    start = utcnow()
    with time_machine.travel(start - timedelta(days=2), tick=False):
        ended = new_event(client, db, user, start - timedelta(days=1))
    b = new_event(client, db, user, start + timedelta(days=3))
    a = new_event(client, db, user, start + timedelta(days=1))
    c = new_event(client, db, admin, start + timedelta(days=3))
    d = new_event(client, db, admin, start + timedelta(days=5), priority_level="department")
    feed = client.get(f"{API}/posts?type=event", headers=auth(user)).json()
    # priority first (university), then the start time, then the id
    assert ids(feed["items"]) == [c["id"], a["id"], b["id"], d["id"]]
    assert ended["id"] not in ids(feed["items"])
    calendar = client.get(f"{API}/events", headers=auth(user)).json()
    assert ids(calendar) == ids(feed["items"])


def test_post_history_keeps_expired_posts_for_the_owner_only(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    owner, other = make_user(RoleName.student_club), make_user()
    start = utcnow()
    with time_machine.travel(start - timedelta(hours=30), tick=False):
        old = new_post(client, db, owner, title="เก่า")
        ended = new_event(client, db, owner, start - timedelta(hours=20))
    fresh = new_post(client, db, owner, title="ใหม่")
    new_post(client, db, other, title="ของคนอื่น")

    history = client.get(f"{API}/me/posts", headers=auth(owner)).json()
    assert set(ids(history["items"])) == {old["id"], ended["id"], fresh["id"]}
    by_id = {p["id"]: p for p in history["items"]}
    assert by_id[old["id"]]["lifecycle"] == "expired"
    assert by_id[fresh["id"]]["lifecycle"] == "active"
    expired = client.get(f"{API}/me/posts?state=expired", headers=auth(owner)).json()
    assert set(ids(expired["items"])) == {old["id"], ended["id"]}
    events = client.get(f"{API}/me/posts?type=event", headers=auth(owner)).json()
    assert ids(events["items"]) == [ended["id"]]
    assert client.get(f"{API}/me/posts", headers=auth(other)).json()["total"] == 1
    # expired posts stay readable directly
    assert client.get(f"{API}/posts/{old['id']}", headers=auth(other)).status_code == 200


def test_category_page_and_search(client: TestClient, db: Session, make_user: UserFactory) -> None:
    user = make_user()
    new_post(client, db, user, title="ร้านกาแฟดีมาก")
    new_post(client, db, user, title="ประกาศอื่น")
    by_category = client.get(f"{API}/posts?category=general", headers=auth(user)).json()
    assert by_category["total"] == 2
    assert client.get(f"{API}/posts?category=announcement", headers=auth(user)).json()["total"] == 0
    assert client.get(f"{API}/posts?q=กาแฟ", headers=auth(user)).json()["total"] == 1
    assert client.get(f"{API}/posts?q=100%25", headers=auth(user)).json()["total"] == 0  # literal %
    assert (
        client.get(f"{API}/posts?page=1&page_size=1", headers=auth(user)).json()["page_size"] == 1
    )
    assert client.get(f"{API}/posts?page_size=1000", headers=auth(user)).status_code == 422


def test_faculty_feed(client: TestClient, db: Session, make_user: UserFactory) -> None:
    ict, eng = make_user(faculty="ICT"), make_user(faculty="ENG")
    new_post(client, db, ict)
    new_post(client, db, eng)
    ict_faculty = client.get(f"{API}/auth/me", headers=auth(ict)).json()["faculty"]["id"]
    feed = client.get(f"{API}/posts?faculty_id={ict_faculty}", headers=auth(eng)).json()
    assert feed["total"] == 1 and feed["items"][0]["faculty"]["code"] == "ICT"


def test_events_endpoint(client: TestClient, db: Session, make_user: UserFactory) -> None:
    club = make_user(RoleName.student_club, "ICT")
    new_event(client, db, club, utcnow() + timedelta(days=3), venue="ICT")
    events = client.get(f"{API}/events", headers=auth(club)).json()
    assert len(events) == 1 and events[0]["event"]["venue"] == "ICT"
    assert events[0]["event"]["priority_level"] == "department"


def test_editing_event_validates_priority_and_resets_pin(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    club = make_user(RoleName.student_club)
    starts = utcnow() + timedelta(days=2)
    event = new_event(client, db, club, starts)
    client.post(f"{API}/posts/{event['id']}/pin", headers=auth(club))
    moved = {
        "starts_at": (starts + timedelta(days=1)).isoformat(),
        "ends_at": (starts + timedelta(days=1, hours=2)).isoformat(),
    }
    response = client.patch(f"{API}/posts/{event['id']}", json={"event": moved}, headers=auth(club))
    assert response.status_code == 200 and response.json()["pinned_at"] is None
    too_high = {**moved, "priority_level": "faculty"}
    response = client.patch(
        f"{API}/posts/{event['id']}", json={"event": too_high}, headers=auth(club)
    )
    assert response.status_code == 403


# ---------- who may create which post type ----------
@pytest.mark.parametrize(
    ("role", "general", "announcement", "event"),
    [
        (RoleName.student, 201, 403, 403),
        (RoleName.teacher, 201, 403, 403),
        (RoleName.technician, 201, 403, 403),
        (RoleName.student_club, 201, 403, 201),
        (RoleName.building_staff, 201, 201, 403),
        (RoleName.admin, 201, 201, 201),
    ],
)
def test_post_types_by_role(
    client: TestClient,
    db: Session,
    make_user: UserFactory,
    role: RoleName,
    general: int,
    announcement: int,
    event: int,
) -> None:
    user = make_user(
        role, "CENTRAL" if role in (RoleName.admin, RoleName.building_staff) else "ICT"
    )
    base = {"title": "ทดสอบสิทธิ์", "content": "เนื้อหา", "category_id": category_id(db, "general")}
    for post_type, expected in (("general", general), ("announcement", announcement)):
        response = client.post(f"{API}/posts", json={**base, "type": post_type}, headers=auth(user))
        assert response.status_code == expected, (post_type, response.text)
    response = client.post(
        f"{API}/posts", json=event_body(db, utcnow() + timedelta(days=1)), headers=auth(user)
    )
    assert response.status_code == event, response.text


@pytest.mark.parametrize("role", list(RoleName))
def test_every_role_may_report_repairs_and_lost_found_but_priority_is_restricted(
    client: TestClient, db: Session, make_user: UserFactory, role: RoleName
) -> None:
    user = make_user(
        role, "CENTRAL" if role in (RoleName.admin, RoleName.building_staff) else "ICT"
    )
    assert new_repair(client, user)["id"]
    item = {"title": "ของหาย", "content": "x", "location": "ICT", "status": "lost"}
    assert client.post(f"{API}/lost-found", json=item, headers=auth(user)).status_code == 201
    priority = client.post(
        f"{API}/posts",
        json={
            "type": "general",
            "title": "ลองตั้งความสำคัญ",
            "content": "x",
            "category_id": category_id(db, "general"),
            "priority": "high",
        },
        headers=auth(user),
    )
    allowed = role in (RoleName.building_staff, RoleName.admin)
    assert priority.status_code == (201 if allowed else 403)


def test_club_cannot_choose_event_priority(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    club = make_user(RoleName.student_club)
    body = {**event_body(db, utcnow() + timedelta(days=1)), "priority": "high"}
    assert client.post(f"{API}/posts", json=body, headers=auth(club)).status_code == 403
    body["priority"] = "normal"
    created = client.post(f"{API}/posts", json=body, headers=auth(club))
    assert created.status_code == 201
    assert created.json()["priority"] == "normal"
    assert created.json()["event"]["priority_level"] == "department"
    edit = client.patch(
        f"{API}/posts/{created.json()['id']}", json={"priority": "low"}, headers=auth(club)
    )
    assert edit.status_code == 403


def test_only_building_staff_and_admin_choose_a_post_priority(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    body = {
        "type": "general",
        "title": "ความสำคัญ",
        "content": "x",
        "category_id": category_id(db, "general"),
        "priority": "low",
    }
    assert client.post(f"{API}/posts", json=body, headers=auth(make_user())).status_code == 403
    building = make_user(RoleName.building_staff, "CENTRAL")
    created = client.post(f"{API}/posts", json={**body, "priority": "high"}, headers=auth(building))
    assert created.status_code == 201 and created.json()["priority"] == "high"


def test_unfinished_profile_cannot_post_but_can_read(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    fresh = make_user(onboarding=True)
    body = {
        "type": "general",
        "title": "ยังไม่เลือกบทบาท",
        "content": "x",
        "category_id": category_id(db, "general"),
    }
    response = client.post(f"{API}/posts", json=body, headers=auth(fresh))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PROFILE_INCOMPLETE"
    repair = {
        "title": "ไฟดับ",
        "content": "x",
        "location": "ICT 101",
        "attachment_ids": [attachment_id(fresh)],
    }
    blocked = client.post(f"{API}/repairs", json=repair, headers=auth(fresh))
    assert blocked.json()["error"]["code"] == "PROFILE_INCOMPLETE"
    assert client.get(f"{API}/dashboard", headers=auth(fresh)).status_code == 200


def test_category_is_derived_from_the_post_type(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin = make_user(RoleName.admin, "CENTRAL")
    general = new_post(client, db, admin, category_id=None)
    announcement = new_post(client, db, admin, type="announcement", category_id=None)
    event_body_ = event_body(db, utcnow() + timedelta(days=1))
    event_body_.pop("category_id")
    event = client.post(f"{API}/posts", json=event_body_, headers=auth(admin))
    assert event.status_code == 201, event.text
    assert general["category"]["slug"] == "general"
    assert announcement["category"]["slug"] == "announcement"
    assert event.json()["category"]["slug"] == "activities"
    slugs = {c["slug"] for c in client.get(f"{API}/categories", headers=auth(admin)).json()}
    assert slugs == {"general", "announcement", "activities", "lost-found", "repair"}
    # an explicit id is still validated against the type
    bad = {**event_body(db, utcnow() + timedelta(days=1)), "category_id": category_id(db, "repair")}
    assert client.post(f"{API}/posts", json=bad, headers=auth(admin)).status_code == 422
