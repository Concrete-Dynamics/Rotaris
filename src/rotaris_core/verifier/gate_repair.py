"""Repairing the gate rather than blaming the code for it (SWR-2616).

A gate that no longer matches the codebase fails as loudly as broken code, and
until now the two were indistinguishable. A renamed script, a removed tool or a
moved test root produced a non-zero exit, which gated the iteration and spent the
SWR-2605 repair budget asking an agent to fix code that was never wrong. Worse,
the agent could not fix it: the fault was in the configuration, which the agent
was not looking at and could not have changed.

So the two are separated. ``invalid`` (:mod:`~rotaris_core.verifier.runner`)
records a check that could not be executed *as a test of the code*, and it never
gates and never charges a repair attempt. This module answers the next question:
can the gate be repaired without asking anybody?

**Deterministically first.** Re-run detection, probe the candidates
(SWR-2613), and take the first probed equivalent of the same role at the same
severity. No model is involved, and the swap goes through the gatekeeper's write
path (SWR-2614) so the same authority rule applies — which it satisfies by
construction, since a same-role, same-severity replacement is exactly what that
rule permits automatically.

**Never weakening.** If nothing probes clean, the check stays ``invalid`` with
its reason and that role is simply unverified for this run. The suite is never
silently emptied and a severity is never silently lowered; the drift becomes an
approval-gated proposal instead (SWR-2617).

**At most once per role per session.** A second ``invalid`` for the same role
after a repair is reported, not repaired again, so a hostile or unfixable
workspace cannot spin.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, NamedTuple

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from rotaris_core.permissions.engine import PermissionEngine
    from rotaris_core.verifier.suite import ResolvedCheck

_log = logging.getLogger(__name__)

__all__ = [
    "GateRepair",
    "GateRepairBudget",
    "find_replacement",
    "persist_replacement",
]


@traces(SWR.SWR_2616)
class GateRepairBudget:
    """One gate repair per role per session.

    Session state, so it is owned by the caller rather than by a run: two
    iterations of the same session share it, which is what "per session" means
    and what stops a workspace whose every candidate is broken from re-detecting
    and re-probing on every single iteration.
    """

    def __init__(self) -> None:
        self._spent: set[str] = set()

    def charge(self, role: str) -> bool:
        """Take this role's one attempt. ``False`` when it is already spent."""
        if role in self._spent:
            return False
        self._spent.add(role)
        return True

    @property
    def spent_roles(self) -> frozenset[str]:
        """Roles whose repair attempt this session has already used."""
        return frozenset(self._spent)


@traces(SWR.SWR_2616)
class GateRepair(NamedTuple):
    """What a repair attempt found, and what it means for the run."""

    #: The check to run in place of the broken one, when one was found.
    replacement: ResolvedCheck | None = None
    #: What happened, in the words the timeline and the report use.
    note: str = ""

    @property
    def repaired(self) -> bool:
        return self.replacement is not None


@traces(SWR.SWR_2616, SWR.SWR_2613)
def find_replacement(
    broken: ResolvedCheck,
    workspace_root: Path,
    run: Callable[[str], tuple[int, str]],
    *,
    engine: PermissionEngine | None = None,
    persona: str = "verifier",
) -> GateRepair:
    """A probed, same-role, same-severity stand-in for *broken*, or a reason.

    Candidates come from re-running detection *now* — the workspace has changed,
    which is why the old command stopped resolving — plus the alternatives the
    broken check already carried (SWR-2620). Each is probed before it is offered,
    because swapping one command that does not resolve for another would be a
    repair only in name.

    Never raises: a repair that cannot be attempted is a repair that did not
    happen, and the check stays ``invalid`` with its reason.
    """
    from rotaris_core.verifier.calibration import probe_check  # noqa: PLC0415
    from rotaris_core.verifier.detection import detect_check_suite  # noqa: PLC0415

    try:
        detected = detect_check_suite(workspace_root).checks
    except Exception:  # noqa: BLE001 - a failed re-detection is simply no candidate
        _log.debug("Gate repair could not re-detect %s", workspace_root, exc_info=True)
        detected = []

    candidates: list[ResolvedCheck] = []
    for found in detected:
        if found.role != broken.role or (found.cwd or "") != (broken.cwd or ""):
            continue
        candidates.append(found)
        candidates.extend(found.alternatives)
    candidates.extend(broken.alternatives)

    seen: set[str] = {broken.command}
    for candidate in candidates:
        if candidate.command in seen:
            continue
        seen.add(candidate.command)
        if candidate.severity != broken.severity:
            # A same-role replacement at a *lower* severity would repair the gate
            # by weakening it, which is the one thing repair may not do.
            continue
        probe = probe_check(candidate, run, engine=engine, persona=persona)
        if probe.verdict in {"verified", "undecidable"}:
            return GateRepair(
                replacement=candidate.model_copy(update={"timeout": broken.timeout}),
                note=(
                    f"{broken.command!r} no longer resolves here; "
                    f"{candidate.command!r} probed {probe.verdict} and replaced it"
                ),
            )

    return GateRepair(
        note=(
            f"{broken.command!r} no longer resolves here and no probed equivalent "
            f"of the {broken.role!r} role exists in this workspace"
        ),
    )


@traces(SWR.SWR_2616, SWR.SWR_2614)
def persist_replacement(
    workspace_root: Path,
    broken: ResolvedCheck,
    replacement: ResolvedCheck,
) -> str:
    """Write the swap through the gatekeeper's path, and report what happened.

    Through :func:`~rotaris_core.verifier.gate_writer.write_verifier_section`
    rather than around it, so one writer, one authority rule and one audit trail
    hold whoever initiated the change — and this change satisfies that rule by
    construction, since a same-role, same-severity replacement is exactly what it
    permits automatically.

    A workspace with no configured suite is left alone: it is verified by
    detection, which will find the replacement by itself next time, and writing a
    gate a user never asked for is SWR-2615's decision to make, not this one's.
    """
    from rotaris_core.config.schema import CheckConfig  # noqa: PLC0415
    from rotaris_core.verifier.gate_writer import (  # noqa: PLC0415
        read_verifier_section,
        write_verifier_section,
    )

    current = read_verifier_section(workspace_root)
    if not current:
        return "this workspace configures no suite, so the repair was not persisted"
    if not any(check.command == broken.command for check in current):
        return "the broken command is not the configured one, so nothing was rewritten"

    proposed = [
        CheckConfig(
            name=replacement.name,
            command=replacement.command,
            timeout=check.timeout,
            severity=check.severity,
            role=check.role,
            cwd=replacement.cwd,
        )
        if check.command == broken.command
        else check
        for check in current
    ]
    outcome = write_verifier_section(
        workspace_root,
        proposed,
        reason=f"{broken.command!r} no longer resolves; replaced by {replacement.command!r}",
    )
    if outcome.written:
        return f"the configured gate now runs {replacement.command!r}"
    return f"the gate could not be rewritten: {outcome.refusal}"
