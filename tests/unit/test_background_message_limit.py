from __future__ import annotations

import datetime as dt
from unittest.mock import MagicMock

from rotaris_core.cli.background import _BackgroundMessageLimitObserver
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.state import SessionState


@verifies(SWR.SWR_915)
def test_background_message_limit_observer_persists_pause_signal(tmp_path) -> None:
    """Productive use: background user can safely leave a limited run unattended.
    Expected outcome: reaching the limit creates a durable paused-state hand-off for TUI."""
    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id="background-limit",
        workspace_root=str(tmp_path),
        created_at=now,
        updated_at=now,
    )
    session_dir = tmp_path / "session"
    session_dir.mkdir()
    manager = MagicMock()
    manager.session_dir.return_value = session_dir

    _BackgroundMessageLimitObserver(manager, state).on_message_limit_reached(3, 3)

    assert (session_dir / ".message_limit_paused").exists()
    assert state.execution_status == "paused_message_limit"
    assert state.message_count == 3
    assert state.message_limit == 3
    manager.persister.request_save.assert_called_once_with(state)
