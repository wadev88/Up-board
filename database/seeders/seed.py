"""Idempotent seeders for UP Board.

Usage (from repo root, with DATABASE_URL and JWT_SECRET set and migrations applied):
    python database/seeders/seed.py            # roles, permissions, faculties, categories, bootstrap admin
    python database/seeders/seed.py --demo     # + demo users and posts (refused when ENVIRONMENT=production)

Bootstrap admin: BOOTSTRAP_ADMIN_EMAIL (@up.ac.th) and BOOTSTRAP_ADMIN_PASSWORD env vars.
Demo users share DEMO_PASSWORD (default only for local development).
"""

import argparse
import os
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.clock import utcnow
from app.core.permissions import (
    PERMISSION_DESCRIPTIONS,
    PERMISSION_MATRIX,
    ROLE_WEIGHTS,
)
from app.core.security import hash_password, verify_password
from app.db import SessionLocal
from app.models import (
    Event,
    EventPriority,
    Faculty,
    LostFoundItem,
    LostFoundStatus,
    Permission,
    Post,
    PostCategory,
    PostType,
    Priority,
    Program,
    RepairRequest,
    RepairStatus,
    RepairStatusHistory,
    Role,
    RoleName,
    RolePermission,
    Technician,
    User,
)

# local development only — seed_demo refuses to run in production
DEFAULT_DEMO_PASSWORD = "UpBoard-demo-2026"  # noqa: S105

FACULTIES = [
    (
        "CENTRAL",
        "ส่วนกลางมหาวิทยาลัย / กองอาคารสถานที่",
        "Central Administration / Facilities",
    ),
    (
        "AGRI",
        "คณะเกษตรศาสตร์และทรัพยากรธรรมชาติ",
        "School of Agriculture and Natural Resources",
    ),
    ("SENV", "คณะพลังงานและสิ่งแวดล้อม", "School of Energy and Environment"),
    (
        "ICT",
        "คณะเทคโนโลยีสารสนเทศและการสื่อสาร",
        "School of Information and Communication Technology",
    ),
    ("LAW", "คณะนิติศาสตร์", "School of Law"),
    ("BUSCOM", "คณะบริหารธุรกิจและนิเทศศาสตร์", "School of Business and Communication Arts"),
    ("NURSE", "คณะพยาบาลศาสตร์", "School of Nursing"),
    ("MED", "คณะแพทยศาสตร์", "School of Medicine"),
    ("DENT", "คณะทันตแพทยศาสตร์", "School of Dentistry"),
    ("PHARM", "คณะเภสัชศาสตร์", "School of Pharmaceutical Sciences"),
    ("SCI", "คณะวิทยาศาสตร์", "School of Science"),
    ("MEDSCI", "คณะวิทยาศาสตร์การแพทย์", "School of Medical Sciences"),
    ("ENG", "คณะวิศวกรรมศาสตร์", "School of Engineering"),
    ("LA", "คณะศิลปศาสตร์", "School of Liberal Arts"),
    (
        "ARCH",
        "คณะสถาปัตยกรรมศาสตร์และศิลปกรรมศาสตร์",
        "School of Architecture and Fine Arts",
    ),
    ("AHS", "คณะสหเวชศาสตร์", "School of Allied Health Sciences"),
    ("PH", "คณะสาธารณสุขศาสตร์", "School of Public Health"),
    ("POLSCI", "คณะรัฐศาสตร์และสังคมศาสตร์", "School of Political and Social Sciences"),
    ("EDU", "วิทยาลัยการศึกษา", "School of Education"),
]

# Faculties only an admin can assign to a user (hidden from the self-service pickers).
ADMIN_ONLY_FACULTIES = {"CENTRAL"}

