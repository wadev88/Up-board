"""Google sign-in through Supabase Auth (ADR-003 / BR-09): the API verifies the Supabase access
token, enforces a verified, exactly-@up.ac.th Google account and only then issues its own session."""

import time
import uuid
from types import SimpleNamespace
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import supabase_auth
from app.core.rate_limit import limiter
from app.models import AuditLog, Program, RoleName, User
from tests.conftest import (
    API,
    PASSWORD,
    UserFactory,
    auth,
    category_id,
    faculty_id,
    program_id,
)

SUPABASE_URL = "https://project-ref.supabase.co"
SECRET = "supabase-test-secret-supabase-test-secret-0123"


@pytest.fixture(autouse=True)
def google_enabled(settings) -> None:
    settings(supabase_url=SUPABASE_URL, supabase_jwt_secret=SECRET)


def supabase_token(
    email: str = "67024841@up.ac.th",
    *,
    sub: str | None = None,
    verified: bool = True,
    provider: str = "google",
    key: Any = SECRET,
    algorithm: str = "HS256",
    headers: dict | None = None,
    **claims: Any,
) -> str:
    now = int(time.time())
    payload = {
        "sub": sub or str(uuid.uuid4()),
        "aud": "authenticated",
        "iss": f"{SUPABASE_URL}/auth/v1",
        "iat": now,
        "exp": now + 3600,
        "email": email,
        "role": "authenticated",
        "is_anonymous": False,
        "app_metadata": {"provider": provider, "providers": [provider]},
        "user_metadata": {"email_verified": verified, "full_name": "สมหญิง ใจดี"},
        **claims,
    }
    return jwt.encode(payload, key, algorithm=algorithm, headers=headers)


def exchange(client: TestClient, token: str, password: str | None = None):
    body = {"access_token": token}
    if password is not None:
        body["password"] = password
    return client.post(f"{API}/auth/supabase", json=body)


def test_config_tells_the_login_page_what_to_offer(client: TestClient, settings) -> None:
    body = client.get(f"{API}/auth/config").json()
    assert body == {
        "google_enabled": True,
        "password_signup_enabled": True,
        "allowed_email_domain": "up.ac.th",
    }
    settings(supabase_url="")
    assert client.get(f"{API}/auth/config").json()["google_enabled"] is False


def test_google_does_not_create_accounts_registration_comes_first(
    client: TestClient, db: Session
) -> None:
    response = exchange(client, supabase_token("NewStudent@UP.ac.th"))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "NOT_REGISTERED"
    assert "set-cookie" not in response.headers
    assert "access_token" not in response.json()
    assert db.scalar(select(func.count(User.id))) == 0


def test_registered_account_signs_in_with_google_and_becomes_verified(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    user = make_user(RoleName.student, "ICT", email="newstudent@up.ac.th", verified=False)
    sub = str(uuid.uuid4())
    response = exchange(client, supabase_token("NewStudent@UP.ac.th", sub=sub), PASSWORD)
    assert response.status_code == 200, response.text
    body = response.json()["user"]
    assert body["id"] == user.id and body["is_verified"] is True
    assert "httponly" in response.headers["set-cookie"].lower()
    again = exchange(client, supabase_token("newstudent@up.ac.th", sub=sub))
    assert again.status_code == 200 and again.json()["user"]["id"] == user.id
    actions = db.scalars(select(AuditLog.action).order_by(AuditLog.id)).all()
    assert actions == ["user.login_google", "user.login_google"]


def test_admin_created_unverified_account_needs_no_password(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin = make_user(RoleName.admin, "CENTRAL")
    created = client.post(
        f"{API}/admin/users",
        json={"email": "staff.one@up.ac.th", "display_name": "เจ้าหน้าที่", "role": "building_staff"},
        headers=auth(admin),
    )
    assert created.status_code == 201, created.text
    user = db.get(User, created.json()["id"])
    user.is_verified = False  # even if unverified: there is no password to confirm
    db.commit()
    response = exchange(client, supabase_token("staff.one@up.ac.th"))
    assert response.status_code == 200 and response.json()["user"]["is_verified"] is True


def self_registered(client: TestClient, db: Session, email: str, password: str) -> None:
    response = client.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "password": password,
            "display_name": "ผู้สมัคร",
            "faculty_id": faculty_id(db, "ICT"),
            "program_id": program_id(db, "ICT-CS"),
        },
    )
    assert response.status_code == 201, response.text


