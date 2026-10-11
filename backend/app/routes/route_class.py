"""Route class that returns the DB connection to the pool inside the worker thread that used it.

Sync endpoints run in AnyIO's threadpool. If a request's session kept its connection checked out
("idle in transaction") after the endpoint returned — until FastAPI finished sending the response
and ran the dependency cleanup — then under load every pooled connection could be held by idle
sessions while every worker thread waited for a connection (found by the NFR-11 load test).

Rule enforced here: a connection is only held while a thread is actively using it. After a sync
endpoint returns, its session's transaction is committed in the same thread (a no-op for reads;
writes already committed explicitly). `expire_on_commit=False` keeps returned objects usable.
On exceptions nothing is committed; `get_db` rolls back and closes.
"""

import functools
import inspect
from collections.abc import Callable
from typing import Any

from fastapi.routing import APIRoute
from sqlalchemy.orm import Session


def _release_connection_after(endpoint: Callable[..., Any]) -> Callable[..., Any]:
    @functools.wraps(endpoint)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        result = endpoint(*args, **kwargs)
        for value in kwargs.values():
            if isinstance(value, Session) and value.in_transaction():
                value.commit()
        return result

    return wrapper


class ReleaseConnectionRoute(APIRoute):
    def __init__(self, path: str, endpoint: Callable[..., Any], **kwargs: Any) -> None:
        if not inspect.iscoroutinefunction(endpoint):
            endpoint = _release_connection_after(endpoint)
        super().__init__(path, endpoint, **kwargs)
