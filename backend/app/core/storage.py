"""File storage behind one interface: local disk in development, S3-compatible in production
(ADR-001). Images are re-encoded to strip EXIF/GPS metadata (ADR-002 decision 7)."""

import io
import uuid
from functools import lru_cache
from pathlib import Path
from typing import Protocol

from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import get_settings
from app.core.errors import AppError

Image.MAX_IMAGE_PIXELS = 40_000_000  # decompression-bomb guard

ALLOWED_FORMATS = {
    "JPEG": ("image/jpeg", "jpg"),
    "PNG": ("image/png", "png"),
    "WEBP": ("image/webp", "webp"),
}
MAX_DIMENSION = 2560


class Storage(Protocol):
    def save(self, key: str, data: bytes, content_type: str) -> None: ...
    def read(self, key: str) -> bytes | None: ...
    def delete(self, key: str) -> None: ...
    def public_url(self, key: str) -> str: ...


class LocalStorage:
    def __init__(self, root: str, base_url: str) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.base_url = base_url.rstrip("/")

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if path.parent != self.root:  # keys are flat UUID names; block traversal
            raise AppError(400, "BAD_REQUEST", "Invalid file key")
        return path

    def save(self, key: str, data: bytes, content_type: str) -> None:
        self._path(key).write_bytes(data)

    def read(self, key: str) -> bytes | None:
        path = self._path(key)
        return path.read_bytes() if path.is_file() else None

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def public_url(self, key: str) -> str:
        return f"{self.base_url}/files/{key}"


class S3Storage:
    """S3-compatible storage. Requires `boto3` (install when STORAGE_BACKEND=s3)."""

    def __init__(self) -> None:
        import boto3

        settings = get_settings()
        self.bucket = settings.s3_bucket
        self.public_base = settings.s3_public_base_url.rstrip("/")
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url or None,
            region_name=settings.s3_region or None,
        )

    def save(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    def read(self, key: str) -> bytes | None:
        try:
            return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        except self.client.exceptions.NoSuchKey:
            return None

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def public_url(self, key: str) -> str:
        return f"{self.public_base}/{key}"


@lru_cache
def get_storage() -> Storage:
    settings = get_settings()
    if settings.storage_backend == "s3":
        return S3Storage()
    return LocalStorage(
        settings.upload_dir,
        f"{settings.public_api_url.rstrip('/')}{settings.api_prefix}",
    )


def sanitize_image(data: bytes) -> tuple[bytes, str, str]:
    """Validate by decoding (magic bytes, not client headers), re-encode without metadata.
    Returns (bytes, mime_type, extension)."""
    try:
        with Image.open(io.BytesIO(data)) as probe:
            fmt = probe.format
            probe.verify()
        if fmt not in ALLOWED_FORMATS:
            raise AppError(
                415,
                "UNSUPPORTED_MEDIA_TYPE",
                "Only JPEG, PNG and WebP images are allowed",
            )
        with Image.open(io.BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img)
            img.thumbnail((MAX_DIMENSION, MAX_DIMENSION))
            if fmt == "JPEG" and img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            out = io.BytesIO()
            save_kwargs = (
                {"quality": 85, "optimize": True} if fmt in ("JPEG", "WEBP") else {"optimize": True}
            )
            img.save(out, format=fmt, **save_kwargs)  # no exif= → metadata dropped
    except AppError:
        raise
    except (
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError,
        SyntaxError,
    ) as exc:
        raise AppError(415, "UNSUPPORTED_MEDIA_TYPE", "File is not a valid image") from exc
    mime, ext = ALLOWED_FORMATS[fmt]
    return out.getvalue(), mime, ext


def new_storage_key(extension: str) -> str:
    return f"{uuid.uuid4().hex}.{extension}"
