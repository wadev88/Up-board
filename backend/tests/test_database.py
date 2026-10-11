"""Database-level guarantees: constraints hold even if application code is bypassed, and the
seeded RBAC tables mirror the runtime permission matrix."""

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.permissions import PERMISSION_MATRIX
from app.models import Permission, PostCategory, PostType, Role, RolePermission


def test_seeded_role_permissions_match_matrix(db: Session) -> None:
    rows = db.execute(
        select(Role.name, Permission.code, RolePermission.scope)
        .join(RolePermission, RolePermission.role_id == Role.id)
        .join(Permission, Permission.id == RolePermission.permission_id)
    ).all()
    seeded = {(role, code, scope) for role, code, scope in rows}
    expected = {
        (role, code, scope)
        for role, grants in PERMISSION_MATRIX.items()
        for code, scope in grants.items()
    }
    assert seeded == expected


def test_type_bound_categories_are_seeded(db: Session) -> None:
    bound = dict(db.execute(select(PostCategory.slug, PostCategory.allowed_type)).all())
    assert bound["repair"] is PostType.repair
    assert bound["lost-found"] is PostType.lost_found
    assert bound["announcement"] is PostType.announcement
    assert bound["activities"] is PostType.event
    assert set(bound) == {"general", "announcement", "activities", "lost-found", "repair"}


def test_email_domain_is_no_longer_a_database_rule(db: Session) -> None:
    """The @up.ac.th rule (with the student_club exception) lives in the services now."""
    exists = db.scalar(
        text("SELECT count(*) FROM pg_constraint WHERE conname = 'ck_users_email_up_domain'")
    )
    assert exists == 0
    db.execute(
        text(
            "INSERT INTO users (email, password_hash, display_name, role_id, is_verified, "
            "is_active, token_version, created_at) "
            "VALUES ('club@gmail.com', 'x', 'x', 1, true, true, 0, now())"
        )
    )
    db.rollback()


def test_year_of_study_column_is_gone(db: Session) -> None:
    columns = set(
        db.scalars(
            text("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'")
        )
    )
    assert "year_of_study" not in columns
    assert {"program_id", "contact_facebook", "contact_instagram", "contact_line"} <= columns


def test_programs_are_seeded_per_faculty_with_unique_codes(db: Session) -> None:
    rows = db.execute(text("SELECT code, faculty_id FROM programs")).all()
    assert len(rows) > 20 and len({code for code, _ in rows}) == len(rows)
    with pytest.raises(IntegrityError):
        db.execute(
            text(
                "INSERT INTO programs (faculty_id, code, name_th, is_active, created_at) "
                "VALUES (1, 'ICT-CS', 'ซ้ำ', true, now())"
            )
        )
    db.rollback()


def test_pin_checks_and_unique_index_changes(db: Session) -> None:
    names = set(
        db.scalars(text("SELECT conname FROM pg_constraint WHERE conrelid = 'posts'::regclass"))
    )
    assert "ck_posts_pin_window_max_72h" not in names
    assert {"ck_posts_pin_fields_together", "ck_posts_related_repair_announcements_only"} <= names
    indexes = set(db.scalars(text("SELECT indexname FROM pg_indexes WHERE tablename = 'posts'")))
    assert "uq_posts_pinned_by" not in indexes


def test_repair_status_enum_values(db: Session) -> None:
    values = list(
        db.scalars(
            text(
                "SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid "
                "WHERE t.typname = 'repair_status' ORDER BY e.enumsortorder"
            )
        )
    )
    assert values == ["open", "assigned", "in_progress", "pending_review", "closed", "rejected"]


def test_email_is_case_insensitive_unique(db: Session) -> None:
    insert = text(
        "INSERT INTO users (email, password_hash, display_name, role_id, is_verified, is_active, "
        "token_version, created_at) VALUES (:e, 'x', 'x', 1, true, true, 0, now())"
    )
    db.execute(insert, {"e": "Same@up.ac.th"})
    with pytest.raises(IntegrityError):
        db.execute(insert, {"e": "same@UP.AC.TH"})
    db.rollback()


def test_get_db_closes_session_even_when_request_is_cancelled() -> None:
    """Regression (NFR-11 load test): a client disconnect must never leak a pooled connection."""
    import anyio

    from app.db import engine, get_db

    async def scenario() -> None:
        checked_out_before = engine.pool.checkedout()
        dependency = get_db()
        session = await dependency.__anext__()
        session.execute(text("SELECT 1"))  # holds a connection, transaction open
        assert engine.pool.checkedout() == checked_out_before + 1
        with anyio.CancelScope() as scope:
            scope.cancel()  # simulate the request task being cancelled
            await dependency.aclose()
        assert engine.pool.checkedout() == checked_out_before

    anyio.run(scenario)


# ---------- ADR-003 (migration 0002) ----------
def test_every_table_has_row_level_security(db: Session) -> None:
    """Supabase exposes `public` through PostgREST; RLS without policies blocks anon /
    authenticated there, while the API (table owner) is unaffected."""
    rows = db.execute(
        text("SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = "
             "c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'")
    ).all()  # fmt: skip
    assert rows and all(enabled for _, enabled in rows), [n for n, e in rows if not e]


def test_ends_at_required_is_enforced_for_new_rows_only(db: Session) -> None:
    validated = db.scalar(
        text("SELECT convalidated FROM pg_constraint WHERE conname = 'ck_events_ends_at_required'")
    )
    assert validated is False  # NOT VALID: legacy rows untouched, new writes checked


def test_seven_roles_are_seeded(db: Session) -> None:
    names = set(db.scalars(select(Role.name)).all())
    assert {n.value for n in names} == {
        "student",
        "teacher",
        "technician",
        "building_staff",
        "student_club",
        "admin",
    }


def test_suspension_must_end_after_it_starts(db: Session) -> None:
    db.execute(
        text(
            "INSERT INTO users (id, email, password_hash, display_name, role_id, is_verified, "
            "is_active, token_version, created_at) VALUES (900, 'x900@up.ac.th', NULL, 'x', 1, "
            "true, true, 0, now())"
        )
    )
    with pytest.raises(IntegrityError):
        db.execute(
            text(
                "INSERT INTO posting_suspensions (user_id, starts_at, ends_at, reason) "
                "VALUES (900, now(), now() - interval '1 day', 'x')"
            )
        )
    db.rollback()
