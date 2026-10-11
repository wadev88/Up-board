"""Authentication flow: @up.ac.th registration → Google/admin verification → login → refresh rotation."""

from datetime import timedelta

import pytest
import time_machine
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.clock import utcnow
from app.core.rate_limit import limiter
from app.models import RoleName, User
from tests.conftest import API, PASSWORD, UserFactory, auth, faculty_id, program_id


def register(client: TestClient, db: Session, email: str = "newuser@up.ac.th", **extra: object):
    body = {
        "email": email,
        "password": "Secret123",
        "display_name": "นิสิตใหม่",
        "faculty_id": faculty_id(db, "ICT"),
        "program_id": program_id(db, "ICT-CS"),
        **extra,
    }
    return client.post(f"{API}/auth/register", json=body)


def test_register_stores_faculty_and_program(client: TestClient, db: Session) -> None:
    assert register(client, db).status_code == 201
    user = db.scalars(select(User).where(User.email == "newuser@up.ac.th")).unique().one()
    assert user.faculty_id == faculty_id(db, "ICT")
    assert user.program_id == program_id(db, "ICT-CS")


def test_student_id_email_registers_as_student(client: TestClient, db: Session) -> None:
    assert register(client, db, "67024841@up.ac.th").status_code == 201
    user = db.scalars(select(User).where(User.email == "67024841@up.ac.th")).unique().one()
    assert user.role_name is RoleName.student and user.profile_completed_at is not None


def test_register_requires_a_matching_program(client: TestClient, db: Session) -> None:
    missing = client.post(
        f"{API}/auth/register",
        json={
            "email": "a1@up.ac.th",
            "password": "Secret123",
            "display_name": "นิสิตใหม่",
            "faculty_id": faculty_id(db, "ICT"),
        },
    )
    assert missing.status_code == 422
    other_faculty = register(client, db, "a2@up.ac.th", program_id=program_id(db, "ENG-ME"))
    assert other_faculty.status_code == 422
    assert other_faculty.json()["error"]["details"][0]["field"] == "program_id"
    unknown = register(client, db, "a3@up.ac.th", program_id=999999)
    assert unknown.status_code == 422
    assert unknown.json()["error"]["details"][0]["field"] == "program_id"


@pytest.mark.parametrize(
    "email",
    ["someone@gmail.com", "x@up.ac.th.evil.com", "x@cmu.ac.th", "x@sub.up.ac.th", "not-an-email"],
)
def test_register_rejects_non_up_email(client: TestClient, db: Session, email: str) -> None:
    response = register(client, db, email)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_register_cannot_self_assign_role(client: TestClient, db: Session) -> None:
    response = register(client, db, role="admin")
    assert response.status_code == 422  # unknown fields are forbidden


def test_full_registration_flow(client: TestClient, db: Session, make_user: UserFactory) -> None:
    response = register(client, db, "MixedCase@UP.ac.th")
    assert response.status_code == 201
    assert "set-cookie" not in response.headers and "token" not in response.text
    user = db.scalars(select(User).where(User.email == "mixedcase@up.ac.th")).unique().one()
    assert user.role_name is RoleName.teacher  # name-style address
    assert user.profile_completed_at is not None  # no onboarding step after registering
    assert user.is_verified is False  # nothing is emailed; Google (or an admin) verifies

    login = client.post(
        f"{API}/auth/login", json={"email": "mixedcase@up.ac.th", "password": "Secret123"}
    )
    assert login.status_code == 403
    assert login.json()["error"]["code"] == "EMAIL_NOT_VERIFIED"
    assert "set-cookie" not in login.headers

    admin = make_user(RoleName.admin, "CENTRAL")
    verified = client.patch(
        f"{API}/admin/users/{user.id}", json={"is_verified": True}, headers=auth(admin)
    )
    assert verified.status_code == 200 and verified.json()["is_verified"] is True

    login = client.post(
        f"{API}/auth/login", json={"email": "MIXEDCASE@up.ac.th", "password": "Secret123"}
    )
    assert login.status_code == 200
    body = login.json()
    assert body["user"]["role"] == "teacher" and body["user"]["profile_completed"] is True
    assert body["expires_in"] == 900
    cookie = login.headers["set-cookie"].lower()
    assert "httponly" in cookie and "path=/api/v1/auth" in cookie

    me = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.json()["email"] == "mixedcase@up.ac.th"