def test_self_registered_account_must_confirm_its_password_once(
    client: TestClient, db: Session
) -> None:
    self_registered(client, db, "67024841@up.ac.th", "Secret123")
    sub = str(uuid.uuid4())
    token = supabase_token("67024841@up.ac.th", sub=sub)

    missing = exchange(client, token)
    assert missing.status_code == 403
    assert missing.json()["error"]["code"] == "PASSWORD_CONFIRMATION_REQUIRED"
    wrong = exchange(client, token, "Wrong12345")
    assert wrong.status_code == 403
    assert wrong.json()["error"]["code"] == "PASSWORD_CONFIRMATION_REQUIRED"
    assert wrong.json()["error"]["message"] != missing.json()["error"]["message"]
    for response in (missing, wrong):
        assert "set-cookie" not in response.headers and "access_token" not in response.json()
    user = db.scalars(select(User).where(User.email == "67024841@up.ac.th")).unique().one()
    assert user.supabase_user_id is None and user.is_verified is False  # nothing was linked

    # the same Supabase token is simply retried with the password
    ok = exchange(client, token, "Secret123")
    assert ok.status_code == 200, ok.text
    assert ok.json()["user"]["is_verified"] is True
    assert "Secret123" not in ok.text
    db.expire_all()
    user = db.scalars(select(User).where(User.email == "67024841@up.ac.th")).unique().one()
    assert str(user.supabase_user_id) == sub and user.is_verified is True
    # verified now: password login works and Google needs no password any more
    login = client.post(
        f"{API}/auth/login", json={"email": "67024841@up.ac.th", "password": "Secret123"}
    )
    assert login.status_code == 200
    assert exchange(client, supabase_token("67024841@up.ac.th", sub=sub)).status_code == 200


