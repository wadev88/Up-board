from sqlalchemy.orm import Session

from app.core.errors import forbidden
from app.core.permissions import can
from app.models import LostFoundItem, LostFoundStatus, Post, PostStatus, PostType, User
from app.services import spam
from app.services.activity import audit, publish_after_commit
from app.services.posts import (
    attach_files,
    category_by_slug,
    ensure_clean,
    get_visible_post,
)
from app.validators.schemas import LostFoundCreateIn, LostFoundUpdateIn


def create_item(db: Session, user: User, data: LostFoundCreateIn) -> Post:
    ensure_clean(title=data.title, content=data.content, location=data.location)
    now = spam.check_before_create(db, user, PostType.lost_found)  # suspension applies
    post = Post(
        type=PostType.lost_found,
        title=data.title,
        content=data.content,
        category_id=category_by_slug(db, "lost-found").id,
        author_id=user.id,
        faculty_id=user.faculty_id,
        status=PostStatus.active,
        created_at=now,
    )
    db.add(post)
    db.flush()
    post.lost_found = LostFoundItem(
        post_id=post.id,
        location=data.location,
        status=LostFoundStatus(data.status),
        occurred_at=data.occurred_at,
    )
    attach_files(db, user, post, data.attachment_ids)
    publish_after_commit(db, "post.created", {"id": post.id, "type": post.type.value})
    db.commit()
    return post


def update_item(db: Session, user: User, post_id: int, data: LostFoundUpdateIn) -> Post:
    post = get_visible_post(db, post_id, PostType.lost_found)
    if not can(user, "lost_found:update_status", post):
        raise forbidden()
    ensure_clean(location=data.location)
    item = post.lost_found
    if data.status is not None and data.status is not item.status:
        audit(
            db,
            user,
            "lost_found.status",
            "post",
            post.id,
            {"from": item.status.value, "to": data.status.value},
        )
        item.status = data.status
    if data.location is not None:
        item.location = data.location
    db.commit()
    db.refresh(post)
    return post
