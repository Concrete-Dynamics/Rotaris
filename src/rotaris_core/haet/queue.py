from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.haet.engine import HAETEngine
    from rotaris_core.haet.patch import HAETPatchRequest, HAETPatchResult


class HAETQueueConflictError(Exception):
    def __init__(self, file_path: str) -> None:
        self.file_path = file_path
        super().__init__(f"File already has a pending HAET edit: {file_path}")


@traces(SWR.SWR_666)
class HAETQueue:
    def __init__(self, engine: HAETEngine) -> None:
        self.engine = engine
        self._queue: asyncio.Queue[
            tuple[HAETPatchRequest, asyncio.Future[HAETPatchResult]] | None
        ] = asyncio.Queue()
        self._lock = asyncio.Lock()
        self._worker_task: asyncio.Task[None] | None = None
        self._in_flight_files: set[str] = set()

    def start(self) -> None:
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker())

    async def stop(self) -> None:
        if self._worker_task is None:
            return
        await self._queue.put(None)
        await self._worker_task
        self._worker_task = None

    async def submit(self, request: HAETPatchRequest) -> HAETPatchResult:
        if self._worker_task is None:
            raise RuntimeError("HAET queue has not been started")
        async with self._lock:
            if request.file_path in self._in_flight_files:
                raise HAETQueueConflictError(request.file_path)
            self._in_flight_files.add(request.file_path)
        loop = asyncio.get_running_loop()
        future: asyncio.Future[HAETPatchResult] = loop.create_future()
        await self._queue.put((request, future))
        return await future

    async def _worker(self) -> None:
        while True:
            item = await self._queue.get()
            if item is None:
                self._queue.task_done()
                break

            request, future = item
            try:
                result = await asyncio.to_thread(self.engine.apply_patch, request)
            except Exception as exc:
                if not future.done():
                    future.set_exception(exc)
            else:
                if not future.done():
                    future.set_result(result)
            finally:
                async with self._lock:
                    self._in_flight_files.discard(request.file_path)
                self._queue.task_done()
