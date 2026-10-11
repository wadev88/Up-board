"""Admin catalog of faculties and programmes (สาขาวิชา).

IDs are stable: renaming keeps the id and retiring sets `is_active=false` - rows are never
deleted, and retired faculties / programmes stay attached to existing users and posts. Every change
is written to audit_logs (entity `faculty` / `program`, meta before/after)."""

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError, not_found
from app.models import Faculty, Program, User
from app.services.activity import audit
from app.validators.schemas import (
    FacultyCreateIn,
    FacultyUpdateIn,
    ProgramCreateIn,
    ProgramUpdateIn,
)


def _faculty_state(f: Faculty) -> dict[str, object]:
    return {"code": f.code, "name_th": f.name_th, "name_en": f.name_en, "is_active": f.is_active}


def _program_state(p: Program) -> dict[str, object]:
    return {
        "code": p.code,
        "faculty_id": p.faculty_id,
        "name_th": p.name_th,
        "name_en": p.name_en,
        "is_active": p.is_active,
    }


def list_faculties(db: Session) -> list[tuple[Faculty, list[Program]]]:
    """Every faculty (also inactive) with all of its programmes."""
    programs = db.scalars(select(Program).order_by(Program.name_th, Program.id)).all()
    by_faculty: dict[int, list[Program]] = {}
    for program in programs:
        by_faculty.setdefault(program.faculty_id, []).append(program)
    faculties = db.scalars(select(Faculty).order_by(Faculty.name_th, Faculty.id)).all()
    return [(f, by_faculty.get(f.id, [])) for f in faculties]


def _get_faculty(db: Session, faculty_id: int) -> Faculty:
    faculty = db.get(Faculty, faculty_id)
    if faculty is None:
        raise not_found("Faculty")
    return faculty


def create_faculty(db: Session, admin: User, data: FacultyCreateIn) -> Faculty:
    faculty = Faculty(
        code=data.code, name_th=data.name_th, name_en=data.name_en, is_active=data.is_active
    )
    db.add(faculty)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "CONFLICT", "A faculty with this code already exists") from exc
    audit(db, admin, "faculty.create", "faculty", faculty.id, {"after": _faculty_state(faculty)})
    db.commit()
    return faculty


def update_faculty(db: Session, admin: User, faculty_id: int, data: FacultyUpdateIn) -> Faculty:
    faculty = _get_faculty(db, faculty_id)
    before = _faculty_state(faculty)
    fields = data.model_fields_set
    if data.name_th is not None:
        faculty.name_th = data.name_th
    if "name_en" in fields:
        faculty.name_en = data.name_en or None
    if data.is_active is not None:
        faculty.is_active = data.is_active
    after = _faculty_state(faculty)
    if after != before:
        audit(
            db, admin, "faculty.update", "faculty", faculty.id, {"before": before, "after": after}
        )
    db.commit()
    return faculty


def create_program(db: Session, admin: User, data: ProgramCreateIn) -> Program:
    _get_faculty(db, data.faculty_id)
    program = Program(
        faculty_id=data.faculty_id,
        code=data.code,
        name_th=data.name_th,
        name_en=data.name_en,
        is_active=data.is_active,
    )
    db.add(program)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "CONFLICT", "A programme with this code already exists") from exc
    audit(db, admin, "program.create", "program", program.id, {"after": _program_state(program)})
    db.commit()
    return program


def update_program(db: Session, admin: User, program_id: int, data: ProgramUpdateIn) -> Program:
    program = db.get(Program, program_id)
    if program is None:
        raise not_found("Program")
    before = _program_state(program)
    fields = data.model_fields_set
    if data.name_th is not None:
        program.name_th = data.name_th
    if "name_en" in fields:
        program.name_en = data.name_en or None
    if data.is_active is not None:
        program.is_active = data.is_active
    if data.faculty_id is not None and data.faculty_id != program.faculty_id:
        _get_faculty(db, data.faculty_id)
        attached = db.scalar(select(func.count(User.id)).where(User.program_id == program.id))
        if attached:
            raise AppError(
                409,
                "CONFLICT",
                "Users are attached to this programme; retire it and create a new one instead",
            )
        program.faculty_id = data.faculty_id
    after = _program_state(program)
    if after != before:
        audit(
            db, admin, "program.update", "program", program.id, {"before": before, "after": after}
        )
    db.commit()
    return program
