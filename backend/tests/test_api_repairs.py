"""Repair requests (public with private fields; workflow: building staff assign / review / close /
reject, technicians update their own jobs, admin view-only) and Lost & Found (7-day window)."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

import pytest
import time_machine
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import utcnow
from app.models import (
    AuditLog,
    Notification,
    Post,
    PostStatus,
    RemovalReason,
    RepairStatusHistory,
    RoleName,
    Technician,
    User,
)
from app.worker.jobs import archive_stale_lost_items
from tests.conftest import API, UserFactory, attachment_id, auth, category_id

PRIVATE_NULLED = ("latitude", "longitude", "technician")


def new_repair(client: TestClient, reporter: User, **overrides: object) -> dict:
    body: dict[str, object] = {
        "title": "ไฟทางเดินดับ",
        "content": "ไฟทางเดินชั้น 1 ดับทั้งแถว",
        "location": "อาคาร ICT ชั้น 1",
        "latitude": 19.0303,
        "longitude": 99.8937,
        "attachment_ids": [attachment_id(reporter)],
    }
    body.update(overrides)
    response = client.post(f"{API}/repairs", json=body, headers=auth(reporter))
    assert response.status_code == 201, response.text
    return response.json()


def technician_of(db: Session, user: User) -> int:
    return db.scalars(select(Technician.id).where(Technician.user_id == user.id)).one()


def assign(client: TestClient, actor: User, repair_id: int, technician_id: int):
    return client.patch(
        f"{API}/repairs/{repair_id}/assign",
        json={"technician_id": technician_id},
        headers=auth(actor),
    )


def set_status(client: TestClient, actor: User, repair_id: int, status: str, **extra: object):
    return client.patch(
        f"{API}/repairs/{repair_id}", json={"status": status, **extra}, headers=auth(actor)
    )


def to_pending_review(client: TestClient, db: Session, building: User, tech: User, rid: int):
    assert assign(client, building, rid, technician_of(db, tech)).status_code == 200
    assert set_status(client, tech, rid, "in_progress").status_code == 200
    done = set_status(client, tech, rid, "pending_review", note="ซ่อมเสร็จแล้ว")
    assert done.status_code == 200, done.text


def test_repair_is_public_but_private_fields_are_hidden(
    client: TestClient, make_user: UserFactory
) -> None:
    reporter, other = make_user(), make_user(faculty="ENG")
    repair = new_repair(client, reporter)

    own = client.get(f"{API}/repairs/{repair['id']}", headers=auth(reporter)).json()
    assert own["author"]["id"] == reporter.id
    assert own["repair"]["latitude"] == pytest.approx(19.0303)

    public = client.get(f"{API}/repairs/{repair['id']}", headers=auth(other)).json()
    assert public["title"] == "ไฟทางเดินดับ"
    assert public["repair"]["location"] == "อาคาร ICT ชั้น 1"
    assert public["repair"]["status"] == "open"
    assert public["author"] is None
    for field in PRIVATE_NULLED:
        assert public["repair"][field] is None
    assert all(h["note"] is None and h["changed_by"] is None for h in public["repair"]["history"])
    listing = client.get(f"{API}/repairs", headers=auth(other)).json()["items"][0]
    assert listing["author"] is None and listing["repair"]["latitude"] is None
    dashboard = client.get(f"{API}/dashboard", headers=auth(other)).json()
    assert dashboard["repairs"][0]["author"] is None


@pytest.mark.parametrize(
    ("role", "private"),
    [
        (RoleName.teacher, False),
        (RoleName.building_staff, True),
        (RoleName.admin, True),
    ],
)
def test_who_sees_private_repair_fields(
    client: TestClient, make_user: UserFactory, role: RoleName, private: bool
) -> None:
    repair = new_repair(client, make_user())
    viewer = make_user(role, "CENTRAL")
    shown = client.get(f"{API}/repairs/{repair['id']}", headers=auth(viewer)).json()
    assert (shown["author"] is not None) is private


def test_new_repair_notifies_reporter_and_building_staff(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    building = make_user(RoleName.building_staff, "CENTRAL")
    make_user(RoleName.technician, "CENTRAL")
    make_user(RoleName.admin, "CENTRAL")
    reporter = make_user()
    new_repair(client, reporter)
    recipients = set(db.scalars(select(Notification.user_id)).all())
    assert recipients == {building.id, reporter.id}


# ---------- creation rules: image + location required, cooldown ----------
def test_repair_requires_an_image_and_a_location(
    client: TestClient, make_user: UserFactory
) -> None:
    user = make_user()
    base = {"title": "ท่อน้ำแตก", "content": "น้ำรั่วหน้าตึก", "location": "หน้าตึก ICT"}
    for body in (
        base,  # no attachment_ids at all
        {**base, "attachment_ids": []},  # at least one photo
        {**base, "attachment_ids": [attachment_id(user)], "location": ""},
        {k: v for k, v in base.items() if k != "location"}
        | {"attachment_ids": [attachment_id(user)]},
    ):
        response = client.post(f"{API}/repairs", json=body, headers=auth(user))
        assert response.status_code == 422, body
    ok = client.post(
        f"{API}/repairs", json={**base, "attachment_ids": [attachment_id(user)]}, headers=auth(user)
    )
    assert ok.status_code == 201
    assert len(ok.json()["attachments"]) == 1


def test_repair_cooldown_is_120_seconds_per_user(
    client: TestClient, make_user: UserFactory, settings
) -> None:
    settings(repair_cooldown_seconds=120)
    user, other = make_user(), make_user()
    start = utcnow()
    with time_machine.travel(start, tick=False):
        new_repair(client, user)
        blocked = client.post(
            f"{API}/repairs",
            json={
                "title": "ก๊อกรั่ว",
                "content": "น้ำหยด",
                "location": "ห้องน้ำ",
                "attachment_ids": [attachment_id(user)],
            },
            headers=auth(user),
        )
        assert blocked.status_code == 429
        error = blocked.json()["error"]
        assert error["code"] == "REPAIR_TOO_FAST"
        retry = next(d["message"] for d in error["details"] if d["field"] == "retry_at")
        assert datetime.fromisoformat(retry) == start + timedelta(seconds=120)
        new_repair(client, other)  # the limit is per user
    with time_machine.travel(start + timedelta(seconds=119), tick=False):
        body = {"title": "ก๊อกรั่ว", "content": "x", "location": "ห้องน้ำ"}
        body["attachment_ids"] = [attachment_id(user)]
        assert client.post(f"{API}/repairs", json=body, headers=auth(user)).status_code == 429
    with time_machine.travel(start + timedelta(seconds=121), tick=False):
        new_repair(client, user)


# ---------- workflow ----------
def test_full_workflow_assign_progress_review_close(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    reporter = make_user()
    building = make_user(RoleName.building_staff, "CENTRAL")
    tech = make_user(RoleName.technician, "CENTRAL")
    rid = new_repair(client, reporter)["id"]

    # open → assigned happens only by assigning
    assert set_status(client, building, rid, "assigned").status_code == 409
    assigned = assign(client, building, rid, technician_of(db, tech))
    assert assigned.status_code == 200
    assert assigned.json()["repair"]["status"] == "assigned"
    assert assigned.json()["repair"]["technician"]["display_name"] == tech.display_name

    skip = set_status(client, tech, rid, "pending_review")
    assert skip.status_code == 409 and skip.json()["error"]["code"] == "INVALID_TRANSITION"
    assert set_status(client, tech, rid, "closed").status_code == 409  # technicians cannot close
    for step, note in (("in_progress", "เริ่มซ่อม"), ("pending_review", "เสร็จแล้ว")):
        response = set_status(client, tech, rid, step, note=note)
        assert response.status_code == 200, response.text
    assert set_status(client, tech, rid, "in_progress").status_code == 403  # building staff only
    assert set_status(client, tech, rid, "closed").status_code == 403
    closed = set_status(client, building, rid, "closed", note="ตรวจแล้ว")
    assert closed.status_code == 200 and closed.json()["repair"]["status"] == "closed"
    assert set_status(client, building, rid, "in_progress", note="เปิดใหม่").status_code == 409

    history = client.get(f"{API}/repairs/{rid}", headers=auth(reporter)).json()["repair"]["history"]
    assert [h["to_status"] for h in history] == [
        "open",
        "assigned",
        "in_progress",
        "pending_review",
        "closed",
    ]
    assert history[2]["note"] == "เริ่มซ่อม"
    mine = client.get(f"{API}/repairs/{rid}", headers=auth(building)).json()["repair"]["history"]
    assert mine[4]["changed_by"]["id"] == building.id and mine[4]["changed_at"]
    notes = db.scalars(select(Notification.type).where(Notification.user_id == reporter.id)).all()
    assert notes.count("repair.status") >= 4  # assigned, in_progress, pending_review, closed


def test_building_staff_sends_a_review_back_with_a_note(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    building = make_user(RoleName.building_staff, "CENTRAL")
    tech = make_user(RoleName.technician, "CENTRAL")
    rid = new_repair(client, make_user())["id"]
    to_pending_review(client, db, building, tech, rid)
    assert set_status(client, building, rid, "in_progress").status_code == 422  # note required
    assert set_status(client, building, rid, "in_progress", note="  ").status_code == 422
    back = set_status(client, building, rid, "in_progress", note="ยังไม่เรียบร้อย")
    assert back.status_code == 200 and back.json()["repair"]["status"] == "in_progress"
    assert set_status(client, tech, rid, "pending_review").status_code == 200


def test_reject_needs_a_reason_and_notifies_the_owner(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    reporter = make_user()
    building = make_user(RoleName.building_staff, "CENTRAL")
    rid = new_repair(client, reporter)["id"]
    assert set_status(client, building, rid, "rejected").status_code == 422
    assert set_status(client, building, rid, "rejected", note="  ab ").status_code == 422
    rejected = set_status(client, building, rid, "rejected", note="  ไม่ใช่งานของกองอาคาร ")
    assert rejected.status_code == 200
    assert rejected.json()["repair"]["status"] == "rejected"
    note = db.scalars(
        select(Notification).where(
            Notification.user_id == reporter.id, Notification.type == "repair.rejected"
        )
    ).one()
    assert "ไม่ใช่งานของกองอาคาร" in (note.body or "") and note.link == f"/repairs/{rid}"
    row = db.scalars(
        select(RepairStatusHistory)
        .where(RepairStatusHistory.repair_id == rid)
        .order_by(RepairStatusHistory.id.desc())
    ).first()
    assert row.note == "ไม่ใช่งานของกองอาคาร" and row.changed_by == building.id
    # terminal: nothing moves it again, it cannot be assigned
    tech = make_user(RoleName.technician, "CENTRAL")
    assert set_status(client, building, rid, "closed").status_code == 409
    assert set_status(client, building, rid, "rejected", note="อีกครั้ง").status_code == 409
    assert assign(client, building, rid, technician_of(db, tech)).status_code == 409


@pytest.mark.parametrize("stage", ["open", "assigned", "in_progress", "pending_review"])
def test_building_staff_can_reject_from_every_active_status(
    client: TestClient, db: Session, make_user: UserFactory, stage: str
) -> None:
    building = make_user(RoleName.building_staff, "CENTRAL")
    tech = make_user(RoleName.technician, "CENTRAL")
    rid = new_repair(client, make_user())["id"]
    if stage != "open":
        assign(client, building, rid, technician_of(db, tech))
    if stage in ("in_progress", "pending_review"):
        set_status(client, tech, rid, "in_progress")
    if stage == "pending_review":
        set_status(client, tech, rid, "pending_review")
    shown = client.get(f"{API}/repairs/{rid}", headers=auth(building)).json()
    assert shown["repair"]["status"] == stage
    assert set_status(client, building, rid, "rejected", note="ปฏิเสธ").status_code == 200


def test_only_building_staff_can_reject(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    tech = make_user(RoleName.technician, "CENTRAL")
    building = make_user(RoleName.building_staff, "CENTRAL")
    rid = new_repair(client, make_user())["id"]
    assign(client, building, rid, technician_of(db, tech))
    for actor in (
        tech,
        make_user(RoleName.admin, "CENTRAL"),
        make_user(),
        make_user(RoleName.teacher),
    ):
        response = set_status(client, actor, rid, "rejected", note="ปฏิเสธ")
        assert response.status_code == 403, actor.role_name


@pytest.mark.parametrize(
    "role",
    [
        RoleName.student,
        RoleName.teacher,
        RoleName.technician,
        RoleName.student_club,
        RoleName.admin,  # view-only for repairs (ADR-003)
    ],
)
def test_only_building_staff_can_assign_or_manage(
    client: TestClient, db: Session, make_user: UserFactory, role: RoleName
) -> None:
    tech = make_user(RoleName.technician, "CENTRAL")
    actor = make_user(role, "CENTRAL")
    repair = new_repair(client, make_user())
    assert repair["permissions"]["can_assign"] is False
    assert assign(client, actor, repair["id"], technician_of(db, tech)).status_code == 403
    assert set_status(client, actor, repair["id"], "in_progress").status_code == 403


def test_technician_cannot_assign_themselves(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    tech = make_user(RoleName.technician, "CENTRAL")
    rid = new_repair(client, make_user())["id"]
    assert assign(client, tech, rid, technician_of(db, tech)).status_code == 403


def test_technician_updates_only_own_jobs_forward(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    building = make_user(RoleName.building_staff, "CENTRAL")
    tech, other_tech = (
        make_user(RoleName.technician, "CENTRAL"),
        make_user(RoleName.technician, "CENTRAL"),
    )
    mine, theirs = new_repair(client, make_user()), new_repair(client, make_user())
    assign(client, building, mine["id"], technician_of(db, tech))
    assign(client, building, theirs["id"], technician_of(db, other_tech))

    own = client.get(f"{API}/repairs/{mine['id']}", headers=auth(tech)).json()
    assert own["permissions"]["can_update_status"] is True
    assert own["repair"]["latitude"] is not None  # assigned technician sees private fields
    assert set_status(client, tech, mine["id"], "in_progress").status_code == 200
    assert set_status(client, tech, mine["id"], "assigned").status_code == 409
    other = client.get(f"{API}/repairs/{theirs['id']}", headers=auth(tech)).json()
    assert other["permissions"]["can_update_status"] is False
    assert other["repair"]["latitude"] is None
    assert set_status(client, tech, theirs["id"], "in_progress").status_code == 403


def test_technician_cannot_touch_the_original_post(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    building = make_user(RoleName.building_staff, "CENTRAL")
    tech = make_user(RoleName.technician, "CENTRAL")
    rid = new_repair(client, make_user())["id"]
    assign(client, building, rid, technician_of(db, tech))
    edit = client.patch(f"{API}/posts/{rid}", json={"title": "เปลี่ยนชื่อ"}, headers=auth(tech))
    assert edit.status_code == 403
    assert client.delete(f"{API}/posts/{rid}", headers=auth(tech)).status_code == 403


def test_technician_update_accepts_a_note_and_after_photos(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    building = make_user(RoleName.building_staff, "CENTRAL")
    tech = make_user(RoleName.technician, "CENTRAL")
    rid = new_repair(client, make_user())["id"]
    assign(client, building, rid, technician_of(db, tech))
    set_status(client, tech, rid, "in_progress")
    response = set_status(
        client,
        tech,
        rid,
        "pending_review",
        note="เปลี่ยนหลอดไฟแล้ว",
        attachment_ids=[attachment_id(tech)],
    )
    assert response.status_code == 200
    assert [a["kind"] for a in response.json()["attachments"]] == ["image", "repair_after"]


def test_reassign_moves_the_job_and_resets_to_assigned(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    building = make_user(RoleName.building_staff, "CENTRAL")
    first, second = (
        make_user(RoleName.technician, "CENTRAL"),
        make_user(RoleName.technician, "CENTRAL"),
    )
    rid = new_repair(client, make_user())["id"]
    assign(client, building, rid, technician_of(db, first))
    set_status(client, first, rid, "in_progress")
    moved = assign(client, building, rid, technician_of(db, second))
    assert moved.status_code == 200
    assert moved.json()["repair"]["status"] == "assigned"
    assert set_status(client, first, rid, "in_progress").status_code == 403  # no longer theirs
    assert set_status(client, second, rid, "in_progress").status_code == 200
    assert assign(client, building, rid, technician_of(db, second)).status_code == 409
    actions = db.scalars(select(AuditLog.action).where(AuditLog.entity_id == rid)).all()
    assert "repair.assign" in actions and "repair.reassign" in actions
    old_tech_notes = db.scalars(
        select(Notification.type).where(Notification.user_id == first.id)
    ).all()
    assert "repair.unassigned" in old_tech_notes


def test_pending_review_jobs_cannot_be_reassigned(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    building = make_user(RoleName.building_staff, "CENTRAL")
    tech, other = (
        make_user(RoleName.technician, "CENTRAL"),
        make_user(RoleName.technician, "CENTRAL"),
    )
    rid = new_repair(client, make_user())["id"]
    to_pending_review(client, db, building, tech, rid)
    response = assign(client, building, rid, technician_of(db, other))
    assert response.status_code == 409 and response.json()["error"]["code"] == "INVALID_TRANSITION"


def test_only_technician_role_can_be_assigned(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    building = make_user(RoleName.building_staff, "CENTRAL")
    staff_with_old_profile = make_user(RoleName.teacher, "CENTRAL", technician=True)
    rid = new_repair(client, make_user())["id"]
    response = assign(client, building, rid, technician_of(db, staff_with_old_profile))
    assert response.status_code == 404


def test_concurrent_status_updates_apply_once(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    building = make_user(RoleName.building_staff, "CENTRAL")
    tech = make_user(RoleName.technician, "CENTRAL")
    rid = new_repair(client, make_user())["id"]
    assign(client, building, rid, technician_of(db, tech))

    def move(_: int) -> int:
        return set_status(client, tech, rid, "in_progress").status_code

    with ThreadPoolExecutor(max_workers=4) as pool:
        codes = sorted(pool.map(move, range(4)))
    assert codes == [200, 409, 409, 409]
    rows = db.scalars(
        select(RepairStatusHistory).where(
            RepairStatusHistory.repair_id == rid, RepairStatusHistory.to_status == "in_progress"
        )
    ).all()
    assert len(rows) == 1


def test_closed_and_rejected_leave_active_lists_but_stay_in_history(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    reporter = make_user()
    building = make_user(RoleName.building_staff, "CENTRAL")
    tech = make_user(RoleName.technician, "CENTRAL")
    done, pending = new_repair(client, reporter), new_repair(client, reporter, title="ก๊อกรั่ว")
    refused = new_repair(client, reporter, title="ขอของ")
    to_pending_review(client, db, building, tech, done["id"])
    set_status(client, building, done["id"], "closed")
    set_status(client, building, refused["id"], "rejected", note="ไม่รับเรื่อง")

    viewer = make_user()
    active = client.get(f"{API}/repairs", headers=auth(viewer)).json()
    assert [p["id"] for p in active["items"]] == [pending["id"]]
    dashboard = client.get(f"{API}/dashboard", headers=auth(viewer)).json()
    assert [p["id"] for p in dashboard["repairs"]] == [pending["id"]]
    closed = client.get(f"{API}/repairs?status=closed", headers=auth(reporter)).json()
    assert [p["id"] for p in closed["items"]] == [done["id"]]
    assert client.get(f"{API}/repairs?mine=true", headers=auth(reporter)).json()["total"] == 3
    history = client.get(f"{API}/me/posts?state=resolved", headers=auth(reporter)).json()
    assert {p["id"] for p in history["items"]} == {done["id"], refused["id"]}
    assert {p["lifecycle"] for p in history["items"]} == {"resolved"}
    assert client.get(f"{API}/repairs/{refused['id']}", headers=auth(reporter)).status_code == 200
    assert (
        client.get(f"{API}/admin/stats", headers=auth(make_user(RoleName.admin, "CENTRAL"))).json()[
            "pending_repairs"
        ]
        == 1
    )


def test_dashboard_repairs_are_ordered_by_priority_then_newest(
    client: TestClient, make_user: UserFactory
) -> None:
    building = make_user(RoleName.building_staff, "CENTRAL")
    reporter = make_user()
    first = new_repair(client, reporter, title="เรื่องแรก")
    second = new_repair(client, reporter, title="เรื่องสอง")
    third = new_repair(client, reporter, title="เรื่องสาม")
    client.patch(
        f"{API}/repairs/{first['id']}/priority", json={"priority": "urgent"}, headers=auth(building)
    )
    client.patch(
        f"{API}/repairs/{second['id']}/priority", json={"priority": "high"}, headers=auth(building)
    )
    dashboard = client.get(f"{API}/dashboard", headers=auth(reporter)).json()
    assert [p["id"] for p in dashboard["repairs"]] == [first["id"], second["id"], third["id"]]
    assert dashboard["recent"] == []  # repairs have their own section


def test_repairs_never_expire_after_24_hours(client: TestClient, make_user: UserFactory) -> None:
    reporter = make_user()
    start = utcnow()
    with time_machine.travel(start - timedelta(days=10), tick=False):
        old = new_repair(client, reporter)
    listing = client.get(f"{API}/repairs", headers=auth(reporter)).json()
    assert [p["id"] for p in listing["items"]] == [old["id"]]
    assert listing["items"][0]["lifecycle"] == "active"


def test_assigned_to_me_and_mine_filters(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    reporter = make_user()
    building = make_user(RoleName.building_staff, "CENTRAL")
    tech = make_user(RoleName.technician, "CENTRAL")
    first = new_repair(client, reporter)
    new_repair(client, make_user(), title="ก๊อกน้ำรั่ว")
    assign(client, building, first["id"], technician_of(db, tech))
    assert client.get(f"{API}/repairs?assigned_to_me=true", headers=auth(tech)).json()["total"] == 1
    assert client.get(f"{API}/repairs?mine=true", headers=auth(reporter)).json()["total"] == 1
    assert client.get(f"{API}/repairs?status=open", headers=auth(reporter)).json()["total"] == 1


def test_technicians_list_for_building_staff_and_admin(
    client: TestClient, make_user: UserFactory
) -> None:
    make_user(RoleName.technician, "CENTRAL")
    make_user(RoleName.teacher, "CENTRAL", technician=True)  # not a technician role
    assert client.get(f"{API}/technicians", headers=auth(make_user())).status_code == 403
    assert (
        client.get(f"{API}/technicians", headers=auth(make_user(RoleName.teacher)))
    ).status_code == 403
    listing = client.get(
        f"{API}/technicians", headers=auth(make_user(RoleName.building_staff, "CENTRAL"))
    ).json()
    assert len(listing) == 1 and listing[0]["user"]["role"] == "technician"
    admin = make_user(RoleName.admin, "CENTRAL")
    assert client.get(f"{API}/technicians", headers=auth(admin)).status_code == 200


def test_repair_validation(client: TestClient, make_user: UserFactory) -> None:
    user = make_user()
    bad = client.post(
        f"{API}/repairs",
        json={"title": "x", "content": "", "location": "a", "latitude": 200},
        headers=auth(user),
    )
    assert bad.status_code == 422
    fields = {d["field"] for d in bad.json()["error"]["details"]}
    assert {"title", "content", "location", "latitude", "attachment_ids"} <= fields


def test_repair_notification_uses_the_same_status_labels_as_the_ui(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    reporter = make_user()
    building = make_user(RoleName.building_staff, "CENTRAL")
    tech = make_user(RoleName.technician, "CENTRAL")
    repair = new_repair(client, reporter)
    assign(client, building, repair["id"], technician_of(db, tech))
    set_status(client, tech, repair["id"], "in_progress")
    set_status(client, tech, repair["id"], "pending_review")
    set_status(client, building, repair["id"], "closed")
    titles = db.scalars(select(Notification.title).where(Notification.user_id == reporter.id)).all()
    for label in ("มอบหมายช่าง", "กำลังดำเนินการ", "รอกองอาคารตรวจสอบ", "ปิดงาน"):
        assert any(t.endswith(label) for t in titles), label
    review = db.scalars(select(Notification.type).where(Notification.user_id == building.id)).all()
    assert "repair.review" in review


# ---------- owner edit / delete rules ----------
def test_owner_edits_but_cannot_delete_a_repair_and_admin_can(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    owner, admin = make_user(), make_user(RoleName.admin, "CENTRAL")
    repair = new_repair(client, owner)
    shown = client.get(f"{API}/repairs/{repair['id']}", headers=auth(owner)).json()
    assert shown["permissions"]["can_edit"] is True
    assert shown["permissions"]["can_delete"] is False
    edit = client.patch(
        f"{API}/posts/{repair['id']}", json={"title": "แก้ไขหัวข้อ"}, headers=auth(owner)
    )
    assert edit.status_code == 200 and edit.json()["title"] == "แก้ไขหัวข้อ"
    assert client.delete(f"{API}/posts/{repair['id']}", headers=auth(owner)).status_code == 403
    seen = client.get(f"{API}/repairs/{repair['id']}", headers=auth(admin)).json()
    assert seen["permissions"]["can_delete"] is True
    assert client.delete(f"{API}/posts/{repair['id']}", headers=auth(admin)).status_code == 204
    db.expire_all()
    row = db.get(Post, repair["id"])
    assert row.status is PostStatus.removed and row.removal_reason is RemovalReason.admin


def test_suspended_users_cannot_create_repairs_or_lost_found(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    from app.models import PostingSuspension

    user = make_user()
    now = utcnow()
    db.add(
        PostingSuspension(
            user_id=user.id,
            starts_at=now - timedelta(hours=1),
            last_day=(now + timedelta(days=1)).date(),
            ends_at=now + timedelta(days=1),
            reason="test",
        )
    )
    db.commit()
    repair = {
        "title": "ท่อแตก",
        "content": "น้ำรั่ว",
        "location": "ICT",
        "attachment_ids": [attachment_id(user)],
    }
    response = client.post(f"{API}/repairs", json=repair, headers=auth(user))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "POSTING_SUSPENDED"
    item = {"title": "กระเป๋าหาย", "content": "สีดำ", "location": "โรงอาหาร", "status": "lost"}
    response = client.post(f"{API}/lost-found", json=item, headers=auth(user))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "POSTING_SUSPENDED"
    body = {
        "type": "general",
        "title": "สวัสดี",
        "content": "x",
        "category_id": category_id(db, "general"),
    }
    assert client.post(f"{API}/posts", json=body, headers=auth(user)).status_code == 403


# ---------- lost & found ----------
def new_item(client: TestClient, user: User, status: str = "lost") -> dict:
    body = {"title": "กระเป๋าสตางค์หาย", "content": "สีดำ", "location": "โรงอาหาร", "status": status}
    response = client.post(f"{API}/lost-found", json=body, headers=auth(user))
    assert response.status_code == 201, response.text
    return response.json()


def test_lost_found_status_rbac(client: TestClient, make_user: UserFactory) -> None:
    owner, stranger = make_user(), make_user()
    staff, admin = make_user(RoleName.teacher, "ICT"), make_user(RoleName.admin, "CENTRAL")
    item = new_item(client, owner)
    assert item["lost_found"]["status"] == "lost"
    assert item["permissions"]["can_update_status"] is True
    for actor in (stranger, staff):
        assert (
            client.patch(
                f"{API}/lost-found/{item['id']}", json={"status": "found"}, headers=auth(actor)
            ).status_code
            == 403
        )
    assert (
        client.patch(
            f"{API}/lost-found/{item['id']}", json={"status": "found"}, headers=auth(owner)
        ).json()["lost_found"]["status"]
        == "found"
    )
    assert (
        client.patch(
            f"{API}/lost-found/{item['id']}", json={"status": "returned"}, headers=auth(admin)
        ).json()["lost_found"]["status"]
        == "returned"
    )


def test_returned_items_leave_the_unresolved_list(
    client: TestClient, make_user: UserFactory
) -> None:
    user = make_user()
    lost, found = new_item(client, user), new_item(client, user, "found")
    client.patch(f"{API}/lost-found/{lost['id']}", json={"status": "returned"}, headers=auth(user))
    unresolved = client.get(f"{API}/lost-found", headers=auth(make_user())).json()
    assert [p["id"] for p in unresolved["items"]] == [found["id"]]
    dashboard = client.get(f"{API}/dashboard", headers=auth(user)).json()
    assert [p["id"] for p in dashboard["lost_found"]] == [found["id"]]
    returned = client.get(f"{API}/lost-found?status=returned", headers=auth(user)).json()
    assert [p["id"] for p in returned["items"]] == [lost["id"]]


def test_lost_found_listing_and_cannot_create_returned(
    client: TestClient, make_user: UserFactory
) -> None:
    user = make_user()
    new_item(client, user)
    new_item(client, user, "found")
    assert client.get(f"{API}/lost-found?status=found", headers=auth(user)).json()["total"] == 1
    bad = {"title": "abc", "content": "x", "location": "ที่ไหน", "status": "returned"}
    assert client.post(f"{API}/lost-found", json=bad, headers=auth(user)).status_code == 422


def test_lost_found_visible_for_7_days_from_creation_and_edits_do_not_reset(
    client: TestClient, make_user: UserFactory
) -> None:
    owner, other = make_user(), make_user()
    start = utcnow()
    with time_machine.travel(start - timedelta(days=7) + timedelta(minutes=1), tick=False):
        edge = new_item(client, owner)
        edited = new_item(client, owner, "found")
        client.patch(
            f"{API}/lost-found/{edited['id']}", json={"location": "ห้องสมุด"}, headers=auth(owner)
        )
    # 7 days minus a minute old: still listed, on the dashboard and the status filters
    shown = client.get(f"{API}/lost-found", headers=auth(other)).json()
    assert {p["id"] for p in shown["items"]} == {edge["id"], edited["id"]}
    dashboard = client.get(f"{API}/dashboard", headers=auth(other)).json()
    assert {p["id"] for p in dashboard["lost_found"]} == {edge["id"], edited["id"]}
    # an edit after the posting date does not extend it
    with time_machine.travel(start + timedelta(minutes=2), tick=False):
        client.patch(
            f"{API}/lost-found/{edited['id']}", json={"location": "อาคาร 2"}, headers=auth(owner)
        )
        assert client.get(f"{API}/lost-found", headers=auth(other)).json()["total"] == 0
        assert client.get(f"{API}/dashboard", headers=auth(other)).json()["lost_found"] == []
        mine = client.get(f"{API}/me/posts?type=lost_found", headers=auth(owner)).json()
        assert {p["lifecycle"] for p in mine["items"]} == {"archived"}


def test_lost_and_found_items_are_archived_after_7_days_and_kept_for_the_owner(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    owner, other = make_user(), make_user()
    start = utcnow()
    with time_machine.travel(start - timedelta(days=7, minutes=1), tick=False):
        stale = new_item(client, owner)
        found_old = new_item(client, owner, "found")  # found items expire too
    with time_machine.travel(start - timedelta(days=6), tick=False):
        recent = new_item(client, owner)

    # hidden at query time even before the worker runs
    listing = client.get(f"{API}/lost-found", headers=auth(other)).json()
    assert {p["id"] for p in listing["items"]} == {recent["id"]}

    assert archive_stale_lost_items(db) == 2
    assert archive_stale_lost_items(db) == 0
    db.expire_all()
    for item in (stale, found_old):
        row = db.get(Post, item["id"])
        assert row.status is PostStatus.removed  # soft delete only — the row is kept
        assert row.removal_reason is RemovalReason.lost_found_expired and row.deleted_at is not None

    assert client.get(f"{API}/lost-found/{stale['id']}", headers=auth(other)).status_code == 404
    mine = client.get(f"{API}/lost-found/{stale['id']}", headers=auth(owner)).json()
    assert mine["lifecycle"] == "archived"
    assert not any(mine["permissions"].values())  # read-only in the history
    archived = client.get(f"{API}/me/posts?state=archived", headers=auth(owner)).json()
    assert {p["id"] for p in archived["items"]} == {stale["id"], found_old["id"]}
    edit = client.patch(
        f"{API}/lost-found/{stale['id']}", json={"status": "found"}, headers=auth(owner)
    )
    assert edit.status_code == 404


def test_returned_items_are_not_archived(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    owner = make_user()
    with time_machine.travel(utcnow() - timedelta(days=10), tick=False):
        item = new_item(client, owner)
        client.patch(
            f"{API}/lost-found/{item['id']}", json={"status": "returned"}, headers=auth(owner)
        )
    assert archive_stale_lost_items(db) == 0


# ---------- urgency: set by building staff / admin, never by the reporter ----------
def test_reporter_cannot_choose_urgency(client: TestClient, make_user: UserFactory) -> None:
    user = make_user()
    body = {
        "title": "ท่อแตก",
        "content": "น้ำรั่ว",
        "location": "ICT 101",
        "priority": "urgent",
        "attachment_ids": [attachment_id(user)],
    }
    assert client.post(f"{API}/repairs", json=body, headers=auth(user)).status_code == 422
    created = new_repair(client, make_user())
    assert created["priority"] == "normal"
    assert created["permissions"]["can_set_priority"] is False


def test_building_staff_and_admin_set_repair_urgency(
    client: TestClient, make_user: UserFactory
) -> None:
    reporter = make_user()
    building = make_user(RoleName.building_staff, "CENTRAL")
    admin = make_user(RoleName.admin, "CENTRAL")
    rid = new_repair(client, reporter)["id"]
    for actor, priority in ((building, "urgent"), (admin, "high")):
        shown = client.get(f"{API}/repairs/{rid}", headers=auth(actor)).json()
        assert shown["permissions"]["can_set_priority"] is True
        response = client.patch(
            f"{API}/repairs/{rid}/priority", json={"priority": priority}, headers=auth(actor)
        )
        assert response.status_code == 200 and response.json()["priority"] == priority
    for actor in (
        reporter,
        make_user(RoleName.technician, "CENTRAL"),
        make_user(RoleName.teacher),
    ):
        denied = client.patch(
            f"{API}/repairs/{rid}/priority", json={"priority": "low"}, headers=auth(actor)
        )
        assert denied.status_code == 403