# Study programmes (สาขาวิชา) per faculty code: (program code, name_th, name_en).
# The list follows the University of Phayao official faculty/programme list provided by the team.
# Codes are stable ids for the seeder; admins maintain the live catalog at /admin/catalog
# (rename = same id, retire = is_active=false; rows are never deleted). Existing rows are never
# overwritten here. CENTRAL-STAFF is not a study programme: it is the placeholder programme of the
# admin / building-staff / technician accounts that are created by the seeder.
PROGRAMS: dict[str, list[tuple[str, str, str]]] = {
    "CENTRAL": [("CENTRAL-STAFF", "บุคลากรส่วนกลาง", "Central staff")],
    "AGRI": [
        ("AGRI-AGRI", "เกษตรศาสตร์", "Agriculture"),
        ("AGRI-FISH", "เทคโนโลยีนวัตกรรมการประมง", "Fishery Innovation Technology"),
        ("AGRI-FSAFE", "ความปลอดภัยทางอาหาร", "Food Safety"),
        ("AGRI-FOOD", "วิทยาศาสตร์และเทคโนโลยีการอาหาร", "Food Science and Technology"),
        ("AGRI-ANIMAL", "สัตวศาสตร์", "Animal Science"),
        ("AGRI-TECH", "เทคโนโลยีการเกษตร", "Agricultural Technology"),
    ],
    "DENT": [("DENT-DDS", "ทันตแพทยศาสตร์", "Dentistry")],
    "ICT": [
        ("ICT-CGM", "คอมพิวเตอร์กราฟิกและมัลติมีเดีย", "Computer Graphics and Multimedia"),
        ("ICT-DB", "ธุรกิจดิจิทัล", "Digital Business"),
        ("ICT-IT", "เทคโนโลยีสารสนเทศ", "Information Technology"),
        ("GIS", "ภูมิสารสนเทศศาสตร์", "Geo-informatics"),
        ("ICT-DSA", "วิทยาการข้อมูลและการประยุกต์", "Data Science and Applications"),
        ("ICT-CS", "วิทยาการคอมพิวเตอร์", "Computer Science"),
        ("ICT-CE", "วิศวกรรมคอมพิวเตอร์", "Computer Engineering"),
        ("ICT-SE", "วิศวกรรมซอฟต์แวร์", "Software Engineering"),
    ],
    "LAW": [("LAW-LLB", "นิติศาสตร์", "Law")],
    "BUSCOM": [
        ("BUSCOM-ECON", "เศรษฐศาสตร์", "Economics"),
        ("BUSCOM-COMM", "การจัดการการสื่อสาร", "Communication Management"),
        ("BUSCOM-NEWMEDIA", "การสื่อสารสื่อใหม่", "New Media Communication"),
        ("BUSCOM-FIN", "การเงินและการลงทุน", "Finance and Investment"),
        ("BUSCOM-BM", "การจัดการธุรกิจ", "Business Management"),
        ("BUSCOM-DM", "การตลาดดิจิทัล", "Digital Marketing"),
        ("BUSCOM-ACC", "การบัญชี", "Accounting"),
        ("BUSCOM-TOUR", "การท่องเที่ยวและการโรงแรม", "Tourism and Hotel Management"),
    ],
    "NURSE": [("NURSE-BN", "พยาบาลศาสตร์", "Nursing Science")],
    "SENV": [
        ("SENV-ENVENG", "วิศวกรรมสิ่งแวดล้อม", "Environmental Engineering"),
        ("SENV-EEM", "การจัดการพลังงานและสิ่งแวดล้อม", "Energy and Environmental Management"),
    ],
    "MED": [
        ("MED-MD", "แพทยศาสตร์", "Medicine"),
        ("MED-EMS", "ปฏิบัติการฉุกเฉินการแพทย์", "Emergency Medical Operations"),
    ],
    "PHARM": [
        ("PHARM-PC", "บริบาลทางเภสัชกรรม", "Pharmaceutical Care"),
        ("PHARM-COS", "วิทยาศาสตร์เครื่องสำอาง", "Cosmetic Science"),
    ],
    "POLSCI": [
        ("POLSCI-POL", "รัฐศาสตร์", "Political Science"),
        ("POLSCI-PIM", "การจัดการนวัตกรรมสาธารณะ", "Public Innovation Management"),
        ("POLSCI-SOCDEV", "พัฒนาสังคม", "Social Development"),
    ],
    "SCI": [
        ("SCI-CHEM", "เคมี", "Chemistry"),
        ("SCI-MATH", "คณิตศาสตร์", "Mathematics"),
        ("SCI-BIO", "ชีววิทยา", "Biology"),
        ("SCI-PHY", "ฟิสิกส์", "Physics"),
        ("SCI-SPORT", "วิทยาศาสตร์การออกกำลังกายและการกีฬา", "Exercise and Sports Science"),
        ("SCI-STAT", "สถิติประยุกต์และการจัดการข้อมูล", "Applied Statistics and Data Management"),
    ],
    "MEDSCI": [
        ("MEDSCI-NUTR", "โภชนาการและการกำหนดอาหาร", "Nutrition and Dietetics"),
        ("MEDSCI-MICRO", "จุลชีววิทยา", "Microbiology"),
        ("MEDSCI-BIOCHEM", "ชีวเคมี", "Biochemistry"),
    ],
    "ENG": [
        ("ENG-ME", "วิศวกรรมเครื่องกล", "Mechanical Engineering"),
        ("ENG-CIVIL", "วิศวกรรมโยธา", "Civil Engineering"),
        ("ENG-EE", "วิศวกรรมไฟฟ้า", "Electrical Engineering"),
        ("ENG-IE", "วิศวกรรมอุตสาหการ", "Industrial Engineering"),
    ],
    "LA": [
        ("LA-TH", "ภาษาไทย", "Thai"),
        ("LA-ZH", "ภาษาจีน", "Chinese"),
        ("LA-JA", "ภาษาญี่ปุ่น", "Japanese"),
        ("LA-FR", "ภาษาฝรั่งเศส", "French"),
        ("LA-EN", "ภาษาอังกฤษ", "English"),
    ],
    "ARCH": [
        ("ARCH-MUSIC", "ดนตรีและนาฏศิลป์", "Music and Performing Arts"),
        ("ARCH-ARTD", "ศิลปะและการออกแบบ", "Art and Design"),
        ("ARCH-ARCHI", "สถาปัตยกรรม", "Architecture"),
        ("ARCH-INTER", "สถาปัตยกรรมภายใน", "Interior Architecture"),
    ],
    "AHS": [
        ("AHS-MT", "เทคนิคการแพทย์", "Medical Technology"),
        ("AHS-PT", "กายภาพบำบัด", "Physical Therapy"),
    ],
    "PH": [
        ("PH-TTM", "การแพทย์แผนไทยประยุกต์", "Applied Thai Traditional Medicine"),
        ("PH-TCM", "การแพทย์แผนจีน", "Traditional Chinese Medicine"),
        ("PH-HP", "การส่งเสริมสุขภาพ", "Health Promotion"),
        ("PH-EH", "อนามัยสิ่งแวดล้อม", "Environmental Health"),
        ("PH-OHS", "อาชีวอนามัยและความปลอดภัย", "Occupational Health and Safety"),
        ("PH-CH", "อนามัยชุมชน", "Community Health"),
    ],
    "EDU": [("EDU-ED", "การศึกษา", "Education")],
}

