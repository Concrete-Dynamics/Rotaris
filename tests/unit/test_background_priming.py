"""A run resolves its provider credentials before it builds its first model."""

from __future__ import annotations

import contextlib
import datetime as dt
from unittest.mock import MagicMock

import pytest

from rotaris_core.auth import session_auth
from rotaris_core.cli.background import _run_task
from rotaris_core.config.schema import RotarisConfig
from rotaris_core.ralph import bootstrap
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.state import SessionState


class _StopHereError(RuntimeError):
    """Ends the run right after intent classification, which is all this test needs."""


def _state(tmp_path) -> SessionState:
    now = dt.datetime.now(dt.UTC)
    return SessionState(
        session_id="priming",
        workspace_root=str(tmp_path),
        created_at=now,
        updated_at=now,
    )


@verifies(SWR.SWR_3712)
async def test_a_run_primes_credentials_before_classifying_intent(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Classification is the first model a run builds, so priming must precede it."""
    order: list[str] = []

    @contextlib.asynccontextmanager
    async def fake_keep_auth_fresh(config, *, storage=None):  # noqa: ANN001, ANN202, ARG001
        order.append("primed")
        try:
            yield session_auth.PrimeReport(authenticated=("fake",))
        finally:
            order.append("refresher stopped")

    async def fake_classify(*_args, **_kwargs):  # noqa: ANN002, ANN003, ANN202
        order.append("classified")
        raise _StopHereError

    monkeypatch.setattr(session_auth, "keep_auth_fresh", fake_keep_auth_fresh)
    monkeypatch.setattr(bootstrap, "classify_run_intent", fake_classify)

    session_dir = tmp_path / "session"
    session_dir.mkdir()
    session_manager = MagicMock()
    session_manager.session_dir.return_value = session_dir

    with pytest.raises(_StopHereError):
        await _run_task(
            task="anything",
            config=RotarisConfig(workspace_root=tmp_path),
            session_manager=session_manager,
            state=_state(tmp_path),
            max_iterations=1,
        )

    assert order == ["primed", "classified", "refresher stopped"]


@verifies(SWR.SWR_3712)
async def test_an_unresolved_provider_is_recorded_in_the_session(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A run that later fails on a provider call should carry the reason with it."""

    @contextlib.asynccontextmanager
    async def fake_keep_auth_fresh(config, *, storage=None):  # noqa: ANN001, ANN202, ARG001
        yield session_auth.PrimeReport(unresolved={"copilot": "invalid_grant"})

    async def fake_classify(*_args, **_kwargs):  # noqa: ANN002, ANN003, ANN202
        raise _StopHereError

    monkeypatch.setattr(session_auth, "keep_auth_fresh", fake_keep_auth_fresh)
    monkeypatch.setattr(bootstrap, "classify_run_intent", fake_classify)

    session_dir = tmp_path / "session"
    session_dir.mkdir()
    session_manager = MagicMock()
    session_manager.session_dir.return_value = session_dir

    with pytest.raises(_StopHereError):
        await _run_task(
            task="anything",
            config=RotarisConfig(workspace_root=tmp_path),
            session_manager=session_manager,
            state=_state(tmp_path),
            max_iterations=1,
        )

    recorded = "".join(path.read_text(encoding="utf-8") for path in session_dir.rglob("*.jsonl"))
    assert "auth_not_primed" in recorded
    assert "invalid_grant" in recorded
