"""E2E harness wrapping ``cli.background._run_task`` for capability tests."""

from __future__ import annotations

import asyncio
import dataclasses
import logging
import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.ralph.state import RalphProgressFile

_log = logging.getLogger(__name__)


@dataclasses.dataclass
class CapabilityResult:
    progress: RalphProgressFile
    session_id: str
    elapsed_seconds: float
    workspace: Path


async def run_capability_task(
    task: str,
    config: RotarisConfig,
    workspace: Path,
    *,
    max_iterations: int = 3,
    timeout_seconds: float = 300.0,
    persona_override: str | None = None,
) -> CapabilityResult:
    """Run *task* through the full pipeline.  Set *persona_override* to bypass the orchestrator."""
    from rotaris_core.cli.background import _run_task
    from rotaris_core.session.manager import SessionManager

    if persona_override is not None:
        config = config.model_copy(update={"default_persona": persona_override})

    session_manager = SessionManager(workspace)
    state = session_manager.create_session(config)

    _log.info(
        "Capability test starting — session=%s task=%r persona=%s",
        state.session_id,
        task[:80],
        config.default_persona,
    )
    start = time.monotonic()
    try:
        progress = await asyncio.wait_for(
            _run_task(
                task=task,
                config=config,
                session_manager=session_manager,
                state=state,
                max_iterations=max_iterations,
            ),
            timeout=timeout_seconds,
        )
    finally:
        session_manager.release_lock(state.session_id)

    elapsed = time.monotonic() - start
    _log.info(
        "Capability test finished — session=%s elapsed=%.1fs completed=%d abandoned=%d "
        "stop_reason=%s",
        state.session_id,
        elapsed,
        progress.completed_tasks,
        progress.abandoned_tasks,
        progress.stop_reason,
    )
    return CapabilityResult(
        progress=progress,
        session_id=state.session_id,
        elapsed_seconds=elapsed,
        workspace=workspace,
    )