# Codes of the earlier SAMPLE programmes that are not in the official list. They are retired
# (is_active=false, never deleted, users keep their reference) by seed_reference. Only these codes
# are touched: programmes an admin created in /admin/catalog are never deactivated by the seeder.
LEGACY_SAMPLE_PROGRAM_CODES = [
    "AGRI-PLANT",
    "SENV-ENERGY",
    "SENV-ENV",
    "ICT-DC",
    "BUSCOM-MKT",
    "BUSCOM-COM",
    "PHARM-PD",
    "MEDSCI-MLS",
    "ENG-CE",
    "ARCH-ARCH",
    "ARCH-ART",
    "AHS-OT",
    "PH-PH",
    "POLSCI-SOC",
    "EDU-EDU",
]

# One category per kind of post; the API derives it from the post type (the UI never asks).
# Retired categories (urgent, recommendations) are removed by migration 0006.
CATEGORIES = [
    ("general", "โพสต์ทั่วไป", None),
    ("announcement", "ประกาศ", PostType.announcement),
    ("activities", "กิจกรรม", PostType.event),
    ("lost-found", "ของหาย / พบของ", PostType.lost_found),
    ("repair", "แจ้งซ่อม", PostType.repair),
]


def seed_reference(db: Session) -> None:
    roles: dict[RoleName, Role] = {}
    for name in RoleName:
        role = db.scalars(select(Role).where(Role.name == name)).first()
        if role is None:
            # explicit ids (the sequence is not used): next free id, also after migration 0002
            next_id = (db.scalar(select(func.max(Role.id))) or 0) + 1
            role = Role(id=next_id, name=name, weight=ROLE_WEIGHTS[name])
            db.add(role)
            db.flush()
        role.weight = ROLE_WEIGHTS[name]
        roles[name] = role
    db.flush()

    permissions: dict[str, Permission] = {}
    for code, description in PERMISSION_DESCRIPTIONS.items():
        permission = db.scalars(select(Permission).where(Permission.code == code)).first()
        if permission is None:
            permission = Permission(code=code)
            db.add(permission)
        permission.description = description
        permissions[code] = permission
    db.flush()

    # role_permissions mirrors app.core.permissions.PERMISSION_MATRIX exactly
    for role_name, grants in PERMISSION_MATRIX.items():
        role = roles[role_name]
        existing = {
            rp.permission_id: rp
            for rp in db.scalars(select(RolePermission).where(RolePermission.role_id == role.id))
        }
        wanted = {permissions[code].id: scope for code, scope in grants.items()}
        for permission_id, rp in existing.items():
            if permission_id not in wanted:
                db.delete(rp)
        for permission_id, scope in wanted.items():
            rp = existing.get(permission_id) or RolePermission(
                role_id=role.id, permission_id=permission_id
            )
            rp.scope = scope
            db.add(rp)

    for code, name_th, name_en in FACULTIES:
        faculty = db.scalars(select(Faculty).where(Faculty.code == code)).first() or Faculty(
            code=code
        )
        faculty.name_th, faculty.name_en = name_th, name_en
        faculty.admin_only = code in ADMIN_ONLY_FACULTIES
        db.add(faculty)

    db.flush()
    program_count = 0
    for faculty_code, programs in PROGRAMS.items():
        faculty = db.scalars(select(Faculty).where(Faculty.code == faculty_code)).one()
        for code, name_th, name_en in programs:
            if db.scalars(select(Program).where(Program.code == code)).first() is None:
                db.add(Program(faculty_id=faculty.id, code=code, name_th=name_th, name_en=name_en))
                program_count += 1

    db.flush()
    official = {code for programs in PROGRAMS.values() for code, _, _ in programs}
    for legacy in db.scalars(
        select(Program).where(
            Program.code.in_(LEGACY_SAMPLE_PROGRAM_CODES), Program.code.not_in(official)
        )
    ):
        legacy.is_active = False

    for slug, name_th, allowed_type in CATEGORIES:
        category = db.scalars(
            select(PostCategory).where(PostCategory.slug == slug)
        ).first() or PostCategory(slug=slug)
        category.name_th, category.allowed_type = name_th, allowed_type
        db.add(category)
    db.commit()
    print(
        f"✓ roles={len(roles)} permissions={len(permissions)} faculties={len(FACULTIES)} new_programs={program_count} categories={len(CATEGORIES)}"
    )