def test_squatter_who_registered_a_victims_email_is_locked_out(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    self_registered(client, db, "67024999@up.ac.th", "AttackerPw1")  # attacker, victim's address
    victim_google = supabase_token("67024999@up.ac.th")
    blocked = exchange(client, victim_google)  # the real owner does not know the password
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "PASSWORD_CONFIRMATION_REQUIRED"
    assert "set-cookie" not in blocked.headers
    attacker = client.post(
        f"{API}/auth/login", json={"email": "67024999@up.ac.th", "password": "AttackerPw1"}
    )
    assert attacker.status_code == 403
    assert attacker.json()["error"]["code"] == "EMAIL_NOT_VERIFIED"  # still no access
    # support: an admin removes the squatter's account, the owner registers again and verifies
    admin = make_user(RoleName.admin, "CENTRAL")
    user = db.scalars(select(User).where(User.email == "67024999@up.ac.th")).unique().one()
    deleted = client.delete(f"{API}/admin/users/{user.id}", headers=auth(admin))
    assert deleted.status_code == 204
    self_registered(client, db, "67024999@up.ac.th", "OwnerPw123")
    assert exchange(client, victim_google, "OwnerPw123").status_code == 200


def test_google_password_guessing_is_rate_limited(
    client: TestClient, db: Session, settings
) -> None:
    self_registered(client, db, "67024555@up.ac.th", "Secret123")
    limiter.reset()
    settings(rate_limit_enabled=True)
    token = supabase_token("67024555@up.ac.th")
    codes = [exchange(client, token, f"Guess{i}1234").status_code for i in range(12)]
    assert 429 in codes


def test_account_linked_to_another_google_user_is_not_taken_over(
    client: TestClient, make_user: UserFactory
) -> None:
    make_user(RoleName.student, "ICT", email="victim@up.ac.th")
    assert exchange(client, supabase_token("victim@up.ac.th")).status_code == 200
    attacker = exchange(client, supabase_token("victim@up.ac.th"))  # different sub
    assert attacker.status_code == 409
    assert "set-cookie" not in attacker.headers


def test_existing_password_account_is_linked_by_email(
    client: TestClient, make_user: UserFactory
) -> None:
    admin = make_user(RoleName.admin, "CENTRAL", email="boss@up.ac.th")
    response = exchange(client, supabase_token("boss@up.ac.th"))
    assert response.status_code == 200
    assert response.json()["user"]["id"] == admin.id
    assert response.json()["user"]["role"] == "admin"  # role comes from OUR database
    # the password still works for this account
    login = client.post(f"{API}/auth/login", json={"email": "boss@up.ac.th", "password": PASSWORD})
    assert login.status_code == 200


@pytest.mark.parametrize(
    "email",
    [
        "someone@gmail.com",
        "x@up.ac.th.evil.com",
        "x@evil-up.ac.th",
        "x@sub.up.ac.th",
        "up.ac.th@gmail.com",
    ],
)
def test_other_domains_are_rejected_without_a_session(
    client: TestClient, db: Session, email: str
) -> None:
    response = exchange(client, supabase_token(email))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "EMAIL_DOMAIN_NOT_ALLOWED"
    assert "set-cookie" not in response.headers
    assert "access_token" not in response.json()
    assert db.scalar(select(func.count(User.id))) == 0


def test_unverified_google_email_is_rejected(client: TestClient, db: Session) -> None:
    response = exchange(client, supabase_token(verified=False))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "GOOGLE_ACCOUNT_REJECTED"
    assert db.scalar(select(func.count(User.id))) == 0


def test_non_google_supabase_logins_are_rejected(client: TestClient) -> None:
    assert exchange(client, supabase_token(provider="email")).status_code == 403
    assert exchange(client, supabase_token(is_anonymous=True)).status_code == 403


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"key": "a-different-secret-a-different-secret-0000"}, "UNAUTHENTICATED"),
        ({"aud": "anon"}, "UNAUTHENTICATED"),
        ({"iss": "https://evil.supabase.co/auth/v1"}, "UNAUTHENTICATED"),
        ({"exp": int(time.time()) - 10}, "TOKEN_EXPIRED"),
    ],
)
def test_forged_or_expired_tokens_are_rejected(
    client: TestClient, overrides: dict, code: str
) -> None:
    response = exchange(client, supabase_token(**overrides))
    assert response.status_code == 401
    assert response.json()["error"]["code"] == code


def test_hs256_is_refused_when_the_project_uses_signing_keys(client: TestClient, settings) -> None:
    settings(supabase_jwt_secret="")
    assert exchange(client, supabase_token()).status_code == 401


def test_asymmetric_tokens_are_verified_with_the_project_jwks(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, make_user: UserFactory
) -> None:
    make_user(RoleName.student, "ICT", email="67024841@up.ac.th")
    private = ec.generate_private_key(ec.SECP256R1())
    other = ec.generate_private_key(ec.SECP256R1())
    jwks = SimpleNamespace(
        get_signing_key_from_jwt=lambda token: SimpleNamespace(key=private.public_key())
    )
    monkeypatch.setattr(supabase_auth, "_jwks_client", lambda url: jwks)
    good = supabase_token(key=private, algorithm="ES256", headers={"kid": "k1"})
    assert exchange(client, good).status_code == 200
    forged = supabase_token(key=other, algorithm="ES256", headers={"kid": "k1"})
    assert exchange(client, forged).status_code == 401


def test_disabled_accounts_cannot_sign_in_with_google(
    client: TestClient, make_user: UserFactory
) -> None:
    make_user(email="gone@up.ac.th", active=False)
    response = exchange(client, supabase_token("gone@up.ac.th"))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ACCOUNT_DISABLED"


