from __future__ import annotations

import time
from types import SimpleNamespace

import pytest
from PySide6.QtCore import QTimer
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models.store import WorkspaceStore
from rotaris.services.run_bridge import RunBridge
from rotaris.services.session_projection import (
    SessionProjectionContext,
    SessionProjectionRead,
)

pytestmark = pytest.mark.integration


@verifies(SWR.SWR_2066)
def test_refresh_requests_coalesce_without_blocking_qt(
    qtbot,
    tmp_path,
    monkeypatch,
) -> None:
    calls: list[str] = []
    applied: list[object] = []

    def slow_read(_self, session_id, _context):
        calls.append(session_id)
        time.sleep(0.2)
        return SessionProjectionRead(object(), load_ms=150.0, projection_ms=50.0)  # type: ignore[arg-type]

    monkeypatch.setattr(
        "rotaris.services.session_projection.SessionProjectionReader.read",
        slow_read,
    )
    service = SimpleNamespace(
        config=object(),
        projection_context=SessionProjectionContext,
        apply_session_projection=applied.append,
        refresh_sessions=lambda: None,
        refresh_improvement_proposals=lambda: None,
    )
    bridge = RunBridge(tmp_path, WorkspaceStore(), service)
    bridge._session_id = "session-1"
    heartbeat_ticks = [0]
    heartbeat = QTimer()
    heartbeat.setInterval(20)
    heartbeat.timeout.connect(lambda: heartbeat_ticks.__setitem__(0, heartbeat_ticks[0] + 1))
    heartbeat.start()
    try:
        for _ in range(10):
            bridge._request_refresh()
        qtbot.waitUntil(lambda: len(applied) == 2, timeout=3000)
    finally:
        heartbeat.stop()
        bridge.shutdown()

    assert calls == ["session-1", "session-1"]
    assert heartbeat_ticks[0] >= 5
