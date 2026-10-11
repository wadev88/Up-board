"""In-process pub/sub that feeds the SSE stream (ADR-001 real-time via SSE).

Route handlers run in a threadpool, so publishing hops onto the event loop with
call_soon_threadsafe. Single API instance per ADR-001; a multi-instance deployment would need
PostgreSQL LISTEN/NOTIFY or a broker (ADR-001 review trigger #1/#6)."""

import asyncio
import contextlib
import json
import threading
from collections import defaultdict
from typing import Any


class EventBroker:
    def __init__(self) -> None:
        self._subscribers: dict[int, set[asyncio.Queue[str]]] = defaultdict(set)
        self._loop: asyncio.AbstractEventLoop | None = None
        self._lock = threading.Lock()

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def subscribe(self, user_id: int) -> asyncio.Queue[str]:
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=100)
        with self._lock:
            self._subscribers[user_id].add(queue)
        return queue

    def unsubscribe(self, user_id: int, queue: asyncio.Queue[str]) -> None:
        with self._lock:
            self._subscribers[user_id].discard(queue)
            if not self._subscribers[user_id]:
                self._subscribers.pop(user_id, None)

    def connection_count(self) -> int:
        with self._lock:
            return sum(len(queues) for queues in self._subscribers.values())

    def publish(self, event: str, data: dict[str, Any], user_ids: list[int] | None = None) -> None:
        """user_ids=None broadcasts to everyone."""
        message = json.dumps({"event": event, "data": data}, default=str, ensure_ascii=False)
        with self._lock:
            targets = (
                [q for queues in self._subscribers.values() for q in queues]
                if user_ids is None
                else [q for uid in user_ids for q in self._subscribers.get(uid, ())]
            )
        loop = self._loop
        if not targets or loop is None or loop.is_closed():
            return
        for queue in targets:
            loop.call_soon_threadsafe(_offer, queue, message)


def _offer(queue: asyncio.Queue[str], message: str) -> None:
    with contextlib.suppress(asyncio.QueueFull):  # slow client: drop rather than block others
        queue.put_nowait(message)


broker = EventBroker()
