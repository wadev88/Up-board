from datetime import UTC, date, datetime, time, timedelta, timezone

# Thailand has no daylight saving, so a fixed UTC+7 offset is exactly Asia/Bangkok (and avoids a
# tzdata dependency on Windows).
BANGKOK = timezone(timedelta(hours=7), "Asia/Bangkok")


def utcnow() -> datetime:
    """Single source of "now" so business rules use the app clock (freezable in tests: patch
    `app.core.clock.utcnow` and call it as `clock.utcnow()`), never the database clock."""
    return datetime.now(UTC)


def bangkok_date(moment: datetime) -> date:
    """Calendar day (Asia/Bangkok) the moment falls in."""
    return moment.astimezone(BANGKOK).date()


def bangkok_midnight(day: date) -> datetime:
    """00:00 Asia/Bangkok of `day`, as an aware UTC datetime."""
    return datetime.combine(day, time.min, tzinfo=BANGKOK).astimezone(UTC)
