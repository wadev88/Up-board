"""Test harness: a real PostgreSQL database (constraints, enums and CITEXT matter), migrated with
Alembic once per session and truncated between tests.

Set TEST_DATABASE_URL to point at a disposable database, e.g.
    postgresql+psycopg://upboard:upboard_test_pw@localhost:55432/upboard_test
"""

import os
import subprocess
import sys
import uuid
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
TEST_DB = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://upboard:upboard_test_pw@localhost:55432/upboard_test"
)
os.environ.update(
    {
        "DATABASE_URL": TEST_DB,
        "JWT_SECRET": "test-secret-test-secret-test-secret-0123456789",
        "ENVIRONMENT": "test",
        "RATE_LIMIT_ENABLED": "false",
        "SPAM_POLICY_ENABLED": "false",
        "REPAIR_COOLDOWN_SECONDS": "0",  # cooldown tests switch it on with settings(...)
        "PASSWORD_SIGNUP_ENABLED": "true",
        "CORS_ORIGINS": "http://localhost:3000",
        "PUBLIC_API_URL": "http://testserver",
    }
)

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select, text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.core.clock import utcnow  # noqa: E402
from app.core.security import create_access_token, hash_password  # noqa: E402
from app.db import SessionLocal, engine  # noqa: E402
from app.models import (  # noqa: E402
    Faculty,
    PostCategory,
    Program,
    Role,
    RoleName,
    Technician,
    User,
)

MUTABLE_TABLES = (
    "posting_suspensions, posting_violations, audit_logs, notifications, report_actions, reports, "
    "attachments, repair_status_history, "
    "repair_requests, lost_found_items, events, posts, technicians, refresh_tokens, users"
)
PASSWORD = "Password123"


@pytest.fixture(scope="session", autouse=True)
def _database(tmp_path_factory: pytest.TempPathFactory) -> Iterator[None]:
    os.environ["UPLOAD_DIR"] = str(tmp_path_factory.mktemp("uploads"))
    get_settings.cache_clear()
    with engine.connect() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
        conn.commit()
    env = {**os.environ, "DATABASE_URL": TEST_DB}
    alembic = [sys.executable, "-m", "alembic"]
    subprocess.run(
        [*alembic, "upgrade", "head"], cwd=BACKEND, env=env, check=True, capture_output=True
    )
    sys.path.insert(0, str(REPO / "database" / "seeders"))
    import seed

    with SessionLocal() as db:
        seed.seed_reference(db)
    yield


@pytest.fixture(autouse=True)
def _clean() -> Iterator[None]:
    yield
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {MUTABLE_TABLES} RESTART IDENTITY CASCADE"))
        # catalog rows created by tests (users are gone, so nothing references them)
        conn.execute(text("DELETE FROM programs WHERE code LIKE 'TEST-%'"))
        conn.execute(text("DELETE FROM faculties WHERE code LIKE 'TEST%'"))


@pytest.fixture
def db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client() -> Iterator[TestClient]:
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


def faculty_id(db: Session, code: str) -> int:
    return db.scalars(select(Faculty.id).where(Faculty.code == code)).one()


def program_id(db: Session, code: str) -> int:
    return db.scalars(select(Program.id).where(Program.code == code)).one()


def category_id(db: Session, slug: str) -> int:
    return db.scalars(select(PostCategory.id).where(PostCategory.slug == slug)).one()


UserFactory = Callable[..., User]


@pytest.fixture
def make_user(db: Session) -> UserFactory:
    counter = {"n": 0}

    def factory(
        role: RoleName = RoleName.student,
        faculty: str = "ICT",
        *,
        technician: bool = False,
        verified: bool = True,
        active: bool = True,
        email: str | None = None,
        onboarding: bool = False,
        program: str | None = None,
    ) -> User:
        counter["n"] += 1
        role_id = db.scalars(select(Role.id).where(Role.name == role)).one()
        user = User(
            email=email or f"{role.value}{counter['n']}@up.ac.th",
            password_hash=hash_password(PASSWORD),
            display_name=f"{role.value.title()} {counter['n']}",
            role_id=role_id,
            faculty_id=faculty_id(db, faculty),
            program_id=program_id(db, program) if program else None,
            is_verified=verified,
            is_active=active,
            token_version=0,
            profile_completed_at=None if onboarding else utcnow(),
        )
        db.add(user)
        db.flush()
        if technician or role is RoleName.technician:
            db.add(Technician(user_id=user.id, specialty="ไฟฟ้า", zone="ICT"))
        db.commit()
        db.refresh(user)
        return user

    return factory


def attachment_id(user: User) -> int:
    """An uploaded (unattached) photo owned by `user` - repair requests need at least one."""
    from app.models import Attachment

    with SessionLocal() as session:
        row = Attachment(
            uploaded_by=user.id,
            storage_key=f"{uuid.uuid4().hex}.jpg",
            mime_type="image/jpeg",
            size_bytes=1234,
        )
        session.add(row)
        session.commit()
        return row.id


def auth(user: User) -> dict[str, str]:
    token, _ = create_access_token(user.id, user.role_name.value, user.token_version)
    return {"Authorization": f"Bearer {token}"}


API = "/api/v1"


@pytest.fixture
def settings(monkeypatch: pytest.MonkeyPatch) -> Callable[..., None]:
    """Override settings for one test: `settings(spam_policy_enabled=True)`."""

    def override(**values: object) -> None:
        current = get_settings()
        for key, value in values.items():
            monkeypatch.setattr(current, key, value)

    return override
