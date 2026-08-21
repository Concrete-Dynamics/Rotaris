"""Run-type tagging for the post-run improvement loop."""

from __future__ import annotations

from enum import StrEnum

from rotaris_core.reqtocode import SWR, traces


@traces(SWR.SWR_1601, SWR.SWR_2413)
class RunType(StrEnum):
    """Distinguishes user-task runs from approval-gated improvement runs.

    Phase 1 only emits ``TASK_RUN``. Phase 2 will introduce ``IMPROVEMENT_RUN``
    when the ``Improver`` executor lands; the post-run collector must remain
    gated to ``TASK_RUN`` so an ``improvement_run`` cannot self-chain (see
    REQ-20260515-POSTRUN-IMPROVE-011).
    """

    TASK_RUN = "task_run"
    IMPROVEMENT_RUN = "improvement_run"
    INTEGRATION_RUN = "integration_run"
