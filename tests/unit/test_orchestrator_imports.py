"""Import-boundary regressions for orchestration startup."""

from __future__ import annotations

import importlib

from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_2132)
def test_scheduler_imports_without_removed_summary_lifecycle_symbols() -> None:
    """Starting orchestration can load its scheduler before dispatching a child."""
    scheduler_module = importlib.import_module("rotaris_core.orchestrator.scheduler")

    assert scheduler_module.Scheduler is not None
