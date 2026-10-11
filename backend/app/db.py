from collections.abc import AsyncIterator

import anyio
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_timeout=settings.db_pool_timeout,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

# Session cleanup gets its own threads. If it shared AnyIO's default limiter with request
# handlers, a burst of requests waiting for pooled connections would occupy every thread and
# starve the very cleanups that return those connections (cyclic starvation, NFR-11 load test).
_cleanup_limiter = anyio.CapacityLimiter(16)


async def get_db() -> AsyncIterator[Session]:
    """Request-scoped session.

    An *async* generator on purpose: with a sync generator, FastAPI runs the cleanup in the
    threadpool, and when a client disconnects while the pool is saturated the `finally` block can
    be skipped — leaking a connection "idle in transaction" until the pool is exhausted (found by
    the NFR-11 load test). Here cleanup always runs, shielded from cancellation.
    """
    session = SessionLocal()
    try:
        yield session
    finally:
        with anyio.CancelScope(shield=True):
            await anyio.to_thread.run_sync(session.close, limiter=_cleanup_limiter)
