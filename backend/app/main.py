"""UP Board API entry point. Run: uvicorn app.main:app"""

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.core import profanity
from app.core.errors import register_error_handlers
from app.core.events import broker
from app.routes import (
    admin,
    auth,
    notifications,
    posts,
    repairs,
    reports,
    uploads,
    users,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    broker.bind_loop(asyncio.get_running_loop())
    # Readiness: build the profanity dictionary before serving traffic (first post would wait).
    await asyncio.to_thread(profanity.warm_up)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="UP Board API",
        version="1.0.0",
        description="University of Phayao community board & incident reporting (ADR-001/002).",
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )

    @app.middleware("http")
    async def security_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id[:64]
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Cross-Origin-Resource-Policy", "cross-origin")
        if settings.cookie_secure:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response

    register_error_handlers(app)
    for module in (auth, posts, repairs, uploads, reports, notifications, admin, users):
        app.include_router(module.router, prefix=settings.api_prefix)
    return app


app = create_app()
