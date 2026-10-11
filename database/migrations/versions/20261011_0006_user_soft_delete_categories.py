"""Soft delete for user accounts; post categories reduced to the real areas

Schema changes:
- users.deleted_at / users.deleted_by (FK users, ON DELETE SET NULL): an admin-deleted account is
  kept as a row so posts, reports and audit entries still reference it; the service rewrites its
  e-mail, disables it and revokes its sessions.

- post_categories: `urgent` (เรื่องเร่งด่วน) and `recommendations` (บอกต่อของดี) are removed (their
  posts move to `general`); `announcement` is added (bound to announcements), `activities` is
  bound to events and relabelled "กิจกรรม", `general` becomes "โพสต์ทั่วไป". Categories are normally
  seeded by database/seeders/seed.py, so every step is a no-op on a database without them.
  Downgrade re-creates the two removed rows (moved posts stay in `general`).

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-11 12:00:00+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


REMOVED = ("urgent", "recommendations")


def upgrade() -> None:
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("deleted_by", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_users_deleted_by_users", "users", "users", ["deleted_by"], ["id"], ondelete="SET NULL"
    )
    op.execute(
        """
        INSERT INTO post_categories (slug, name_th, allowed_type)
        SELECT 'general', 'โพสต์ทั่วไป', NULL
        WHERE EXISTS (SELECT 1 FROM post_categories) AND NOT EXISTS (
            SELECT 1 FROM post_categories WHERE slug = 'general')
        """
    )
    op.execute(
        """
        INSERT INTO post_categories (slug, name_th, allowed_type)
        SELECT 'announcement', 'ประกาศ', 'announcement'
        WHERE EXISTS (SELECT 1 FROM post_categories) AND NOT EXISTS (
            SELECT 1 FROM post_categories WHERE slug = 'announcement')
        """
    )
    op.execute(
        "UPDATE posts SET category_id = (SELECT id FROM post_categories WHERE slug = 'general') "
        "WHERE category_id IN (SELECT id FROM post_categories WHERE slug IN ('urgent', 'recommendations'))"
    )
    op.execute("DELETE FROM post_categories WHERE slug IN ('urgent', 'recommendations')")
    op.execute("UPDATE post_categories SET name_th = 'โพสต์ทั่วไป' WHERE slug = 'general'")
    op.execute(
        "UPDATE post_categories SET name_th = 'กิจกรรม', allowed_type = 'event' "
        "WHERE slug = 'activities'"
    )


def downgrade() -> None:
    op.execute(
        """
        INSERT INTO post_categories (slug, name_th, allowed_type)
        SELECT v.slug, v.name_th, NULL
        FROM (VALUES ('urgent', 'เรื่องเร่งด่วน'), ('recommendations', 'บอกต่อของดี'))
            AS v(slug, name_th)
        WHERE EXISTS (SELECT 1 FROM post_categories)
          AND NOT EXISTS (SELECT 1 FROM post_categories c WHERE c.slug = v.slug)
        """
    )
    op.execute("UPDATE post_categories SET allowed_type = NULL WHERE slug = 'activities'")
    op.drop_constraint("fk_users_deleted_by_users", "users", type_="foreignkey")
    op.drop_column("users", "deleted_by")
    op.drop_column("users", "deleted_at")
