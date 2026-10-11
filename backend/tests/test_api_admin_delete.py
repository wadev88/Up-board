"""Admin account management: disable / re-enable and soft delete (history is kept)."""

from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import utcnow
from app.models import (
    AuditLog,
    Notification,
    Post,
    PostStatus,
    RefreshToken,
    RemovalReason,
    Report,
    ReportStatus,
    RoleName,
    User,
)
from tests.conftest import API, PASSWORD, UserFactory, auth, category_id, faculty_id, program_id
from tests.test_api_moderation_admin import report_post
from tests.test_api_posts import new_announcement, new_event
from tests.test_api_repairs import assign, new_repair, technician_of


def patch_user(client: TestClient, admin: User, user_id: int, **body: object):
    return client.patch(f"{API}/admin/users/{user_id}", json=body, headers=auth(admin))


def delete_user(client: TestClient, admin: User, user_id: int):
    return client.delete(f"{API}/admin/users/{user_id}", headers=auth(admin))


def listed_ids(client: TestClient, admin: User) -> set[int]:
    response = client.get(f"{API}/admin/users?page_size=100", headers=auth(admin))
    assert response.status_code == 200
    return {u["id"] for u in response.json()["items"]}


def login(client: TestClient, email: str):
    return client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})


# ---------- enable / disable ----------
def test_disable_blocks_login_and_api_and_reenable_restores(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin, user = make_user(RoleName.admin, "CENTRAL"), make_user()
    assert login(client, user.email).status_code == 200
    old_headers = auth(user)
    assert client.get(f"{API}/auth/me", headers=old_headers).status_code == 200

    response = patch_user(client, admin, user.id, is_active=False)
    assert response.status_code == 200 and response.json()["is_active"] is False
    assert client.get(f"{API}/auth/me", headers=old_headers).status_code == 401  # JWT revoked
    db.expire_all()
    tokens = db.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id)).all()
    assert tokens and all(t.revoked_at is not None for t in tokens)
    blocked = login(client, user.email)
    assert blocked.status_code == 403 and blocked.json()["error"]["code"] == "ACCOUNT_DISABLED"

    again = patch_user(client, admin, user.id, is_active=True)
    assert again.status_code == 200 and again.json()["is_active"] is True
    assert login(client, user.email).status_code == 200


