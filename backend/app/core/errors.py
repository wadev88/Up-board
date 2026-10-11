"""Uniform error envelope: {"error": {"code", "message", "details"}} (see api-contract.md)."""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("upboard")


class AppError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: list[Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or []


def profile_incomplete() -> AppError:
    return AppError(
        403, "PROFILE_INCOMPLETE", "Choose your role (student / teacher) before posting"
    )


def not_found(entity: str = "Resource") -> AppError:
    return AppError(404, "NOT_FOUND", f"{entity} not found")


def forbidden(
    message: str = "You do not have permission to perform this action",
) -> AppError:
    return AppError(403, "FORBIDDEN", message)


def unauthenticated(
    message: str = "Authentication required", code: str = "UNAUTHENTICATED"
) -> AppError:
    return AppError(401, code, message)


def _envelope(code: str, message: str, details: list[Any] | None = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details or []}}


_HTTP_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "FILE_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
    429: "RATE_LIMITED",
}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        headers = {"Retry-After": "60"} if exc.status_code == 429 else None
        return JSONResponse(
            _envelope(exc.code, exc.message, exc.details),
            status_code=exc.status_code,
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {
                "field": ".".join(
                    str(part) for part in err["loc"] if part not in ("body", "query", "path")
                ),
                "message": err["msg"],
            }
            for err in exc.errors()
        ]
        return JSONResponse(
            _envelope("VALIDATION_ERROR", "Request validation failed", details),
            status_code=422,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _HTTP_CODES.get(exc.status_code, "ERROR")
        return JSONResponse(_envelope(code, str(exc.detail)), status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error", exc_info=exc)
        return JSONResponse(
            _envelope("INTERNAL_ERROR", "An unexpected error occurred"), status_code=500
        )
