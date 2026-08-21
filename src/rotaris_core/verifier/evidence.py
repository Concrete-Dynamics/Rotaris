"""Report-facing projection of a verifier run (SWR-2603).

SWR-2602 executes the resolved suite and yields a :class:`VerifierRunResult`;
that object lives on the loop for the duration of one iteration and is then
overwritten. This module turns it into the evidence the ``ChildReportArtifact``
carries — the contract the parent agent, the host UIs, and the SWR-2604
completion gate read.

Two properties matter and are why this is a distinct model rather than the
runner's own:

- The overall ``verdict`` is a **stored** field, not a derived property, so it
  survives the JSON round-trip every persisted report goes through.
- The report contract stays independent of the runner's internals; only the
  per-check :class:`~rotaris_core.verifier.runner.CheckResult` is shared, because
  redefining it would be the one place the two could silently drift apart.

The evidence is written by the runner alone. ``SummaryAgent`` strips the field
from LLM output before validation, so a summarizing model can neither author nor
overwrite it.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.verifier.runner import (
    CheckResult,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.verifier.suite import (
    SuiteSource,  # noqa: TC001 - Pydantic resolves this at runtime.
)

if TYPE_CHECKING:
    from rotaris_core.verifier.runner import VerifierRunResult

#: Overall outcome of one verifier pass. ``skipped`` means the suite did not run
#: at all (no file changes, or nothing configured to run) — it is deliberately
#: distinct from ``passed`` so a gate can tell "verified clean" from "unverified".
VerifierVerdict = Literal["passed", "failed", "skipped"]


@traces(SWR.SWR_2603)
class VerifierEvidence(BaseModel):
    """Deterministic verification evidence attached to a child report."""

    #: Overall outcome. Stored rather than computed so it survives serialization.
    verdict: VerifierVerdict
    #: False when the suite was not run at all; ``skip_reason`` then says why.
    executed: bool
    #: Where the executed suite came from (SWR-2601).
    suite_source: SuiteSource
    #: Why the suite did not run. Only set when ``executed`` is False.
    skip_reason: str | None = None
    #: Wall-clock duration of the whole pass.
    duration_s: float = 0.0
    #: Per-check results, in configured execution order.
    checks: list[CheckResult] = Field(default_factory=list)

    @classmethod
    def from_run(cls, run: VerifierRunResult) -> VerifierEvidence:
        """Project a completed :class:`VerifierRunResult` onto report evidence."""
        return cls(
            verdict=_verdict_for(run),
            executed=run.executed,
            suite_source=run.suite_source,
            skip_reason=run.skip_reason,
            duration_s=run.duration_s,
            checks=list(run.results),
        )

    @property
    def blocking_failures(self) -> list[CheckResult]:
        """Executed blocking checks that did not pass."""
        return [
            check
            for check in self.checks
            if check.severity == "blocking" and check.status in {"failed", "timeout"}
        ]


def _verdict_for(run: VerifierRunResult) -> VerifierVerdict:
    """Derive the overall verdict from a run.

    A suite that never ran is ``skipped``, never ``passed`` — SWR-2604 gates on
    positive evidence, so "nothing was checked" must not read as "checks passed".
    Advisory failures do not change the verdict; they travel in ``checks``.
    """
    if not run.executed:
        return "skipped"
    return "failed" if run.blocking_failures else "passed"
