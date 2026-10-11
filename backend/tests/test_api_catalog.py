"""Admin catalog of faculties / programmes, admin user filters and programme assignment."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import utcnow
from app.models import AuditLog, Faculty, PostingSuspension, Program, RoleName
from tests.conftest import API, UserFactory, auth, faculty_id, program_id


def admin_of(make_user: UserFactory):
    return make_user(RoleName.admin, "CENTRAL")


def create_faculty(client: TestClient, admin, code: str = "TESTF1", **extra: object):
    body = {"code": code, "name_th": "คณะทดสอบ", "name_en": "Test School", **extra}
    return client.post(f"{API}/admin/faculties", json=body, headers=auth(admin))


def create_program(client: TestClient, admin, faculty: int, code: str = "TEST-P1", **extra):
    body = {"faculty_id": faculty, "code": code, "name_th": "สาขาทดสอบ", **extra}
    return client.post(f"{API}/admin/programs", json=body, headers=auth(admin))


@pytest.mark.parametrize("role", [r for r in RoleName if r is not RoleName.admin])
def test_catalog_admin_endpoints_are_admin_only(
    client: TestClient, make_user: UserFactory, role: RoleName
) -> None:
    headers = auth(make_user(role))
    assert client.get(f"{API}/admin/faculties", headers=headers).status_code == 403
    body = {"code": "TESTX", "name_th": "ไม่ได้"}
    assert client.post(f"{API}/admin/faculties", json=body, headers=headers).status_code == 403
    assert client.patch(f"{API}/admin/faculties/1", json={}, headers=headers).status_code == 403
    assert client.post(f"{API}/admin/programs", json={}, headers=headers).status_code == 403
    assert client.patch(f"{API}/admin/programs/1", json={}, headers=headers).status_code == 403


def test_admin_lists_every_faculty_with_all_programs(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin = admin_of(make_user)
    faculty = create_faculty(client, admin, is_active=False).json()
    retired = create_program(client, admin, faculty["id"], is_active=False).json()
    listing = client.get(f"{API}/admin/faculties", headers=auth(admin)).json()
    by_code = {f["code"]: f for f in listing}
    assert "ICT" in by_code and "TESTF1" in by_code
    assert by_code["TESTF1"]["is_active"] is False  # inactive faculties are listed here
    assert [p["id"] for p in by_code["TESTF1"]["programs"]] == [retired["id"]]
    assert by_code["TESTF1"]["programs"][0]["is_active"] is False
    # ... but not in the public pickers
    public = {f["code"] for f in client.get(f"{API}/faculties").json()}
    assert "TESTF1" not in public and "ICT" in public


def test_create_faculty_and_program_with_audit_and_unique_codes(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin = admin_of(make_user)
    created = create_faculty(client, admin)
    assert created.status_code == 201, created.text
    faculty = created.json()
    assert faculty["is_active"] is True and faculty["programs"] == []
    assert create_faculty(client, admin).status_code == 409  # code is unique

    program = create_program(client, admin, faculty["id"], name_en="Test Programme")
    assert program.status_code == 201, program.text
    assert program.json()["faculty_id"] == faculty["id"] and program.json()["is_active"] is True
    assert create_program(client, admin, faculty["id"]).status_code == 409
    assert create_program(client, admin, 999999, code="TEST-P2").status_code == 404

    logs = db.scalars(select(AuditLog).where(AuditLog.entity.in_(["faculty", "program"]))).all()
    assert {(log.entity, log.action) for log in logs} == {
        ("faculty", "faculty.create"),
        ("program", "program.create"),
    }
    assert all(log.actor_id == admin.id and log.meta["after"] for log in logs)


def test_rename_keeps_ids_and_retire_never_deletes(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin = admin_of(make_user)
    faculty = create_faculty(client, admin).json()
    program = create_program(client, admin, faculty["id"]).json()
    student = make_user(program="ICT-CS")
    student.faculty_id, student.program_id = faculty["id"], program["id"]
    db.commit()

    renamed = client.patch(
        f"{API}/admin/faculties/{faculty['id']}",
        json={"name_th": "ชื่อใหม่", "name_en": None},
        headers=auth(admin),
    )
    assert renamed.status_code == 200
    assert renamed.json()["id"] == faculty["id"] and renamed.json()["name_th"] == "ชื่อใหม่"
    assert renamed.json()["name_en"] is None
    prog = client.patch(
        f"{API}/admin/programs/{program['id']}", json={"name_th": "สาขาใหม่"}, headers=auth(admin)
    )
    assert prog.status_code == 200 and prog.json()["id"] == program["id"]

    retired_program = client.patch(
        f"{API}/admin/programs/{program['id']}", json={"is_active": False}, headers=auth(admin)
    )
    retired_faculty = client.patch(
        f"{API}/admin/faculties/{faculty['id']}", json={"is_active": False}, headers=auth(admin)
    )
    assert retired_program.json()["is_active"] is False
    assert retired_faculty.json()["is_active"] is False
    # rows are kept and stay attached to the existing user (shown on their profile)
    db.expire_all()
    assert db.get(Faculty, faculty["id"]) is not None and db.get(Program, program["id"]) is not None
    me = client.get(f"{API}/auth/me", headers=auth(student)).json()
    assert me["faculty"]["id"] == faculty["id"] and me["faculty"]["is_active"] is False
    assert me["program"]["id"] == program["id"] and me["program"]["is_active"] is False
    # ... but nobody can newly pick them
    public = {f["code"] for f in client.get(f"{API}/faculties").json()}
    assert "TESTF1" not in public
    picked = client.patch(
        f"{API}/auth/me",
        json={"faculty_id": faculty["id"], "program_id": program["id"]},
        headers=auth(make_user()),
    )
    assert picked.status_code == 422
    # retiring can be undone
    back = client.patch(
        f"{API}/admin/faculties/{faculty['id']}", json={"is_active": True}, headers=auth(admin)
    )
    assert back.json()["is_active"] is True
    updates = db.scalars(select(AuditLog).where(AuditLog.action == "faculty.update")).all()
    assert updates and set(updates[0].meta) == {"before", "after"}
    assert updates[0].meta["before"]["name_th"] == "คณะทดสอบ"
    assert updates[0].meta["after"]["name_th"] == "ชื่อใหม่"
    assert db.scalars(select(AuditLog).where(AuditLog.action == "program.update")).all()


def test_no_op_patch_writes_no_audit_row(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin = admin_of(make_user)
    faculty = create_faculty(client, admin).json()
    same = client.patch(
        f"{API}/admin/faculties/{faculty['id']}", json={"is_active": True}, headers=auth(admin)
    )
    assert same.status_code == 200
    assert db.scalars(select(AuditLog).where(AuditLog.action == "faculty.update")).all() == []
    assert (
        client.patch(f"{API}/admin/faculties/999999", json={}, headers=auth(admin)).status_code
        == 404
    )
    assert (
        client.patch(f"{API}/admin/programs/999999", json={}, headers=auth(admin)).status_code
        == 404
    )


def test_program_can_move_faculty_only_when_unused(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin = admin_of(make_user)
    first = create_faculty(client, admin, "TESTF1").json()
    second = create_faculty(client, admin, "TESTF2").json()
    free = create_program(client, admin, first["id"], "TEST-FREE").json()
    used = create_program(client, admin, first["id"], "TEST-USED").json()
    student = make_user()
    student.faculty_id, student.program_id = first["id"], used["id"]
    db.commit()
    moved = client.patch(
        f"{API}/admin/programs/{free['id']}", json={"faculty_id": second["id"]}, headers=auth(admin)
    )
    assert moved.status_code == 200 and moved.json()["faculty_id"] == second["id"]
    blocked = client.patch(
        f"{API}/admin/programs/{used['id']}", json={"faculty_id": second["id"]}, headers=auth(admin)
    )
    assert blocked.status_code == 409


# ---------- admin users: programme + suspension filter ----------
def test_admin_creates_and_updates_users_with_a_program(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin = admin_of(make_user)
    created = client.post(
        f"{API}/admin/users",
        json={
            "email": "ict.teacher@up.ac.th",
            "display_name": "อาจารย์ ICT",
            "role": "teacher",
            "faculty_id": faculty_id(db, "ICT"),
            "program_id": program_id(db, "ICT-IT"),
        },
        headers=auth(admin),
    )
    assert created.status_code == 201, created.text
    assert created.json()["program"]["code"] == "ICT-IT" and "year_of_study" not in created.json()
    user_id = created.json()["id"]
    # moving the faculty without naming a programme clears the programme that no longer fits
    moved = client.patch(
        f"{API}/admin/users/{user_id}",
        json={"faculty_id": faculty_id(db, "ENG")},
        headers=auth(admin),
    )
    assert moved.status_code == 200 and moved.json()["program"] is None
    # an explicit mismatch is refused
    bad = client.patch(
        f"{API}/admin/users/{user_id}",
        json={"program_id": program_id(db, "ICT-CS")},
        headers=auth(admin),
    )
    assert bad.status_code == 422
    good = client.patch(
        f"{API}/admin/users/{user_id}",
        json={"program_id": program_id(db, "ENG-ME")},
        headers=auth(admin),
    )
    assert good.status_code == 200 and good.json()["program"]["code"] == "ENG-ME"
    unknown = client.patch(
        f"{API}/admin/users/{user_id}", json={"program_id": 999999}, headers=auth(admin)
    )
    assert unknown.status_code == 422
    assert (
        client.patch(
            f"{API}/admin/users/{user_id}", json={"year_of_study": 1}, headers=auth(admin)
        ).status_code
        == 422
    )


def test_admin_users_suspended_filter_and_suspension_details(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin = admin_of(make_user)
    suspended, lifted, normal = make_user(), make_user(), make_user()
    now = utcnow()
    for user, ends, lifted_at in (
        (suspended, now + timedelta(hours=10), None),
        (lifted, now + timedelta(hours=10), now - timedelta(hours=1)),
    ):
        db.add(
            PostingSuspension(
                user_id=user.id,
                starts_at=now - timedelta(hours=2),
                last_day=ends.date(),
                ends_at=ends,
                reason="test",
                lifted_at=lifted_at,
            )
        )
        if lifted_at is None:
            user.posting_suspended_until = ends
    db.commit()

    everyone = client.get(f"{API}/admin/users", headers=auth(admin)).json()
    assert everyone["total"] == 4
    only = client.get(f"{API}/admin/users?suspended=true", headers=auth(admin)).json()
    assert [u["id"] for u in only["items"]] == [suspended.id]
    item = only["items"][0]
    assert item["posting_suspended_until"] is not None
    assert set(item["suspension"]) == {"starts_at", "last_day", "ends_at"}
    assert item["suspension"]["last_day"] == (now + timedelta(hours=10)).date().isoformat()
    others = client.get(f"{API}/admin/users?suspended=false", headers=auth(admin)).json()
    assert {u["id"] for u in others["items"]} == {admin.id, lifted.id, normal.id}
    normal_row = next(u for u in everyone["items"] if u["id"] == normal.id)
    assert normal_row["suspension"] is None


# ---------- admin-only faculty (university central / facilities) ----------
def test_public_listing_hides_admin_only_faculty_but_admin_listing_flags_it(
    client: TestClient, make_user: UserFactory
) -> None:
    public = {f["code"]: f for f in client.get(f"{API}/faculties").json()}
    assert "CENTRAL" not in public and "ICT" in public
    assert public["ICT"]["admin_only"] is False
    admin = admin_of(make_user)
    listing = {
        f["code"]: f for f in client.get(f"{API}/admin/faculties", headers=auth(admin)).json()
    }
    assert listing["CENTRAL"]["admin_only"] is True and listing["CENTRAL"]["programs"]
    assert listing["ICT"]["admin_only"] is False


def test_register_rejects_admin_only_faculty(client: TestClient, db: Session) -> None:
    body = {
        "email": "central1@up.ac.th",
        "password": "Secret123",
        "display_name": "ส่วนกลาง",
        "faculty_id": faculty_id(db, "CENTRAL"),
        "program_id": program_id(db, "CENTRAL-STAFF"),
    }
    res = client.post(f"{API}/auth/register", json=body)
    assert res.status_code == 422
    assert res.json()["error"]["details"][0]["field"] == "faculty_id"


def test_onboarding_rejects_admin_only_faculty(
    client: TestClient, make_user: UserFactory, db: Session
) -> None:
    user = make_user(RoleName.student, "ICT", onboarding=True)
    res = client.post(
        f"{API}/auth/onboarding",
        json={
            "faculty_id": faculty_id(db, "CENTRAL"),
            "program_id": program_id(db, "CENTRAL-STAFF"),
        },
        headers=auth(user),
    )
    assert res.status_code == 422
    assert res.json()["error"]["details"][0]["field"] == "faculty_id"


def test_profile_cannot_switch_to_admin_only_faculty(
    client: TestClient, make_user: UserFactory, db: Session
) -> None:
    user = make_user(RoleName.student, "ICT", program="ICT-CS")
    res = client.patch(
        f"{API}/auth/me",
        json={
            "faculty_id": faculty_id(db, "CENTRAL"),
            "program_id": program_id(db, "CENTRAL-STAFF"),
        },
        headers=auth(user),
    )
    assert res.status_code == 422
    assert res.json()["error"]["details"][0]["field"] == "faculty_id"
    # a central programme under the current (ordinary) faculty is refused too
    res = client.patch(
        f"{API}/auth/me", json={"program_id": program_id(db, "CENTRAL-STAFF")}, headers=auth(user)
    )
    assert res.status_code == 422


def test_admin_assigns_admin_only_faculty_and_holder_keeps_saving_profile(
    client: TestClient, make_user: UserFactory, db: Session
) -> None:
    admin = admin_of(make_user)
    target = make_user(RoleName.student, "ICT", program="ICT-CS")
    central, staff = faculty_id(db, "CENTRAL"), program_id(db, "CENTRAL-STAFF")
    res = client.patch(
        f"{API}/admin/users/{target.id}",
        json={"faculty_id": central, "program_id": staff},
        headers=auth(admin),
    )
    assert res.status_code == 200, res.text
    assert res.json()["faculty"]["code"] == "CENTRAL"
    # the holder saves name + unchanged faculty/programme without a 422 ...
    own = client.patch(
        f"{API}/auth/me",
        json={"display_name": "ชื่อใหม่", "faculty_id": central, "program_id": staff},
        headers=auth(target),
    )
    assert own.status_code == 200, own.text
    assert own.json()["faculty"]["code"] == "CENTRAL"
    # ... but cannot go back to an ordinary faculty without a programme of it
    assert (
        client.patch(
            f"{API}/auth/me", json={"faculty_id": faculty_id(db, "ICT")}, headers=auth(target)
        ).status_code
        == 422
    )