def upsert_user(
    db: Session,
    email: str,
    password: str,
    name: str,
    role: RoleName,
    faculty_code: str,
    program_code: str | None = None,
) -> User:
    """Create or reset a password account (bootstrap admin / demo accounts — ADR-003 keeps
    email + password only for these; everyone else signs in with Google)."""
    user = db.scalars(select(User).where(User.email == email)).unique().first()
    role_row = db.scalars(select(Role).where(Role.name == role)).one()
    faculty = db.scalars(select(Faculty).where(Faculty.code == faculty_code)).one()
    if user is None:
        user = User(
            email=email,
            password_hash=hash_password(password),
            display_name=name,
            token_version=0,
        )
        db.add(user)
    elif user.password_hash is None or not verify_password(password, user.password_hash):
        # The env var is the source of truth: re-seeding after changing it updates the password
        # (previously the old password silently stayed and "the correct password" failed).
        user.password_hash = hash_password(password)
        user.token_version += 1
    user.role_id, user.faculty_id = role_row.id, faculty.id
    user.program_id = (
        db.scalars(select(Program.id).where(Program.code == program_code)).one()
        if program_code
        else None
    )
    user.is_verified, user.is_active = True, True
    user.profile_completed_at = user.profile_completed_at or utcnow()  # no onboarding
    db.flush()
    return user


