"""Spam policy: consecutive GENERAL posts inside one Asia/Bangkok calendar day. 3rd -> warning,
5th -> suspended for 1 calendar day (no longer tier); any other post type in between ends
the series; a suspension starts a new series."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta

import pytest
import time_machine
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import clock
from app.models import (
    Notification,
    Post,
    PostingSuspension,
    PostingViolation,
    PostStatus,
    PostType,
    RoleName,
    ViolationAction,
)
from app.services import spam
from tests.conftest import API, UserFactory, attachment_id, auth, category_id

# Saturday 10 Oct 2026, 10:00 in Bangkok (UTC+7)
T0 = datetime(2026, 10, 10, 3, 0, tzinfo=UTC)
MIN = timedelta(minutes=1)


def bkk_midnight(day: int, month: int = 10) -> datetime:
    """00:00 Bangkok of the given day of 2026, in UTC."""
    return datetime(2026, month, day, tzinfo=clock.BANGKOK).astimezone(UTC)


@pytest.fixture(autouse=True)
def spam_on(settings) -> None:
    settings(spam_policy_enabled=True)


def general(db: Session, title: str = "โพสต์ทดสอบ") -> dict:
    return {
        "type": "general",
        "title": title,
        "content": "เนื้อหา",
        "category_id": category_id(db, "general"),
    }


def event(db: Session, starts: datetime) -> dict:
    return {
        "type": "event",
        "title": "กิจกรรม",
        "content": "เนื้อหา",
        "category_id": category_id(db, "activities"),
        "event": {
            "starts_at": starts.isoformat(),
            "ends_at": (starts + timedelta(hours=1)).isoformat(),
        },
    }


def post(client: TestClient, user, body: dict):
    return client.post(f"{API}/posts", json=body, headers=auth(user))


def post_at(client: TestClient, db: Session, user, moment: datetime, title: str = "โพสต์"):
    with time_machine.travel(moment, tick=False):
        return post(client, user, general(db, f"โพสต์ {title}"))


def notice(response) -> dict | None:
    assert response.status_code == 201, response.text
    return response.json()["spam_notice"]


def detail(response, field: str) -> str | None:
    for item in response.json()["error"]["details"]:
        if item.get("field") == field:
            return item["message"]
    return None


# ---------- 3 -> warning ----------
def test_third_general_post_of_a_series_warns_but_is_created(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    user = make_user()
    notices = [notice(post_at(client, db, user, T0 + i * MIN, f"โพสต์ {i}")) for i in range(3)]
    assert notices[:2] == [None, None]
    assert notices[2] == {"action": "warning", "count": 3, "suspended_until": None}
    assert db.scalar(select(func.count(Post.id))) == 3  # the warning post is saved
    violation = db.scalars(select(PostingViolation)).one()
    assert violation.action is ViolationAction.warning and violation.series_count == 3
    assert violation.post_id == db.scalars(select(Post.id).order_by(Post.id.desc())).first()
    note = db.scalars(select(Notification).where(Notification.user_id == user.id)).one()
    assert note.type == "spam.warning"
    # the 4th post is fine and carries no notice
    assert notice(post_at(client, db, user, T0 + 3 * MIN)) is None
    assert db.scalar(select(func.count(PostingSuspension.id))) == 0


# ---------- 5 -> one calendar day ----------
def test_fifth_post_suspends_until_midnight_bangkok(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    user = make_user()
    for i in range(4):
        post_at(client, db, user, T0 + i * MIN)
    fifth = post_at(client, db, user, T0 + 4 * MIN)
    assert fifth.status_code == 201  # saved first, suspension starts right after
    until = bkk_midnight(11)
    spam_notice = fifth.json()["spam_notice"]
    assert spam_notice["action"] == "suspension"
    assert datetime.fromisoformat(spam_notice["suspended_until"]) == until
    assert fifth.json()["spam_notice"]["count"] == 5

    row = db.scalars(select(PostingSuspension)).one()
    assert row.ends_at == until == datetime(2026, 10, 10, 17, 0, tzinfo=UTC)
    assert row.last_day == date(2026, 10, 10)
    assert row.starts_at == T0 + 4 * MIN and row.violation_id is not None
    actions = db.scalars(select(PostingViolation.action).order_by(PostingViolation.id)).all()
    assert actions == [ViolationAction.warning, ViolationAction.suspension]
    kinds = db.scalars(select(Notification.type).where(Notification.user_id == user.id)).all()
    restore = db.scalars(
        select(Notification.body).where(Notification.type == "spam.suspension")
    ).one()
    assert sorted(kinds) == ["spam.suspension", "spam.warning"]
    assert "11/10/2026 00:00" in restore

    with time_machine.travel(T0 + 5 * MIN, tick=False):
        blocked = post(client, user, general(db, "โดนระงับ"))
        assert blocked.status_code == 403
        assert blocked.json()["error"]["code"] == "POSTING_SUSPENDED"
        assert datetime.fromisoformat(detail(blocked, "suspended_until")) == until
        me = client.get(f"{API}/auth/me", headers=auth(user)).json()
        assert datetime.fromisoformat(me["posting_suspended_until"]) == until
        assert me["suspension"]["last_day"] == "2026-10-10"
        assert datetime.fromisoformat(me["suspension"]["ends_at"]) == until
        assert datetime.fromisoformat(me["suspension"]["starts_at"]) == T0 + 4 * MIN
    # 23:59:59 Bangkok: still suspended; 00:00 Bangkok on the 11th: restored
    with time_machine.travel(until - timedelta(seconds=1), tick=False):
        assert post(client, user, general(db, "ยังไม่ได้")).status_code == 403
    with time_machine.travel(until, tick=False):
        again = post(client, user, general(db, "กลับมาแล้ว"))
        assert again.status_code == 201 and again.json()["spam_notice"] is None
        me = client.get(f"{API}/auth/me", headers=auth(user)).json()
        assert me["posting_suspended_until"] is None and me["suspension"] is None


def test_suspension_blocks_every_post_type_but_not_reading(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    user = make_user(RoleName.student_club)
    for i in range(5):
        post_at(client, db, user, T0 + i * MIN)
    with time_machine.travel(T0 + 10 * MIN, tick=False):
        headers = auth(user)
        assert post(client, user, general(db)).status_code == 403
        assert post(client, user, event(db, clock.utcnow() + timedelta(days=1))).status_code == 403
        lost = {"title": "บัตรหาย", "content": "x", "location": "ห้องสมุด", "status": "lost"}
        assert client.post(f"{API}/lost-found", json=lost, headers=headers).status_code == 403
        repair = {
            "title": "ไฟดับ",
            "content": "ห้อง 101",
            "location": "ICT 101",
            "attachment_ids": [attachment_id(user)],
        }
        assert client.post(f"{API}/repairs", json=repair, headers=headers).status_code == 403
        for path in ("/dashboard", "/posts", "/me/posts", "/auth/me", "/notifications"):
            assert client.get(f"{API}{path}", headers=headers).status_code == 200, path


# ---------- calendar days (Asia/Bangkok) ----------
def test_series_resets_at_midnight_bangkok_not_utc(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    user = make_user()
    midnight = bkk_midnight(11)  # 17:00 UTC
    # two posts just before Bangkok midnight, one just after: a new day, a new series
    assert notice(post_at(client, db, user, midnight - 2 * MIN, "a")) is None
    assert notice(post_at(client, db, user, midnight - 1 * MIN, "b")) is None
    assert notice(post_at(client, db, user, midnight + 1 * MIN, "c")) is None
    assert db.scalar(select(func.count(PostingViolation.id))) == 0
    # two more on the new day complete THAT day's series of 3
    assert notice(post_at(client, db, user, midnight + 2 * MIN, "d")) is None
    assert notice(post_at(client, db, user, midnight + 3 * MIN, "e"))["count"] == 3


def test_same_utc_day_but_different_bangkok_days_do_not_add_up(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    user = make_user()
    # 16:00 UTC = 23:00 Bangkok (10 Oct); 18:00 UTC = 01:00 Bangkok (11 Oct): same UTC date
    for hour, title in ((15, "a"), (16, "b")):
        post_at(client, db, user, datetime(2026, 10, 10, hour, 0, tzinfo=UTC), title)
    for hour, title in ((18, "c"), (19, "d")):
        assert (
            notice(post_at(client, db, user, datetime(2026, 10, 10, hour, 0, tzinfo=UTC), title))
            is None
        )
    assert db.scalar(select(func.count(PostingViolation.id))) == 0


# ---------- other post types end the series ----------
def test_a_non_general_post_in_between_resets_the_count(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    club = make_user(RoleName.student_club)
    for i in range(2):
        assert notice(post_at(client, db, club, T0 + i * MIN, f"g{i}")) is None
    with time_machine.travel(T0 + 2 * MIN, tick=False):
        assert post(client, club, event(db, clock.utcnow() + timedelta(days=2))).status_code == 201
    for i in range(2):
        assert notice(post_at(client, db, club, T0 + (3 + i) * MIN, f"h{i}")) is None
    assert notice(post_at(client, db, club, T0 + 5 * MIN, "h2"))["action"] == "warning"


@pytest.mark.parametrize("other", ["repair", "lost_found", "announcement"])
def test_repairs_lost_found_and_announcements_end_a_series_too(
    client: TestClient, db: Session, make_user: UserFactory, other: str
) -> None:
    role = RoleName.building_staff if other == "announcement" else RoleName.student
    user = make_user(role, "CENTRAL" if other == "announcement" else "ICT")
    for i in range(2):
        assert notice(post_at(client, db, user, T0 + i * MIN, f"g{i}")) is None
    with time_machine.travel(T0 + 2 * MIN, tick=False):
        if other == "repair":
            body = {
                "title": "ไฟดับ",
                "content": "x",
                "location": "ICT",
                "attachment_ids": [attachment_id(user)],
            }
            response = client.post(f"{API}/repairs", json=body, headers=auth(user))
        elif other == "lost_found":
            body = {"title": "กุญแจหาย", "content": "x", "location": "ICT", "status": "lost"}
            response = client.post(f"{API}/lost-found", json=body, headers=auth(user))
        else:
            body = {**general(db, "ประกาศ"), "type": "announcement"}
            response = post(client, user, body)
        assert response.status_code == 201, response.text
    assert notice(post_at(client, db, user, T0 + 3 * MIN, "after-1")) is None
    assert notice(post_at(client, db, user, T0 + 4 * MIN, "after-2")) is None
    assert notice(post_at(client, db, user, T0 + 5 * MIN, "after-3"))["action"] == "warning"


def test_soft_deleted_posts_still_count(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    user = make_user()
    first = post_at(client, db, user, T0)
    post_at(client, db, user, T0 + MIN)
    with time_machine.travel(T0 + 2 * MIN, tick=False):
        assert (
            client.delete(f"{API}/posts/{first.json()['id']}", headers=auth(user)).status_code
            == 204
        )
    db.expire_all()
    assert db.get(Post, first.json()["id"]).status is PostStatus.removed
    assert notice(post_at(client, db, user, T0 + 3 * MIN))["action"] == "warning"


def test_other_users_posts_do_not_count(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    a, b = make_user(), make_user()
    for i in range(4):
        assert notice(post_at(client, db, a if i % 2 else b, T0 + i * MIN)) is None


# ---------- a suspension starts a new series ----------
def test_after_a_suspension_the_series_starts_again(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    user = make_user()
    for i in range(5):
        post_at(client, db, user, T0 + i * MIN)  # suspended until 11 Oct 00:00 Bangkok
    restored = bkk_midnight(11)
    # the old posts are yesterday anyway; two new ones do not warn, the third does
    assert notice(post_at(client, db, user, restored + MIN, "n1")) is None
    assert notice(post_at(client, db, user, restored + 2 * MIN, "n2")) is None
    assert notice(post_at(client, db, user, restored + 3 * MIN, "n3"))["action"] == "warning"


def test_admin_lift_inside_the_same_day_starts_a_new_series(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    user, admin = make_user(), make_user(RoleName.admin, "CENTRAL")
    for i in range(5):
        post_at(client, db, user, T0 + i * MIN)
    lifted_at = T0 + 30 * MIN
    with time_machine.travel(lifted_at, tick=False):
        lifted = client.patch(
            f"{API}/admin/users/{user.id}", json={"lift_suspension": True}, headers=auth(admin)
        )
        assert lifted.status_code == 200 and lifted.json()["posting_suspended_until"] is None
    # still the same Bangkok day, but the earlier posts are before lifted_at: ignored
    assert notice(post_at(client, db, user, lifted_at + MIN, "n1")) is None
    assert notice(post_at(client, db, user, lifted_at + 2 * MIN, "n2")) is None
    assert notice(post_at(client, db, user, lifted_at + 3 * MIN, "n3"))["action"] == "warning"


# ---------- calendar-day window (service level) ----------
def test_suspension_window_counts_calendar_days_from_day_one() -> None:
    last_day, ends_at = spam.suspension_window(datetime(2026, 10, 10, 3, 0, tzinfo=UTC), 1)
    assert last_day == date(2026, 10, 10)
    assert ends_at == bkk_midnight(11)  # restored 11 Oct 00:00 Bangkok
    # a post at 23:30 Bangkok still counts the 10th as day 1
    late = datetime(2026, 10, 10, 16, 30, tzinfo=UTC)
    assert spam.suspension_window(late, 1) == (date(2026, 10, 10), bkk_midnight(11))
    # 00:30 Bangkok on the 11th is already the 11th (UTC date is still the 10th)
    early = datetime(2026, 10, 10, 17, 30, tzinfo=UTC)
    assert spam.suspension_window(early, 1) == (date(2026, 10, 11), bkk_midnight(12))


def test_series_count_ignores_other_types_and_days(db: Session, make_user: UserFactory) -> None:
    user = make_user()
    category = category_id(db, "general")

    def add(kind: PostType, when: datetime) -> None:
        db.add(
            Post(
                type=kind,
                title="ทดสอบ",
                content="x",
                category_id=category,
                author_id=user.id,
                created_at=when,
            )
        )

    add(PostType.general, T0 - timedelta(days=1))  # yesterday
    add(PostType.general, T0)
    add(PostType.repair, T0 + MIN)
    add(PostType.general, T0 + 2 * MIN)
    add(PostType.general, T0 + 3 * MIN)
    db.flush()
    assert spam.series_count(db, user.id, T0 + 3 * MIN) == 2


# ---------- misc ----------
def test_policy_can_be_switched_off(
    client: TestClient, db: Session, make_user: UserFactory, settings
) -> None:
    settings(spam_policy_enabled=False)
    user = make_user()
    for i in range(6):
        assert notice(post_at(client, db, user, T0 + i * MIN)) is None
    assert db.scalar(select(func.count(PostingViolation.id))) == 0


def test_concurrent_posts_are_evaluated_one_after_the_other(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    user = make_user()

    def send(i: int) -> int:
        return post(client, user, general(db, f"พร้อมกัน {i}")).status_code

    with ThreadPoolExecutor(max_workers=5) as pool:
        codes = list(pool.map(send, range(5)))
    # the user row lock serialises them: posts 1-5 are all saved (3rd warns, 5th suspends)
    assert codes == [201] * 5
    actions = db.scalars(select(PostingViolation.action).order_by(PostingViolation.id)).all()
    assert actions == [ViolationAction.warning, ViolationAction.suspension]
    assert db.scalar(select(func.count(PostingSuspension.id))) == 1
