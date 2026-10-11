import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import CITEXT, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, created_at_column, pg_enum
from app.models.enums import PermissionScope, RoleName


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    name: Mapped[RoleName] = mapped_column(pg_enum(RoleName, "role_name"), unique=True)
    weight: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)

    permissions: Mapped[list["RolePermission"]] = relationship(back_populates="role")


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    description: Mapped[str | None] = mapped_column(Text)


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_id: Mapped[int] = mapped_column(
        ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    )
    permission_id: Mapped[int] = mapped_column(
        ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True
    )
    scope: Mapped[PermissionScope] = mapped_column(
        pg_enum(PermissionScope, "permission_scope"),
        nullable=False,
        default=PermissionScope.any,
    )

    role: Mapped[Role] = relationship(back_populates="permissions")
    permission: Mapped[Permission] = relationship()


class Faculty(Base):
    __tablename__ = "faculties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True)
    name_th: Mapped[str] = mapped_column(String(200))
    name_en: Mapped[str | None] = mapped_column(String(200))
    # retired faculties are hidden from pickers but stay attached to existing users / posts
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))

    # the university-central / building-division unit: only an admin can assign it to a user
    admin_only: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))

    programs: Mapped[list["Program"]] = relationship(
        back_populates="faculty", order_by="Program.name_th", lazy="select"
    )


class Program(Base):
    """Study programme (สาขาวิชา). IDs are stable: renaming keeps the id, retiring sets
    is_active=false (never deleted)."""

    __tablename__ = "programs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    faculty_id: Mapped[int] = mapped_column(ForeignKey("faculties.id"), index=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    name_th: Mapped[str] = mapped_column(String(200))
    name_en: Mapped[str | None] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    created_at: Mapped[datetime] = created_at_column()

    faculty: Mapped[Faculty] = relationship(back_populates="programs")


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    # self-service sign-in is @up.ac.th only; admin-created student_club accounts may use any
    # address (enforced in the services, not in the database)
    email: Mapped[str] = mapped_column(CITEXT, unique=True)
    # NULL for accounts that only sign in with Google (ADR-003); admin / demo keep a password
    password_hash: Mapped[str | None] = mapped_column(Text)
    # Supabase Auth user id (`sub` of the Supabase JWT) once the account signed in with Google
    supabase_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), unique=True)
    display_name: Mapped[str] = mapped_column(String(60))
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"))
    faculty_id: Mapped[int | None] = mapped_column(ForeignKey("faculties.id"))
    program_id: Mapped[int | None] = mapped_column(ForeignKey("programs.id"), index=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    # Denormalised from posting_suspensions (source of truth) so every response can show it
    posting_suspended_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    contact_facebook: Mapped[str | None] = mapped_column(String(100))
    contact_instagram: Mapped[str | None] = mapped_column(String(100))
    contact_line: Mapped[str | None] = mapped_column(String(100))
    # NULL until a self-registered account picks its role (student / teacher) at first sign-in;
    # admin-created, seeded and pre-existing accounts are complete from the start
    profile_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_column()
    # Soft delete (admin): the row stays so posts / reports / audit entries keep their author
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    role: Mapped[Role] = relationship(lazy="joined", foreign_keys=[role_id])
    faculty: Mapped[Faculty | None] = relationship(lazy="joined")
    program: Mapped[Program | None] = relationship(lazy="joined")
    technician: Mapped["Technician | None"] = relationship(
        back_populates="user", lazy="selectin", uselist=False
    )

    @property
    def role_name(self) -> RoleName:
        return self.role.name


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    family_id: Mapped[str] = mapped_column(String(36), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_column()


class Technician(Base):
    __tablename__ = "technicians"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    specialty: Mapped[str | None] = mapped_column(String(100))
    zone: Mapped[str | None] = mapped_column(String(100))
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)

    user: Mapped[User] = relationship(back_populates="technician", lazy="joined")
