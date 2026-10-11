"""Moderation report flow, admin user management, uploads, notifications and SSE plumbing."""

import asyncio
import io
from datetime import timedelta

import pytest
import time_machine
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import utcnow
from app.core.errors import AppError
from app.core.events import broker
from app.core.security import create_stream_ticket
from app.models import (
    Attachment,
    AuditLog,
    Notification,
    Post,
    PostStatus,
    Report,
    ReportStatus,
    RoleName,
)
from app.routes.notifications import _authorize_ticket
from app.services.activity import notify
from app.worker.jobs import cleanup_orphan_uploads
from tests.conftest import API, UserFactory, auth, category_id


def make_post(client: TestClient, db: Session, user) -> dict:
    body = {
        "type": "general",
        "title": "โพสต์ทดสอบ",
        "content": "เนื้อหา",
        "category_id": category_id(db, "general"),
    }
    response = client.post(f"{API}/posts", json=body, headers=auth(user))
    assert response.status_code == 201
    return response.json()


# ---------- reports ----------
def report_post(client: TestClient, post_id: int, reporter, reason: str = "spam") -> dict:
    response = client.post(
        f"{API}/reports", json={"post_id": post_id, "reason": reason}, headers=auth(reporter)
    )
    assert response.status_code == 201, response.text
    return response.json()


def act(client: TestClient, admin, report_id: int, status: str, **extra: object):
    return client.patch(
        f"{API}/reports/{report_id}", json={"status": status, **extra}, headers=auth(admin)
    )