def seed_bootstrap_admin(db: Session) -> None:
    email = os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "").strip()
    if not email or not password:
        print("• BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD not set — skipping admin")
        return
    if not email.endswith("@up.ac.th") or len(password) < 12:
        raise SystemExit(
            "BOOTSTRAP_ADMIN_EMAIL must be @up.ac.th and the password at least 12 characters"
        )
    upsert_user(db, email, password, "ผู้ดูแลระบบ", RoleName.admin, "CENTRAL", "CENTRAL-STAFF")
    db.commit()
    print(f"✓ bootstrap admin {email}")


def seed_demo(db: Session) -> None:
    if get_settings().is_production:
        raise SystemExit("Refusing to seed demo data in production")
    # compose passes an EMPTY string when DEMO_PASSWORD is missing from .env — treat it as unset
    password = os.environ.get("DEMO_PASSWORD", "").strip() or DEFAULT_DEMO_PASSWORD
    if len(password) < 8:
        raise SystemExit("DEMO_PASSWORD must be at least 8 characters")
    student = upsert_user(
        db,
        "demo.student@up.ac.th",
        password,
        "อานนท์ สายรุ้ง",
        RoleName.student,
        "ICT",
        "ICT-CS",
    )
    teacher = upsert_user(
        db, "demo.teacher@up.ac.th", password, "อาจารย์ ICT", RoleName.teacher, "ICT", "ICT-IT"
    )
    officer = upsert_user(
        db,
        "demo.facilities@up.ac.th",
        password,
        "อาทร ศรีสุข (กองอาคาร)",
        RoleName.building_staff,
        "CENTRAL",
        "CENTRAL-STAFF",
    )
    tech_user = upsert_user(
        db,
        "demo.technician@up.ac.th",
        password,
        "วิชัย ช่างทอง",
        RoleName.technician,
        "CENTRAL",
        "CENTRAL-STAFF",
    )
    club = upsert_user(
        db, "demo.club@up.ac.th", password, "สโมสรนิสิต ICT", RoleName.student_club, "ICT", "ICT-CS"
    )
    admin = upsert_user(
        db,
        "demo.admin@up.ac.th",
        password,
        "สมชาย มั่นคง",
        RoleName.admin,
        "CENTRAL",
        "CENTRAL-STAFF",
    )
    if tech_user.technician is None:
        db.add(
            Technician(
                user_id=tech_user.id,
                specialty="ไฟฟ้า / ประปา",
                zone="โซน ICT - ตึก PKY",
                is_available=True,
            )
        )
    else:
        tech_user.technician.is_available = True
    db.flush()

    if db.scalar(
        select(Post.id)
        .where(Post.author_id.in_([student.id, teacher.id, officer.id, admin.id]))
        .limit(1)
    ):
        db.commit()
        print("✓ demo users (posts already present)")
        return

    categories = {c.slug: c for c in db.scalars(select(PostCategory))}
    now = utcnow()

    def post(
        author: User, ptype: PostType, slug: str, title: str, content: str, **kw: object
    ) -> Post:
        row = Post(
            type=ptype,
            title=title,
            content=content,
            category_id=categories[slug].id,
            author_id=author.id,
            faculty_id=author.faculty_id,
            created_at=kw.pop("created_at", now),
            **kw,
        )
        db.add(row)
        db.flush()
        return row

    open_house = post(
        admin,
        PostType.event,
        "activities",
        "ICT Open House 2026",
        "ขอเชิญนิสิตทุกชั้นปีร่วมงาน Open House คณะ ICT พบกับนิทรรศการโปรเจกต์และกิจกรรมมากมาย",
        created_at=now - timedelta(hours=2),
    )
    open_house.event = Event(
        post_id=open_house.id,
        starts_at=now + timedelta(days=3),
        ends_at=now + timedelta(days=3, hours=6),
        venue="อาคาร ICT ห้อง 1101",
        priority_level=EventPriority.university,
    )
    freshy = post(
        club,
        PostType.event,
        "activities",
        "ICT Freshy Night",
        "สโมสรนิสิต ICT ชวนน้อง ๆ ปี 1 ร่วมงานต้อนรับ มีดนตรีและกิจกรรมรับน้องสร้างสรรค์",
        created_at=now - timedelta(hours=1),
    )
    freshy.event = Event(
        post_id=freshy.id,
        starts_at=now + timedelta(days=2),
        ends_at=now + timedelta(days=2, hours=4),
        venue="ลานกิจกรรมหน้าอาคาร ICT",
        priority_level=EventPriority.department,
    )
    # student_club pin of its own event (hours chosen by the author, never past the start)
    freshy.pinned_at = now - timedelta(minutes=30)
    freshy.pinned_until = min(now + timedelta(hours=48), freshy.event.starts_at)
    freshy.pinned_by = club.id
    post(
        officer,
        PostType.announcement,
        "announcement",
        "ปิดถนนหน้าหอประชุมพญางำเมือง",
        "งดใช้ถนนหน้าหอประชุมชั่วคราวเนื่องจากซ่อมท่อประปา กรุณาใช้เส้นทางเลี่ยง",
        priority=Priority.urgent,
        created_at=now - timedelta(hours=5),
    )
    post(
        student,
        PostType.general,
        "general",
        "ร้านข้าวมันไก่หน้ามอ อร่อยมาก",
        "แนะนำร้านข้าวมันไก่ตรงข้ามประตูหน้า ราคานิสิต อิ่มคุ้ม",
        created_at=now - timedelta(hours=1),
    )
    post(
        student,
        PostType.general,
        "general",
        "ประกาศเก่า (เกิน 24 ชม.)",
        "โพสต์นี้ไม่แสดงในฟีดแล้ว แต่ยังอยู่ในประวัติโพสต์ของเจ้าของ",
        created_at=now - timedelta(hours=30),
    )

    repair = post(
        student,
        PostType.repair,
        "repair",
        "กระเบื้องทางเดินแตก มีน้ำขัง",
        "ทางเดินเชื่อมอาคาร ICT ชั้น 1 กระเบื้องแตกและมีน้ำขัง เสี่ยงลื่นล้ม",
        priority=Priority.high,
        created_at=now - timedelta(minutes=40),
    )
    repair.repair = RepairRequest(
        post_id=repair.id,
        location="ทางเดินเชื่อมอาคาร ICT ชั้น 1",
        status=RepairStatus.open,
    )
    db.flush()
    db.add(
        RepairStatusHistory(
            repair_id=repair.id,
            from_status=None,
            to_status=RepairStatus.open,
            changed_by=student.id,
        )
    )

    lost = post(
        student,
        PostType.lost_found,
        "lost-found",
        "ทำบัตรนิสิตหาย",
        "ทำบัตรนิสิตหายแถวโรงอาหารกลาง ใครพบรบกวนติดต่อกลับด้วยครับ",
        created_at=now - timedelta(hours=3),
    )
    lost.lost_found = LostFoundItem(
        post_id=lost.id, location="โรงอาหารกลาง (CE)", status=LostFoundStatus.lost
    )
    db.commit()
    print(
        f"✓ demo users + posts (password: {'DEMO_PASSWORD' if os.environ.get('DEMO_PASSWORD', '').strip() else 'default'})"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--demo", action="store_true", help="also seed demo users and posts")
    args = parser.parse_args()
    with SessionLocal() as db:
        seed_reference(db)
        seed_bootstrap_admin(db)
        if args.demo:
            seed_demo(db)


if __name__ == "__main__":
    main()