def test_disabled_account_with_a_valid_token_gets_403(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin, user = make_user(RoleName.admin, "CENTRAL"), make_user()
    user.is_active = False  # the token still carries the current token_version
    db.commit()
    response = client.get(f"{API}/auth/me", headers=auth(user))
    assert response.status_code == 403 and response.json()["error"]["code"] == "ACCOUNT_DISABLED"
    assert user.id in listed_ids(client, admin)  # disabled accounts stay in the admin list


def test_admin_cannot_disable_themselves(client: TestClient, make_user: UserFactory) -> None:
    admin = make_user(RoleName.admin, "CENTRAL")
    assert patch_user(client, admin, admin.id, is_active=False).status_code == 409


# ---------- soft delete ----------
def test_delete_is_soft_frees_email_and_keeps_posts(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin, user, viewer = make_user(RoleName.admin, "CENTRAL"), make_user(), make_user()
    email, user_id = user.email, user.id
    post = client.post(
        f"{API}/posts",
        json={
            "type": "general",
            "title": "โพสต์เก่า",
            "content": "เนื้อหา",
            "category_id": category_id(db, "general"),
        },
        headers=auth(user),
    ).json()
    assert login(client, email).status_code == 200
    old_headers = auth(user)

    response = delete_user(client, admin, user_id)
    assert response.status_code == 204, response.text

    db.expire_all()
    row = db.get(User, user_id)
    assert row is not None and row.deleted_at is not None and row.deleted_by == admin.id
    assert row.is_active is False and row.password_hash is None
    assert row.supabase_user_id is None and row.email == f"deleted-{user_id}@deleted.invalid"
    tokens = db.scalars(select(RefreshToken).where(RefreshToken.user_id == user_id)).all()
    assert tokens and all(t.revoked_at is not None for t in tokens)

    entry = db.scalars(select(AuditLog).where(AuditLog.action == "user.delete")).one()
    assert entry.actor_id == admin.id and entry.entity_id == user_id
    assert entry.meta["email"] == email

    # hidden from the admin list, 404 for others, cannot sign in or use the old token
    assert user_id not in listed_ids(client, admin)
    assert client.get(f"{API}/users/{user_id}", headers=auth(viewer)).status_code == 404
    assert client.get(f"{API}/auth/me", headers=old_headers).status_code == 401
    assert client.get(f"{API}/auth/me", headers=auth(user)).status_code == 403
    assert login(client, email).status_code == 401
    assert patch_user(client, admin, user_id, is_active=True).status_code == 404
    assert delete_user(client, admin, user_id).status_code == 404

    # the post row is kept for audit but gone for everyone
    stored = db.get(Post, post["id"])
    assert stored.author_id == user_id and stored.status is PostStatus.removed
    assert stored.removal_reason is RemovalReason.account_deleted and stored.deleted_at
    assert client.get(f"{API}/posts/{post['id']}", headers=auth(viewer)).status_code == 404
    assert entry.meta["posts_removed"] == 1

    # the e-mail address is free again
    created = client.post(
        f"{API}/admin/users",
        json={
            "email": email,
            "display_name": "คนใหม่",
            "role": "building_staff",
            "faculty_id": None,
        },
        headers=auth(admin),
    )
    assert created.status_code == 201, created.text


def test_delete_removes_every_post_of_the_author(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin, viewer = make_user(RoleName.admin, "CENTRAL"), make_user()
    building = make_user(RoleName.building_staff, "CENTRAL")
    tech = make_user(RoleName.technician)
    author = make_user(RoleName.student_club)
    general = client.post(
        f"{API}/posts",
        json={
            "type": "general",
            "title": "ทั่วไป",
            "content": "x",
            "category_id": category_id(db, "general"),
        },
        headers=auth(author),
    ).json()
    event = new_event(client, db, author, utcnow() + timedelta(days=2))
    lost = client.post(
        f"{API}/lost-found",
        json={"title": "กุญแจหาย", "content": "x", "location": "ICT", "status": "lost"},
        headers=auth(author),
    ).json()
    repair = new_repair(client, author)
    assert assign(client, building, repair["id"], technician_of(db, tech)).status_code == 200
    announcement = new_announcement(client, db, building)
    ids = [general["id"], event["id"], lost["id"], repair["id"]]
    # a report on the author's post (open) and one filed BY the author (stays as history)
    open_report = report_post(client, general["id"], viewer)
    own_report = report_post(client, announcement["id"], author)

    assert delete_user(client, admin, author.id).status_code == 204
    db.expire_all()

    for pid in ids:
        post = db.get(Post, pid)
        assert post.status is PostStatus.removed
        assert post.removal_reason is RemovalReason.account_deleted and post.deleted_at
        assert post.pinned_by is None
        assert client.get(f"{API}/posts/{pid}", headers=auth(viewer)).status_code == 404
    assert db.get(Post, announcement["id"]).status is PostStatus.active  # someone else's post

    feed = client.get(f"{API}/posts?page_size=100", headers=auth(viewer)).json()
    assert {p["id"] for p in feed["items"]} == {announcement["id"]}
    calendar = client.get(f"{API}/events", headers=auth(viewer)).json()
    assert event["id"] not in {p["id"] for p in calendar}
    dash = client.get(f"{API}/dashboard", headers=auth(viewer)).json()
    shown = {p["id"] for v in dash.values() if isinstance(v, list) for p in v}
    assert not shown & set(ids)
    assert client.get(f"{API}/posts?q=กุญแจ", headers=auth(viewer)).json()["total"] == 0

    # reports: the open one is closed with a note, history stays, nobody is notified
    closed = db.get(Report, open_report["id"])
    assert closed.status is ReportStatus.content_removed
    assert closed.actions[-1].note == "บัญชีถูกลบ"
    assert db.get(Report, own_report["id"]).status is ReportStatus.reported  # filed BY the author
    assert db.query(Notification).filter(Notification.user_id == author.id).count() == 0

    # the assigned technician is told the job was withdrawn
    cancelled = db.scalars(
        select(Notification).where(
            Notification.user_id == tech.id, Notification.type == "repair.cancelled"
        )
    ).all()
    assert len(cancelled) == 1 and f"#{repair['id']}" in cancelled[0].title
    entry = db.scalars(select(AuditLog).where(AuditLog.action == "user.delete")).one()
    assert entry.meta["posts_removed"] == 4
    # the withdrawn job no longer blocks deleting the technician
    assert delete_user(client, admin, tech.id).status_code == 204


def registered_id(db: Session, email: str) -> int:
    return db.scalars(select(User.id).where(User.email == email)).one()


def test_same_person_can_register_again_as_a_brand_new_account(
    client: TestClient,
    db: Session,
    make_user: UserFactory,
) -> None:
    admin = make_user(RoleName.admin, "CENTRAL")
    old = make_user()
    email, old_id = old.email, old.id
    old.contact_line = "old-line"
    db.commit()
    client.post(
        f"{API}/posts",
        json={
            "type": "general",
            "title": "เก่า",
            "content": "x",
            "category_id": category_id(db, "general"),
        },
        headers=auth(old),
    )
    assert delete_user(client, admin, old_id).status_code == 204

    registered = client.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "password": "Secret123",
            "display_name": "คนใหม่",
            "faculty_id": faculty_id(db, "ICT"),
            "program_id": program_id(db, "ICT-CS"),
        },
    )
    assert registered.status_code == 201, registered.text
    new_id = registered_id(db, email)
    verify = client.patch(
        f"{API}/admin/users/{new_id}", json={"is_verified": True}, headers=auth(admin)
    )
    assert verify.status_code == 200
    login = client.post(f"{API}/auth/login", json={"email": email, "password": "Secret123"})
    assert login.status_code == 200, login.text

    db.expire_all()
    fresh = db.scalars(select(User).where(User.email == email)).unique().one()
    assert fresh.id != old_id and fresh.deleted_at is None and fresh.supabase_user_id is None
    assert fresh.contact_line is None and fresh.display_name == "คนใหม่"
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    history = client.get(f"{API}/me/posts", headers=headers).json()
    assert history["total"] == 0 and history["items"] == []
    assert db.get(User, old_id).deleted_at is not None  # the old account stays deleted


def test_cannot_delete_yourself_or_the_last_active_admin(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin, other = make_user(RoleName.admin, "CENTRAL"), make_user(RoleName.admin, "CENTRAL")
    assert delete_user(client, admin, admin.id).status_code == 409
    other.is_active = False
    db.commit()
    assert delete_user(client, admin, other.id).status_code == 204  # disabled admins can go
    # `admin` is now the last active admin: self-delete stays refused
    assert delete_user(client, admin, admin.id).status_code == 409


def test_only_admins_can_delete(client: TestClient, make_user: UserFactory) -> None:
    staff, victim = make_user(RoleName.building_staff, "CENTRAL"), make_user()
    assert delete_user(client, staff, victim.id).status_code == 403
    assert delete_user(client, victim, victim.id).status_code == 403
    assert client.delete(f"{API}/admin/users/{victim.id}").status_code == 401


def test_deleting_a_missing_user_is_404(client: TestClient, make_user: UserFactory) -> None:
    admin = make_user(RoleName.admin, "CENTRAL")
    assert delete_user(client, admin, 99999).status_code == 404


def test_technician_with_unfinished_repairs_cannot_be_deleted(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin = make_user(RoleName.admin, "CENTRAL")
    building = make_user(RoleName.building_staff, "CENTRAL")
    tech, reporter = make_user(RoleName.technician), make_user()
    repair = new_repair(client, reporter)
    assert assign(client, building, repair["id"], technician_of(db, tech)).status_code == 200

    blocked = delete_user(client, admin, tech.id)
    assert blocked.status_code == 409
    assert "ซ่อม" in blocked.json()["error"]["message"]
    db.expire_all()
    assert db.get(User, tech.id).deleted_at is None

    # once the job is rejected (terminal) the technician can be deleted
    done = client.patch(
        f"{API}/repairs/{repair['id']}",
        json={"status": "rejected", "note": "ไม่ซ่อม"},
        headers=auth(building),
    )
    assert done.status_code == 200, done.text
    assert delete_user(client, admin, tech.id).status_code == 204


def test_deleted_technician_is_not_offered_for_assignment(
    client: TestClient, make_user: UserFactory
) -> None:
    admin = make_user(RoleName.admin, "CENTRAL")
    building = make_user(RoleName.building_staff, "CENTRAL")
    tech = make_user(RoleName.technician)
    assert delete_user(client, admin, tech.id).status_code == 204
    listing = client.get(f"{API}/technicians", headers=auth(building))
    assert listing.status_code == 200
    assert listing.json() == []
