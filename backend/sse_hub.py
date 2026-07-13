"""In-process pub/sub for server-sent events.

The WebChat backend is single-user and single-process (one uvicorn behind
nginx via supervisord), so async push frames are fanned out to the user's
open browser tab(s) through in-memory queues — no external broker needed.
Keyed by the user's hashed_id so a push resolved from the Manager lands on
the right subscriber.
"""
import asyncio
from collections import defaultdict


class SSEHub:
    def __init__(self) -> None:
        self._subs: dict[str, set[asyncio.Queue]] = defaultdict(set)

    def subscribe(self, key: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._subs[key].add(q)
        return q

    def unsubscribe(self, key: str, q: asyncio.Queue) -> None:
        subs = self._subs.get(key)
        if subs:
            subs.discard(q)
            if not subs:
                self._subs.pop(key, None)

    async def publish(self, key: str, frame: dict) -> None:
        for q in list(self._subs.get(key, ())):
            try:
                q.put_nowait(frame)
            except asyncio.QueueFull:
                pass  # a stuck/slow tab must not block delivery to others


hub = SSEHub()