def test_remove_content_soft_deletes_closes_siblings_and_notifies(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    author, reporter, second_reporter = make_user(), make_user(), make_user()
    admin = make_user(RoleName.admin, "CENTRAL")
    post = make_post(client, db, author)
    report = report_post(client, post["id"], reporter, "harassment")
    other = report_post(client, post["id"], second_reporter)
    assert report["status"] == "reported"

    response = act(client, admin, report["id"], "content_removed", note="ละเมิดกฎ")
    assert response.status_code == 200, response.text
    final = response.json()
    assert final["post"]["status"] == "removed"
    assert [a["to_status"] for a in final["actions"]] == ["content_removed"]
    assert final["actions"][0]["note"] == "ละเมิดกฎ"

    assert client.get(f"{API}/posts/{post['id']}", headers=auth(reporter)).status_code == 404
    assert db.get(Post, post["id"]).status is PostStatus.removed  # soft delete, row kept
    sibling = client.get(f"{API}/reports?status=content_removed", headers=auth(admin)).json()
    assert {r["id"] for r in sibling["items"]} == {report["id"], other["id"]}
    types = set(
        db.scalars(select(Notification.type).where(Notification.user_id == author.id)).all()
    )
    assert "post.removed" in types
    assert db.scalar(select(AuditLog.id).where(AuditLog.action == "post.delete")) is not None
    # both reporters are told, each with a link to their own report
    for who, rep in ((reporter, report), (second_reporter, other)):
        note = db.scalars(
            select(Notification).where(
                Notification.user_id == who.id, Notification.type == "report.updated"
            )
        ).one()
        assert note.link == f"/reports/{rep['id']}"
    # the report keeps its history after the post is gone
    mine = client.get(f"{API}/reports/{report['id']}", headers=auth(reporter)).json()
    assert mine["post"]["status"] == "removed" and mine["post"]["id"] == post["id"]


def test_dismiss_closes_without_removing_and_notifies(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin, reporter = make_user(RoleName.admin, "CENTRAL"), make_user()
    post = make_post(client, db, make_user())
    report = report_post(client, post["id"], reporter)
    done = act(client, admin, report["id"], "dismissed")
    assert done.status_code == 200 and done.json()["status"] == "dismissed"
    assert client.get(f"{API}/posts/{post['id']}", headers=auth(admin)).status_code == 200
    note = db.scalars(
        select(Notification).where(
            Notification.user_id == reporter.id, Notification.type == "report.updated"
        )
    ).one()
    assert "ปิดรายงานแล้ว (ไม่ลบเนื้อหา)" in note.title
    assert note.link == f"/reports/{report['id']}"
    # closed reports are final
    for target in ("content_removed", "dismissed", "under_review"):
        assert act(client, admin, report["id"], target).status_code == 409


@pytest.mark.parametrize("legacy", ["under_review", "upheld"])
def test_both_actions_work_from_legacy_open_statuses(
    client: TestClient, db: Session, make_user: UserFactory, legacy: str
) -> None:
    admin = make_user(RoleName.admin, "CENTRAL")
    post = make_post(client, db, make_user())
    report = report_post(client, post["id"], make_user())
    row = db.get(Report, report["id"])
    row.status = ReportStatus(legacy)  # created before the simplification
    db.commit()
    assert act(client, admin, report["id"], "dismissed").status_code == 200
    other_post = make_post(client, db, make_user())
    second = report_post(client, other_post["id"], make_user())
    db.get(Report, second["id"]).status = ReportStatus(legacy)
    db.commit()
    assert act(client, admin, second["id"], "content_removed").status_code == 200


def test_reports_mine_lists_only_own_reports_with_status(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin = make_user(RoleName.admin, "CENTRAL")
    me, someone = make_user(), make_user()
    first = make_post(client, db, make_user())
    second = make_post(client, db, make_user())
    third = make_post(client, db, make_user())
    mine_a = report_post(client, first["id"], me)
    mine_b = report_post(client, second["id"], me)
    report_post(client, third["id"], someone)
    act(client, admin, mine_b["id"], "dismissed")

    listing = client.get(f"{API}/reports/mine", headers=auth(me)).json()
    assert {"items", "total", "page", "page_size"} <= set(listing)
    assert [r["id"] for r in listing["items"]] == [mine_b["id"], mine_a["id"]]  # newest first
    assert [r["status"] for r in listing["items"]] == ["dismissed", "reported"]
    assert (
        client.get(f"{API}/reports/mine?page=1&page_size=1", headers=auth(me)).json()["total"] == 2
    )
    assert client.get(f"{API}/reports/mine", headers=auth(someone)).json()["total"] == 1
    assert client.get(f"{API}/reports/mine").status_code == 401


def test_report_detail_for_owner_or_admin_only(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin, owner, stranger = make_user(RoleName.admin, "CENTRAL"), make_user(), make_user()
    post = make_post(client, db, make_user())
    report = report_post(client, post["id"], owner)
    for who in (owner, admin):
        shown = client.get(f"{API}/reports/{report['id']}", headers=auth(who))
        assert shown.status_code == 200 and shown.json()["id"] == report["id"]
    hidden = client.get(f"{API}/reports/{report['id']}", headers=auth(stranger))
    assert hidden.status_code == 404  # no existence leak
    assert client.get(f"{API}/reports/999999", headers=auth(owner)).status_code == 404
    assert client.get(f"{API}/reports/{report['id']}").status_code == 401


def test_report_rules(client: TestClient, db: Session, make_user: UserFactory) -> None:
    author, reporter, staff = make_user(), make_user(), make_user(RoleName.teacher)
    post = make_post(client, db, author)
    body = {"post_id": post["id"], "reason": "spam"}
    assert (
        client.post(f"{API}/reports", json=body, headers=auth(author)).status_code == 409
    )  # own post
    assert client.post(f"{API}/reports", json=body, headers=auth(reporter)).status_code == 201
    duplicate = client.post(f"{API}/reports", json=body, headers=auth(reporter))
    assert duplicate.status_code == 409 and duplicate.json()["error"]["code"] == "DUPLICATE_REPORT"
    # moderation is admin-only (ADR-002)
    assert client.get(f"{API}/reports", headers=auth(staff)).status_code == 403
    assert (
        client.patch(
            f"{API}/reports/1", json={"status": "dismissed"}, headers=auth(staff)
        ).status_code
        == 403
    )


# ---------- admin ----------
def test_admin_endpoints_are_admin_only(client: TestClient, make_user: UserFactory) -> None:
    for role in (r for r in RoleName if r is not RoleName.admin):
        headers = auth(make_user(role))
        assert client.get(f"{API}/admin/users", headers=headers).status_code == 403
        assert client.get(f"{API}/admin/stats", headers=headers).status_code == 403
        assert (
            client.patch(
                f"{API}/admin/users/1", json={"role": "admin"}, headers=headers
            ).status_code
            == 403
        )


def test_admin_grants_student_club_with_history_and_token_revocation(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin, user = make_user(RoleName.admin, "CENTRAL"), make_user()
    old_headers = auth(user)
    updated = client.patch(
        f"{API}/admin/users/{user.id}", json={"role": "student_club"}, headers=auth(admin)
    )
    assert updated.status_code == 200 and updated.json()["role"] == "student_club"
    assert client.get(f"{API}/auth/me", headers=old_headers).status_code == 401
    revoked = client.patch(
        f"{API}/admin/users/{user.id}", json={"role": "student"}, headers=auth(admin)
    )
    assert revoked.status_code == 200
    history = db.scalars(
        select(AuditLog.meta)
        .where(AuditLog.action == "user.role_change", AuditLog.entity_id == user.id)
        .order_by(AuditLog.id)
    ).all()
    assert history == [
        {"from": "student", "to": "student_club"},
        {"from": "student_club", "to": "student"},
    ]


def test_users_cannot_assign_roles_to_themselves(
    client: TestClient, make_user: UserFactory
) -> None:
    user = make_user()
    for body in ({"role": "student_club"}, {"role": "admin"}):
        assert client.patch(f"{API}/auth/me", json=body, headers=auth(user)).status_code == 422
        assert (
            client.patch(f"{API}/admin/users/{user.id}", json=body, headers=auth(user)).status_code
            == 403
        )
    assert client.get(f"{API}/auth/me", headers=auth(user)).json()["role"] == "student"


@pytest.mark.parametrize("role", ["teacher"])
def test_teacher_needs_a_faculty(client: TestClient, make_user: UserFactory, role: str) -> None:
    admin, user = make_user(RoleName.admin, "CENTRAL"), make_user()
    client.patch(f"{API}/admin/users/{user.id}", json={"faculty_id": None}, headers=auth(admin))
    refused = client.patch(f"{API}/admin/users/{user.id}", json={"role": role}, headers=auth(admin))
    assert refused.status_code == 422


def test_admin_guards(client: TestClient, db: Session, make_user: UserFactory) -> None:
    admin = make_user(RoleName.admin, "CENTRAL")
    assert (
        client.patch(
            f"{API}/admin/users/{admin.id}", json={"role": "student"}, headers=auth(admin)
        ).status_code
        == 409
    )
    assert (
        client.patch(
            f"{API}/admin/users/{admin.id}", json={"is_active": False}, headers=auth(admin)
        ).status_code
        == 409
    )
    student = make_user()
    assert (
        client.patch(
            f"{API}/admin/users/{student.id}",
            json={"technician_specialty": "ไฟฟ้า"},
            headers=auth(admin),
        ).status_code
        == 422
    )
    deactivated = client.patch(
        f"{API}/admin/users/{student.id}", json={"is_active": False}, headers=auth(admin)
    ).json()
    assert deactivated["is_active"] is False
    assert db.scalar(select(AuditLog.id).where(AuditLog.action == "user.update")) is not None


def test_make_technician_and_stats(client: TestClient, make_user: UserFactory) -> None:
    admin, staff = (
        make_user(RoleName.admin, "CENTRAL"),
        make_user(RoleName.teacher, "CENTRAL"),
    )
    body = {"role": "technician", "technician_specialty": "ประปา", "technician_zone": "โซน A"}
    assert (
        client.patch(f"{API}/admin/users/{staff.id}", json=body, headers=auth(admin)).json()[
            "is_technician"
        ]
        is True
    )
    users = client.get(f"{API}/admin/users?role=technician", headers=auth(admin)).json()
    assert users["total"] == 1
    back = client.patch(
        f"{API}/admin/users/{staff.id}", json={"role": "teacher"}, headers=auth(admin)
    ).json()
    assert back["is_technician"] is False
    stats = client.get(f"{API}/admin/stats", headers=auth(admin)).json()
    assert stats == {"users_total": 2, "posts_today": 0, "open_reports": 0, "pending_repairs": 0}


# ---------- uploads ----------
def image_bytes(fmt: str = "JPEG", with_gps: bool = False) -> bytes:
    img = Image.new("RGB", (64, 48), "purple")
    out = io.BytesIO()
    if with_gps:
        exif = Image.Exif()
        exif[0x010F] = "SecretPhoneMaker"  # Make
        exif[0x8825] = {2: (19.0, 1.0, 50.0)}  # GPSInfo
        img.save(out, format=fmt, exif=exif)
    else:
        img.save(out, format=fmt)
    return out.getvalue()


def test_upload_strips_exif_and_serves_file(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    user = make_user()
    raw = image_bytes(with_gps=True)
    assert b"SecretPhoneMaker" in raw
    response = client.post(
        f"{API}/uploads", files={"file": ("photo.jpg", raw, "image/jpeg")}, headers=auth(user)
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["mime_type"] == "image/jpeg"
    served = client.get(body["url"].replace("http://testserver", ""))
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/jpeg"
    assert b"SecretPhoneMaker" not in served.content
    assert not Image.open(io.BytesIO(served.content)).getexif()

    post = client.post(
        f"{API}/posts",
        json={
            "type": "general",
            "title": "มีรูป",
            "content": "x",
            "category_id": category_id(db, "general"),
            "attachment_ids": [body["id"]],
        },
        headers=auth(user),
    ).json()
    assert [a["id"] for a in post["attachments"]] == [body["id"]]


def test_upload_rejects_spoofed_and_oversized_files(
    client: TestClient, make_user: UserFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers = auth(make_user())
    spoofed = client.post(
        f"{API}/uploads",
        files={"file": ("x.png", b"<?php echo 1; ?>", "image/png")},
        headers=headers,
    )
    assert spoofed.status_code == 415
    gif = io.BytesIO()
    Image.new("RGB", (4, 4)).save(gif, format="GIF")
    assert (
        client.post(
            f"{API}/uploads",
            files={"file": ("x.gif", gif.getvalue(), "image/gif")},
            headers=headers,
        ).status_code
        == 415
    )
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "max_upload_bytes", 100)
    big = client.post(
        f"{API}/uploads", files={"file": ("x.jpg", image_bytes(), "image/jpeg")}, headers=headers
    )
    assert big.status_code == 413


def test_cannot_attach_someone_elses_upload(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    owner, thief = make_user(), make_user()
    upload = client.post(
        f"{API}/uploads",
        files={"file": ("a.png", image_bytes("PNG"), "image/png")},
        headers=auth(owner),
    ).json()
    body = {
        "type": "general",
        "title": "ขโมยรูป",
        "content": "x",
        "category_id": category_id(db, "general"),
        "attachment_ids": [upload["id"]],
    }
    assert client.post(f"{API}/posts", json=body, headers=auth(thief)).status_code == 422


def test_orphan_uploads_are_cleaned_up(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    client.post(
        f"{API}/uploads",
        files={"file": ("a.webp", image_bytes("WEBP"), "image/webp")},
        headers=auth(make_user()),
    )
    assert cleanup_orphan_uploads(db) == 0  # too new
    with time_machine.travel(utcnow() + timedelta(hours=25), tick=False):
        assert cleanup_orphan_uploads(db) == 1
    assert db.scalars(select(Attachment)).all() == []


def test_file_route_rejects_traversal(client: TestClient) -> None:
    assert client.get(f"{API}/files/..%2F..%2Fetc%2Fpasswd").status_code == 404
    assert client.get(f"{API}/files/missing.jpg").status_code == 404


# ---------- notifications & SSE ----------
def test_notifications_read_flow(client: TestClient, db: Session, make_user: UserFactory) -> None:
    user, other = make_user(), make_user()
    notify(db, [user.id, other.id], "test", "สวัสดี")
    db.commit()
    headers = auth(user)
    assert client.get(f"{API}/notifications/unread-count", headers=headers).json() == {"count": 1}
    item = client.get(f"{API}/notifications", headers=headers).json()["items"][0]
    assert (
        client.patch(f"{API}/notifications/{item['id']}/read", headers=auth(other)).status_code
        == 404
    )
    assert (
        client.patch(f"{API}/notifications/{item['id']}/read", headers=headers).json()["read_at"]
        is not None
    )
    notify(db, [user.id], "test", "อีกครั้ง")
    db.commit()
    assert client.post(f"{API}/notifications/read-all", headers=headers).status_code == 204
    assert client.get(f"{API}/notifications?unread_only=true", headers=headers).json()["total"] == 0


def test_stream_ticket_is_single_use_and_typed(client: TestClient, make_user: UserFactory) -> None:
    user = make_user()
    ticket = client.post(f"{API}/stream/ticket", headers=auth(user)).json()
    assert ticket["expires_in"] == 60
    assert _authorize_ticket(ticket["ticket"]) == user.id
    with pytest.raises(AppError):
        _authorize_ticket(ticket["ticket"])
    access = auth(user)["Authorization"].split()[1]
    with pytest.raises(AppError):
        _authorize_ticket(access)  # access tokens are not stream tickets
    expired, _, _ = create_stream_ticket(user.id)
    with time_machine.travel(utcnow() + timedelta(seconds=61), tick=False), pytest.raises(AppError):
        _authorize_ticket(expired)


def test_events_are_published_only_after_commit(db: Session, make_user: UserFactory) -> None:
    user = make_user()
    loop = asyncio.new_event_loop()
    broker.bind_loop(loop)
    queue = broker.subscribe(user.id)
    try:
        notify(db, [user.id], "test", "rolled back")
        db.rollback()
        notify(db, [user.id], "test", "committed")
        db.commit()
        loop.run_until_complete(asyncio.sleep(0))
        messages = []
        while not queue.empty():
            messages.append(queue.get_nowait())
        assert len(messages) == 1 and "committed" in messages[0]
    finally:
        broker.unsubscribe(user.id, queue)
        loop.close()


def test_admin_can_clear_faculty_but_staff_still_requires_one(
    client: TestClient, make_user: UserFactory
) -> None:
    admin, student, staff = (
        make_user(RoleName.admin, "CENTRAL"),
        make_user(),
        make_user(RoleName.teacher),
    )
    cleared = client.patch(
        f"{API}/admin/users/{student.id}", json={"faculty_id": None}, headers=auth(admin)
    )
    assert cleared.status_code == 200 and cleared.json()["faculty"] is None
    # omitting faculty_id leaves it unchanged
    unchanged = client.patch(
        f"{API}/admin/users/{staff.id}", json={"is_active": True}, headers=auth(admin)
    )
    assert unchanged.json()["faculty"]["code"] == "ICT"
    refused = client.patch(
        f"{API}/admin/users/{staff.id}", json={"faculty_id": None}, headers=auth(admin)
    )
    assert refused.status_code == 422


def test_admin_can_edit_a_students_post_that_has_photos(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    student, staff = make_user(faculty="ICT"), make_user(RoleName.admin, "CENTRAL")
    upload = client.post(
        f"{API}/uploads",
        files={"file": ("a.png", image_bytes("PNG"), "image/png")},
        headers=auth(student),
    ).json()
    body = {
        "type": "general",
        "title": "มีรูป",
        "content": "x",
        "category_id": category_id(db, "general"),
        "attachment_ids": [upload["id"]],
    }
    post = client.post(f"{API}/posts", json=body, headers=auth(student)).json()
    edit = client.patch(
        f"{API}/posts/{post['id']}",
        json={"title": "แก้โดยบุคลากร", "attachment_ids": [upload["id"]]},
        headers=auth(staff),
    )
    assert edit.status_code == 200, edit.text
    assert [a["id"] for a in edit.json()["attachments"]] == [upload["id"]]
