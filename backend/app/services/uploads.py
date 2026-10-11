from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.errors import AppError
from app.core.storage import get_storage, new_storage_key, sanitize_image
from app.models import Attachment, AttachmentKind, User

CHUNK = 64 * 1024


async def read_limited(file: UploadFile, limit: int) -> bytes:
    """Stream the upload and stop as soon as it exceeds the limit (never trust Content-Length)."""
    buffer = bytearray()
    while chunk := await file.read(CHUNK):
        buffer.extend(chunk)
        if len(buffer) > limit:
            raise AppError(
                413,
                "FILE_TOO_LARGE",
                f"File must be {limit // (1024 * 1024)} MB or smaller",
            )
    if not buffer:
        raise AppError(422, "VALIDATION_ERROR", "File is empty")
    return bytes(buffer)


def store_image(db: Session, user: User, raw: bytes) -> Attachment:
    data, mime, ext = sanitize_image(raw)
    if len(data) > get_settings().max_upload_bytes:
        raise AppError(413, "FILE_TOO_LARGE", "Image is too large after processing")
    key = new_storage_key(ext)
    get_storage().save(key, data, mime)
    attachment = Attachment(
        uploaded_by=user.id,
        storage_key=key,
        mime_type=mime,
        size_bytes=len(data),
        kind=AttachmentKind.image,
    )
    db.add(attachment)
    db.commit()
    return attachment
