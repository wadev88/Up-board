"""Run the background worker as its own process: `python -m app.worker`.
Kept separate from the API so jobs never run once per API worker (ADR-002 decision 10)."""

import logging
from collections.abc import Callable

from apscheduler.schedulers.blocking import BlockingScheduler
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.worker.jobs import (
    archive_stale_lost_items,
    cleanup_expired_tokens,
    cleanup_orphan_uploads,
    unpin_expired,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("upboard.worker")


def run(job: Callable[[Session], int]) -> None:
    with SessionLocal() as db:
        try:
            count = job(db)
            if count:
                logger.info("%s processed %d rows", job.__name__, count)
        except Exception:
            db.rollback()
            logger.exception("Job %s failed", job.__name__)


def main() -> None:
    scheduler = BlockingScheduler(timezone="UTC")
    scheduler.add_job(run, "interval", minutes=5, args=[unpin_expired], id="unpin_expired")
    scheduler.add_job(
        run, "interval", hours=1, args=[archive_stale_lost_items], id="archive_lost_items"
    )
    scheduler.add_job(run, "interval", hours=1, args=[cleanup_orphan_uploads], id="cleanup_uploads")
    scheduler.add_job(run, "interval", hours=6, args=[cleanup_expired_tokens], id="cleanup_tokens")
    for job in (
        unpin_expired,
        archive_stale_lost_items,
        cleanup_orphan_uploads,
        cleanup_expired_tokens,
    ):
        run(job)  # run once at start-up
    logger.info("UP Board worker started")
    scheduler.start()


if __name__ == "__main__":
    main()