def test_google_login_is_unavailable_until_configured(client: TestClient, settings) -> None:
    settings(supabase_url="")
    response = exchange(client, supabase_token())
    assert response.status_code == 503


def test_accounts_without_a_password_cannot_use_password_login(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    make_user(email="only.google@up.ac.th").password_hash = None
    db.commit()
    exchange(client, supabase_token("only.google@up.ac.th"))
    login = client.post(
        f"{API}/auth/login", json={"email": "only.google@up.ac.th", "password": "anything1"}
    )
    assert login.status_code == 401


def test_password_sign_up_can_be_switched_off(client: TestClient, db: Session, settings) -> None:
    settings(password_signup_enabled=False)
    response = client.post(
        f"{API}/auth/register",
        json={
            "email": "new@up.ac.th",
            "password": "Secret123",
            "display_name": "ใหม่",
            "faculty_id": faculty_id(db, "ICT"),
            "program_id": program_id(db, "ICT-CS"),
        },
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PASSWORD_SIGNUP_DISABLED"


def test_exchange_rejects_foreign_origins(client: TestClient) -> None:
    response = client.post(
        f"{API}/auth/supabase",
        json={"access_token": supabase_token()},
        headers={"Origin": "https://evil.example"},
    )
    assert response.status_code == 403


def test_role_in_supabase_token_is_ignored(client: TestClient, make_user: UserFactory) -> None:
    make_user(RoleName.student, "ICT", email="67024841@up.ac.th")
    token = supabase_token(
        app_metadata={"provider": "google", "providers": ["google"], "role": "admin"}
    )
    response = exchange(client, token)
    assert response.json()["user"]["role"] == "student"
    me = client.get(
        f"{API}/auth/me", headers={"Authorization": f"Bearer {response.json()['access_token']}"}
    )
    assert me.json()["role"] == "student"


def test_unauthenticated_requests_are_rejected(client: TestClient, make_user: UserFactory) -> None:
    for path in ("/dashboard", "/posts", "/me/posts", "/repairs", "/auth/me"):
        assert client.get(f"{API}{path}").status_code == 401
    assert client.get(f"{API}/auth/me", headers=auth(make_user())).status_code == 200


# ---------- onboarding: self-registered accounts choose student / teacher once ----------
def google_session(
    client: TestClient, make_user: UserFactory, email: str = "67024999@up.ac.th"
) -> dict[str, str]:
    """A registered (legacy: profile not completed) account signs in with Google."""
    make_user(RoleName.student, "ICT", email=email, onboarding=True)
    body = exchange(client, supabase_token(email)).json()
    return {"Authorization": f"Bearer {body['access_token']}"}


def onboarding_body(db: Session, faculty: str = "ICT", program: str = "ICT-CS") -> dict:
    return {"faculty_id": faculty_id(db, faculty), "program_id": program_id(db, program)}


def test_student_id_email_onboards_as_student(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    make_user(RoleName.student, "ICT", email="67024999@up.ac.th", onboarding=True)
    body = exchange(client, supabase_token("67024999@up.ac.th")).json()
    assert body["user"]["profile_completed"] is False
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    done = client.post(f"{API}/auth/onboarding", json=onboarding_body(db), headers=headers)
    assert done.status_code == 200, done.text
    user = done.json()
    assert user["role"] == "student" and "year_of_study" not in user
    assert user["faculty"]["code"] == "ICT" and user["profile_completed"] is True
    assert user["program"]["code"] == "ICT-CS" and user["program"]["is_active"] is True
    assert user["contacts"] == {"facebook": None, "instagram": None, "line": None}
    assert user["suspension"] is None
    # one time only — afterwards an admin changes it
    again = client.post(
        f"{API}/auth/onboarding", json=onboarding_body(db, "ENG", "ENG-ME"), headers=headers
    )
    assert again.status_code == 409
    actions = db.scalars(select(AuditLog.action).order_by(AuditLog.id)).all()
    assert "user.onboarding" in actions


def test_name_email_onboards_as_teacher_who_can_no_longer_announce(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    headers = google_session(client, make_user, "somsri.j@up.ac.th")
    done = client.post(f"{API}/auth/onboarding", json=onboarding_body(db), headers=headers)
    assert done.status_code == 200, done.text
    assert done.json()["role"] == "teacher"
    post = client.post(
        f"{API}/posts",
        json={
            "type": "announcement",
            "title": "ประกาศจากอาจารย์",
            "content": "x",
            "category_id": category_id(db, "general"),
        },
        headers=headers,
    )
    assert post.status_code == 403, post.text


@pytest.mark.parametrize(
    ("email", "body"),
    [
        ("67024999@up.ac.th", {"program_id": None}),  # a programme is required
        ("67024999@up.ac.th", {"program_id": "x"}),
        ("67024999@up.ac.th", {"year_of_study": 1}),  # year is gone
        ("67024999@up.ac.th", {"role": "teacher"}),  # the role is not chosen
    ],
)
def test_onboarding_validation(
    client: TestClient, db: Session, email: str, body: dict, make_user: UserFactory
) -> None:
    response = client.post(
        f"{API}/auth/onboarding",
        json={**onboarding_body(db), **body},
        headers=google_session(client, make_user, email),
    )
    assert response.status_code == 422


def test_onboarding_requires_both_fields(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    headers = google_session(client, make_user)
    only_faculty = {"faculty_id": faculty_id(db, "ICT")}
    assert (
        client.post(f"{API}/auth/onboarding", json=only_faculty, headers=headers).status_code == 422
    )
    only_program = {"program_id": program_id(db, "ICT-CS")}
    assert (
        client.post(f"{API}/auth/onboarding", json=only_program, headers=headers).status_code == 422
    )


def test_onboarding_program_must_belong_to_the_faculty_and_be_active(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    headers = google_session(client, make_user)
    wrong = client.post(
        f"{API}/auth/onboarding", json=onboarding_body(db, "ICT", "ENG-ME"), headers=headers
    )
    assert wrong.status_code == 422
    assert wrong.json()["error"]["details"][0]["field"] == "program_id"
    program = db.get(Program, program_id(db, "ICT-CGM"))
    program.is_active = False  # retired programmes cannot be chosen any more
    db.commit()
    try:
        retired = client.post(
            f"{API}/auth/onboarding", json=onboarding_body(db, "ICT", "ICT-CGM"), headers=headers
        )
        assert retired.status_code == 422
    finally:
        program.is_active = True
        db.commit()
    unknown = client.post(
        f"{API}/auth/onboarding",
        json={"faculty_id": faculty_id(db, "ICT"), "program_id": 999999},
        headers=headers,
    )
    assert unknown.status_code == 422


def test_onboarding_rejects_unknown_faculty(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    response = client.post(
        f"{API}/auth/onboarding",
        json={"faculty_id": 99999, "program_id": program_id(db, "ICT-CS")},
        headers=google_session(client, make_user),
    )
    assert response.status_code == 422


def test_faculties_come_with_their_active_programs(client: TestClient, db: Session) -> None:
    faculties = {f["code"]: f for f in client.get(f"{API}/faculties").json()}
    ict = faculties["ICT"]
    assert set(ict) == {"id", "code", "name_th", "name_en", "is_active", "admin_only", "programs"}
    assert ict["is_active"] is True
    codes = {p["code"] for p in ict["programs"]}
    assert {"ICT-CS", "ICT-IT"} <= codes
    assert all(p["faculty_id"] == ict["id"] and p["is_active"] for p in ict["programs"])
    assert set(ict["programs"][0]) == {
        "id",
        "faculty_id",
        "code",
        "name_th",
        "name_en",
        "is_active",
    }
    assert all("max_year_of_study" not in f for f in faculties.values())
    program = db.get(Program, program_id(db, "ICT-CGM"))
    program.is_active = False
    db.commit()
    try:
        again = {f["code"]: f for f in client.get(f"{API}/faculties").json()}
        assert "ICT-CGM" not in {p["code"] for p in again["ICT"]["programs"]}
    finally:
        program.is_active = True
        db.commit()


def test_profile_update_faculty_needs_a_matching_program(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    headers = google_session(client, make_user, "66011111@up.ac.th")
    client.post(f"{API}/auth/onboarding", json=onboarding_body(db), headers=headers)
    eng, ict = faculty_id(db, "ENG"), faculty_id(db, "ICT")
    # changing the faculty alone, or with a programme of another faculty: 422
    assert (
        client.patch(f"{API}/auth/me", json={"faculty_id": eng}, headers=headers).status_code == 422
    )
    mismatched = {"faculty_id": eng, "program_id": program_id(db, "ICT-IT")}
    assert client.patch(f"{API}/auth/me", json=mismatched, headers=headers).status_code == 422
    moved = client.patch(
        f"{API}/auth/me",
        json={"faculty_id": eng, "program_id": program_id(db, "ENG-ME")},
        headers=headers,
    )
    assert moved.status_code == 200
    assert moved.json()["faculty"]["code"] == "ENG" and moved.json()["program"]["code"] == "ENG-ME"
    # a programme of the current faculty can change on its own; a foreign one cannot
    switched = client.patch(
        f"{API}/auth/me", json={"program_id": program_id(db, "ENG-EE")}, headers=headers
    )
    assert switched.status_code == 200 and switched.json()["program"]["code"] == "ENG-EE"
    foreign = client.patch(
        f"{API}/auth/me", json={"program_id": program_id(db, "ICT-CS")}, headers=headers
    )
    assert foreign.status_code == 422
    assert (
        client.patch(f"{API}/auth/me", json={"faculty_id": 99999}, headers=headers).status_code
        == 422
    )
    assert (
        client.patch(f"{API}/auth/me", json={"year_of_study": 2}, headers=headers).status_code
        == 422
    )
    assert (
        client.patch(f"{API}/auth/me", json={"role": "admin"}, headers=headers).status_code == 422
    )
    back = client.patch(
        f"{API}/auth/me",
        json={"faculty_id": ict, "program_id": program_id(db, "ICT-SE")},
        headers=headers,
    )
    assert back.status_code == 200 and back.json()["program"]["code"] == "ICT-SE"


def test_users_edit_their_contacts_and_display_name(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    headers = google_session(client, make_user, "66011112@up.ac.th")
    client.post(f"{API}/auth/onboarding", json=onboarding_body(db), headers=headers)
    saved = client.patch(
        f"{API}/auth/me",
        json={
            "display_name": "ชื่อใหม่",
            "contacts": {
                "facebook": "  fb.com/somsri ",
                "instagram": "somsri_ig",
                "line": "@somsri",
            },
        },
        headers=headers,
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["display_name"] == "ชื่อใหม่"
    assert saved.json()["contacts"] == {
        "facebook": "fb.com/somsri",
        "instagram": "somsri_ig",
        "line": "@somsri",
    }
    # partial update leaves the rest; empty string and null clear a value
    partial = client.patch(
        f"{API}/auth/me", json={"contacts": {"facebook": "", "line": None}}, headers=headers
    )
    assert partial.json()["contacts"] == {"facebook": None, "instagram": "somsri_ig", "line": None}
    too_long = client.patch(
        f"{API}/auth/me", json={"contacts": {"line": "x" * 101}}, headers=headers
    )
    assert too_long.status_code == 422
    bad_key = client.patch(f"{API}/auth/me", json={"contacts": {"tiktok": "x"}}, headers=headers)
    assert bad_key.status_code == 422


def test_public_profile_shows_only_filled_contacts(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    owner = make_user(program="ICT-CS")
    owner.contact_instagram = "owner_ig"
    owner.contact_facebook = None
    db.commit()
    viewer = make_user(faculty="ENG")
    shown = client.get(f"{API}/users/{owner.id}", headers=auth(viewer))
    assert shown.status_code == 200, shown.text
    body = shown.json()
    assert set(body) == {"id", "display_name", "role", "faculty", "program", "contacts"}
    assert body["contacts"] == {"facebook": None, "instagram": "owner_ig", "line": None}
    assert body["program"]["code"] == "ICT-CS" and body["faculty"]["code"] == "ICT"
    assert "email" not in body
    assert client.get(f"{API}/users/{owner.id}").status_code == 401
    assert client.get(f"{API}/users/999999", headers=auth(viewer)).status_code == 404
    owner.is_active = False  # inactive users do not exist for others
    db.commit()
    assert client.get(f"{API}/users/{owner.id}", headers=auth(viewer)).status_code == 404


# ---------- student_club accounts may use any email ----------
def club_account(client: TestClient, make_user: UserFactory, email: str = "club.ict@gmail.com"):
    admin = make_user(RoleName.admin, "CENTRAL")
    created = client.post(
        f"{API}/admin/users",
        json={"email": email, "display_name": "สโมสร ICT", "role": "student_club"},
        headers=auth(admin),
    )
    return admin, created


def test_admin_may_create_a_student_club_with_a_non_up_email(
    client: TestClient, make_user: UserFactory
) -> None:
    _, created = club_account(client, make_user)
    assert created.status_code == 201, created.text
    assert (
        created.json()["email"] == "club.ict@gmail.com" and created.json()["role"] == "student_club"
    )


@pytest.mark.parametrize("role", ["student", "teacher", "technician", "building_staff", "admin"])
def test_other_roles_still_need_an_up_email(
    client: TestClient, db: Session, make_user: UserFactory, role: str
) -> None:
    admin = make_user(RoleName.admin, "CENTRAL")
    body = {"email": "someone@gmail.com", "display_name": "นอกมหาลัย", "role": role}
    if role == "teacher":
        body["faculty_id"] = faculty_id(db, "ICT")
    response = client.post(f"{API}/admin/users", json=body, headers=auth(admin))
    assert response.status_code == 422, response.text
    assert response.json()["error"]["details"][0]["field"] in {"email", "faculty_id"}


@pytest.mark.parametrize("email", ["not-an-email", "a@b", "@gmail.com", "a b@gmail.com", ""])
def test_admin_create_rejects_malformed_emails(
    client: TestClient, make_user: UserFactory, email: str
) -> None:
    admin = make_user(RoleName.admin, "CENTRAL")
    body = {"email": email, "display_name": "สโมสร", "role": "student_club"}
    assert client.post(f"{API}/admin/users", json=body, headers=auth(admin)).status_code == 422


def test_preregistered_club_signs_in_with_its_gmail_account(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    _, created = club_account(client, make_user)
    signed_in = exchange(client, supabase_token("Club.ICT@gmail.com"))
    assert signed_in.status_code == 200, signed_in.text
    user = signed_in.json()["user"]
    assert user["id"] == created.json()["id"] and user["role"] == "student_club"
    assert user["profile_completed"] is True


def test_non_up_google_accounts_stay_rejected_unless_a_club(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin = make_user(RoleName.admin, "CENTRAL")
    # unknown gmail
    unknown = exchange(client, supabase_token("stranger@gmail.com"))
    assert unknown.status_code == 403
    assert unknown.json()["error"]["code"] == "EMAIL_DOMAIN_NOT_ALLOWED"
    # a deactivated club cannot come back through the exception
    _, created = club_account(client, make_user, "closed.club@gmail.com")
    client.patch(
        f"{API}/admin/users/{created.json()['id']}", json={"is_active": False}, headers=auth(admin)
    )
    assert exchange(client, supabase_token("closed.club@gmail.com")).status_code == 403
    # a non-club user with a non-UP address (e.g. data from before) is not admitted either
    other = make_user(RoleName.teacher, email="teacher.private@gmail.com")
    assert other.id
    assert exchange(client, supabase_token("teacher.private@gmail.com")).status_code == 403
    # and an unverified Google email never gets in, even for a club
    club_account(client, make_user, "unverified.club@gmail.com")
    refused = exchange(client, supabase_token("unverified.club@gmail.com", verified=False))
    assert (
        refused.status_code == 403 and refused.json()["error"]["code"] == "GOOGLE_ACCOUNT_REJECTED"
    )


def test_admin_created_account_signs_in_with_google_and_keeps_its_role(
    client: TestClient, db: Session, make_user: UserFactory
) -> None:
    admin = make_user(RoleName.admin, "CENTRAL")
    created = client.post(
        f"{API}/admin/users",
        json={
            "email": "Facilities.Office@up.ac.th",
            "display_name": "กองอาคารสถานที่",
            "role": "building_staff",
        },
        headers=auth(admin),
    )
    assert created.status_code == 201, created.text
    assert created.json()["has_password"] is False
    assert created.json()["profile_completed"] is True
    signed_in = exchange(client, supabase_token("facilities.office@up.ac.th"))
    assert signed_in.status_code == 200
    user = signed_in.json()["user"]
    assert user["id"] == created.json()["id"]
    assert user["role"] == "building_staff" and user["profile_completed"] is True
    # Google only: there is no password to log in with
    login = client.post(
        f"{API}/auth/login",
        json={"email": "facilities.office@up.ac.th", "password": PASSWORD},
    )
    assert login.status_code == 401
    actions = db.scalars(select(AuditLog.action).order_by(AuditLog.id)).all()
    assert "user.create" in actions


def test_admin_created_technician_gets_a_profile(
    client: TestClient, make_user: UserFactory
) -> None:
    admin = make_user(RoleName.admin, "CENTRAL")
    created = client.post(
        f"{API}/admin/users",
        json={
            "email": "tech.zone.a@up.ac.th",
            "display_name": "ช่างโซน A",
            "role": "technician",
            "technician_specialty": "ไฟฟ้า",
        },
        headers=auth(admin),
    )
    assert created.status_code == 201 and created.json()["is_technician"] is True


ADMIN_CREATE_CASES = [
    ({"email": "x@gmail.com", "display_name": "นอกมหาลัย", "role": "building_staff"}, 422),
    ({"email": "t@up.ac.th", "display_name": "อาจารย์", "role": "teacher"}, 422),  # no faculty
    (
        {"email": "c@up.ac.th", "display_name": "ชมรม", "role": "student_club", "year_of_study": 2},
        422,  # year is gone
    ),
    (
        {
            "email": "c@up.ac.th",
            "display_name": "ชมรม",
            "role": "student_club",
            "program_id": 99999,
        },
        422,  # unknown programme
    ),
    ({"email": "dup@up.ac.th", "display_name": "ซ้ำ", "role": "admin"}, 409),
]


@pytest.mark.parametrize(("body", "status"), ADMIN_CREATE_CASES)
def test_admin_create_user_validation(
    client: TestClient, make_user: UserFactory, body: dict, status: int
) -> None:
    admin = make_user(RoleName.admin, "CENTRAL")
    make_user(email="dup@up.ac.th")
    response = client.post(f"{API}/admin/users", json=body, headers=auth(admin))
    assert response.status_code == status, response.text


def test_only_admins_create_accounts(client: TestClient, make_user: UserFactory) -> None:
    body = {"email": "new.club@up.ac.th", "display_name": "ชมรมใหม่", "role": "student_club"}
    for role in (RoleName.building_staff, RoleName.teacher, RoleName.student):
        response = client.post(f"{API}/admin/users", json=body, headers=auth(make_user(role)))
        assert response.status_code == 403


def test_admin_role_change_completes_onboarding(client: TestClient, make_user: UserFactory) -> None:
    admin = make_user(RoleName.admin, "CENTRAL")
    pending = make_user(onboarding=True)
    changed = client.patch(
        f"{API}/admin/users/{pending.id}", json={"role": "student_club"}, headers=auth(admin)
    )
    assert changed.status_code == 200 and changed.json()["profile_completed"] is True
