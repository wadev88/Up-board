"""Image uploads and file serving (ADR-002 decision 7)."""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, File, Response, UploadFile, status

from app.config import get_settings
from app.core.errors import not_found
from app.core.rate_limit import enforce, rate_limit
from app.core.storage import get_storage
from app.middlewares.auth import CurrentUser, DbSession
from app.routes.route_class import ReleaseConnectionRoute
from app.services.uploads import read_limited, store_image
from app.validators.schemas import (
    UploadOut,
)

router = APIRouter(route_class=ReleaseConnectionRoute)


# ---------- uploads ----------
@router.post(
    "/uploads",
    status_code=status.HTTP_201_CREATED,
    response_model=UploadOut,
    tags=["uploads"],
    dependencies=[Depends(rate_limit("upload", 600, 60))],
)
async def upload(
    user: CurrentUser, db: DbSession, file: Annotated[UploadFile, File()]
) -> UploadOut:
    enforce(f"upload:{user.id}", 30, 60)
    raw = await read_limited(file, get_settings().max_upload_bytes)
    attachment = await asyncio.to_thread(store_image, db, user, raw)
    return UploadOut(
        id=attachment.id,
        url=get_storage().public_url(attachment.storage_key),
        mime_type=attachment.mime_type,
        size_bytes=attachment.size_bytes,
    )


@router.get("/files/{key}", tags=["uploads"], include_in_schema=False)
def get_file(key: str) -> Response:
    if not key.replace(".", "").isalnum() or len(key) > 100:
        raise not_found("File")
    data = get_storage().read(key)
    if data is None:
        raise not_found("File")
    ext = key.rsplit(".", 1)[-1]
    media_type = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}.get(ext)
    if media_type is None:
        raise not_found("File")
    return Response(
        data,
        media_type=media_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'",
        },
    )