def test_admin_can_unverify_which_ends_sessions(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin = make_user(RoleName.admin, "CENTRAL")
    user = make_user(RoleName.student, "ICT")
    login = client.post(f"{API}/auth/login", json={"email": user.email, "password": PASSWORD})
    assert login.status_code == 200
    token = login.json()["access_token"]
    response = client.patch(
        f"{API}/admin/users/{user.id}", json={"is_verified": False}, headers=auth(admin)
    )
    assert response.status_code == 200 and response.json()["is_verified"] is False
    me = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 401
    again = client.post(f"{API}/auth/login", json={"email": user.email, "password": PASSWORD})
    assert again.json()["error"]["code"] == "EMAIL_NOT_VERIFIED"


def test_email_link_endpoints_are_gone(client: TestClient) -> None:
    assert client.post(f"{API}/auth/verify-email", json={"token": "x" * 20}).status_code == 404
    gone = client.post(f"{API}/auth/resend-verification", json={"email": "a@up.ac.th"})
    assert gone.status_code == 404


def test_duplicate_email(client: TestClient, db: Session) -> None:
    register(client, db)
    response = register(client, db)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EMAIL_TAKEN"


def test_wrong_password_and_unknown_user_look_identical(
    client: TestClient, make_user: UserFactory
) -> None:
    user = make_user()
    wrong = client.post(f"{API}/auth/login", json={"email": user.email, "password": "nope12345"})
    ghost = client.post(
        f"{API}/auth/login", json={"email": "ghost@up.ac.th", "password": "nope12345"}
    )
    assert wrong.status_code == ghost.status_code == 401
    assert wrong.json() == ghost.json()


def test_disabled_account_cannot_login(client: TestClient, make_user: UserFactory) -> None:
    user = make_user(active=False)
    response = client.post(f"{API}/auth/login", json={"email": user.email, "password": PASSWORD})
    assert response.json()["error"]["code"] == "ACCOUNT_DISABLED"


def test_refresh_rotates_and_detects_reuse(client: TestClient, make_user: UserFactory) -> None:
    user = make_user()
    client.post(f"{API}/auth/login", json={"email": user.email, "password": PASSWORD})
    first = client.cookies.get("refresh_token")
    rotated = client.post(f"{API}/auth/refresh")
    assert rotated.status_code == 200
    second = client.cookies.get("refresh_token")
    assert second and second != first

    # replaying the old token after the 30 s multi-tab grace window revokes the whole family
    with time_machine.travel(utcnow() + timedelta(seconds=31)):
        client.cookies.set("refresh_token", first, path="/api/v1/auth")
        assert client.post(f"{API}/auth/refresh").status_code == 401
        client.cookies.set("refresh_token", second, path="/api/v1/auth")
        assert client.post(f"{API}/auth/refresh").status_code == 401


def test_logout_revokes_refresh_token(client: TestClient, make_user: UserFactory) -> None:
    user = make_user()
    client.post(f"{API}/auth/login", json={"email": user.email, "password": PASSWORD})
    token = client.cookies.get("refresh_token")
    assert client.post(f"{API}/auth/logout").status_code == 204
    client.cookies.set("refresh_token", token, path="/api/v1/auth")
    assert client.post(f"{API}/auth/refresh").status_code == 401


def test_refresh_rejects_foreign_origin(client: TestClient, make_user: UserFactory) -> None:
    user = make_user()
    client.post(f"{API}/auth/login", json={"email": user.email, "password": PASSWORD})
    response = client.post(f"{API}/auth/refresh", headers={"Origin": "https://evil.example"})
    assert response.status_code == 403


def test_access_token_expires_after_15_minutes(client: TestClient, make_user: UserFactory) -> None:
    headers = auth(make_user())
    with time_machine.travel(utcnow() + timedelta(minutes=16)):
        response = client.get(f"{API}/auth/me", headers=headers)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "TOKEN_EXPIRED"


@pytest.mark.parametrize("header", [None, "Bearer", "Bearer garbage", "Basic abc"])
def test_protected_endpoint_requires_valid_bearer(client: TestClient, header: str | None) -> None:
    headers = {"Authorization": header} if header else {}
    response = client.get(f"{API}/dashboard", headers=headers)
    assert response.status_code == 401
    assert "error" in response.json()


def test_update_profile_blocks_profanity(client: TestClient, make_user: UserFactory) -> None:
    headers = auth(make_user())
    assert (
        client.patch(f"{API}/auth/me", json={"display_name": "ไอ้เหี้ย"}, headers=headers).status_code
        == 422
    )
    ok = client.patch(f"{API}/auth/me", json={"display_name": "ชื่อใหม่"}, headers=headers)
    assert ok.json()["display_name"] == "ชื่อใหม่"


def test_login_is_rate_limited(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)
    limiter.reset()
    try:
        codes = [
            client.post(
                f"{API}/auth/login", json={"email": "x@up.ac.th", "password": "x"}
            ).status_code
            for _ in range(11)
        ]
    finally:
        limiter.reset()
    assert codes[-1] == 429
    assert set(codes[:10]) == {401}


def test_rate_limit_is_per_account_so_campus_nat_is_not_locked_out(
    client: TestClient, make_user: UserFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Thousands of students share a few campus NAT IPs: one account being brute-forced
    must not block everyone else on the same IP."""
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)
    limiter.reset()
    victim, bystander = make_user(), make_user()
    try:
        for _ in range(10):
            client.post(
                f"{API}/auth/login", json={"email": victim.email, "password": "wrong-pass1"}
            )
        blocked = client.post(
            f"{API}/auth/login", json={"email": victim.email, "password": PASSWORD}
        )
        other = client.post(
            f"{API}/auth/login", json={"email": bystander.email, "password": PASSWORD}
        )
        refreshes = {client.post(f"{API}/auth/refresh").status_code for _ in range(70)}
    finally:
        limiter.reset()
    assert blocked.status_code == 429
    assert other.status_code == 200
    assert 429 not in refreshes


def test_concurrent_refresh_from_two_tabs_keeps_the_session(
    client: TestClient, make_user: UserFactory
) -> None:
    """Two tabs refreshing at the same moment send the same cookie. The second request must not
    be treated as token theft (which would log the user out of every tab)."""
    user = make_user()
    client.post(f"{API}/auth/login", json={"email": user.email, "password": PASSWORD})
    shared = client.cookies.get("refresh_token")
    tab_a = client.post(f"{API}/auth/refresh", cookies={"refresh_token": shared})
    client.cookies.clear()
    tab_b = client.post(f"{API}/auth/refresh", cookies={"refresh_token": shared})
    assert tab_a.status_code == 200
    assert tab_b.status_code == 200
    # both tabs keep working afterwards
    client.cookies.clear()
    assert (
        client.post(
            f"{API}/auth/refresh", cookies={"refresh_token": tab_b.cookies["refresh_token"]}
        ).status_code
        == 200
    )


def test_reusing_an_old_rotated_token_later_is_still_treated_as_theft(
    client: TestClient, make_user: UserFactory
) -> None:
    user = make_user()
    client.post(f"{API}/auth/login", json={"email": user.email, "password": PASSWORD})
    stolen = client.cookies.get("refresh_token")
    client.post(f"{API}/auth/refresh")
    current = client.cookies.get("refresh_token")
    with time_machine.travel(utcnow() + timedelta(minutes=2)):
        client.cookies.clear()
        replay = client.post(f"{API}/auth/refresh", cookies={"refresh_token": stolen})
        client.cookies.clear()
        legit = client.post(f"{API}/auth/refresh", cookies={"refresh_token": current})
    assert replay.status_code == 401
    assert legit.status_code == 401  # whole family revoked
