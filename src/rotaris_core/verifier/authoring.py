"""A workspace that starts from nothing gets a gate once it has a techstack.

A fresh workspace has no markers to detect, so SWR-2601 resolves no suite and
SWR-2604 calls that ``exempt`` — a run that verified nothing reads exactly like a
run that verified everything. And detection cannot fix it, because the techstack
is what the *first run produces*: there is nothing to detect until an iteration
has scaffolded something.

So this waits for that moment and then asks the gatekeeper (SWR-2614).

- **The techstack event** is the SWR-2612 transition out of ``absent``: the first
  ``pyproject.toml``, ``package.json``, ``go.mod``, ``Cargo.toml`` or conventional
  test root an iteration creates. It is read from the *post*-iteration
  fingerprint, so it never pre-empts the scaffolding it depends on, and it fires
  once per transition rather than once per iteration.
- **Until then the run is not blocked, but it is not silent either.** An early
  scaffolding run must be able to finish; what it must not do is report clean.
  The gate state travels on the child report, and a host warns for as long as
  there is no gate.
- **An explicit ``verifier.checks`` — including ``[]`` — ends this permanently.**
  The user has stated what this workspace runs, and that decision is not
  re-litigated on every fingerprint change.
- **Authoring that produces nothing bindable is remembered.** The reason is
  recorded against the fingerprint, so the next attempt waits for the workspace
  to change rather than re-asking a model about a workspace nobody touched.

``verifier.author_gate: false`` turns the automatic write off while keeping
detection and probing, and routes what the gatekeeper would have written into an
approval-gated proposal instead (SWR-2617).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, NamedTuple

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.verifier.gate_state import GateRecord

__all__ = [
    "AuthoringDecision",
    "authoring_decision",
    "gate_warning",
    "record_authoring",
    "techstack_event",
]


@traces(SWR.SWR_2615)
class AuthoringDecision(NamedTuple):
    """Whether to author a gate now, and why not when the answer is no."""

    author: bool
    reason: str = ""
    #: True when authoring is wanted but the automatic write is switched off, so
    #: the result belongs in an approval-gated proposal instead (SWR-2617).
    propose_instead: bool = False


@traces(SWR.SWR_2615, SWR.SWR_2612)
def techstack_event(before: GateRecord | None, after: GateRecord) -> bool:
    """Whether the workspace just acquired a techstack it had not got.

    Evaluated from the post-iteration record on purpose: computing it before an
    iteration would ask about the workspace the iteration is *about to change*,
    and the answer would arrive one run late every time.
    """
    if after.state == "absent":
        return False
    if before is None:
        return True
    return before.state == "absent" or not before.fingerprint


@traces(SWR.SWR_2615)
def authoring_decision(
    config: RotarisConfig,
    before: GateRecord | None,
    after: GateRecord,
) -> AuthoringDecision:
    """Whether the gatekeeper should be asked to author a gate right now.

    Pure, and deliberately conservative: every "no" here is a model call not
    made, and the only "yes" is the one moment the workspace changed shape from
    having no techstack to having one.
    """
    if config.verifier.checks is not None:
        # Including an explicit ``[]``. The user has stated what this workspace
        # runs, and a stated decision is not re-litigated (SWR-2601).
        return AuthoringDecision(False, "this workspace states its own check suite")

    if not techstack_event(before, after):
        return AuthoringDecision(False, "the workspace's techstack did not change")

    if after.authoring_note:
        # Recorded against this fingerprint, so it expires the moment the
        # workspace changes again — which is the only thing that could make a
        # second attempt worth anything.
        return AuthoringDecision(
            False,
            f"authoring already ran at this fingerprint: {after.authoring_note}",
        )

    if not config.verifier.author_gate:
        return AuthoringDecision(
            False,
            "automatic gate authoring is switched off (verifier.author_gate)",
            propose_instead=True,
        )

    return AuthoringDecision(True, "this workspace acquired a techstack and has no gate")


@traces(SWR.SWR_2615)
def record_authoring(
    workspace_root: Path,
    record: GateRecord,
    *,
    wrote: bool,
    note: str,
) -> GateRecord:
    """Remember what authoring did, so it is not re-attempted for nothing.

    A successful write leaves no note: the suite is now configured, the next
    resolution finds it, and the gate stops being ``pending`` on its own. A write
    that produced nothing records why, keyed to this fingerprint, so the next
    attempt waits for the workspace to move.
    """
    from rotaris_core.verifier.gate_state import save_gate_record  # noqa: PLC0415

    updated = record.model_copy(
        update={
            "suite_origin": "authored" if wrote else record.suite_origin,
            "authoring_note": "" if wrote else note,
        },
    )
    save_gate_record(workspace_root, updated)
    return updated


@traces(SWR.SWR_2615)
def gate_warning(record: GateRecord | None) -> str:
    """The sentence a host shows while this workspace runs ungated, or ``""``.

    The whole visibility half of SWR-2615. ``verifier_results: skipped`` used to
    be readable as "verified, nothing to verify"; this is what makes the other
    reading impossible to miss.

    Deliberately empty for ``absent``: a workspace with no code yet is not
    missing a gate, it is missing a project, and warning about it would train
    people to ignore the warning.
    """
    if record is None or record.state != "pending":
        return ""
    if record.authoring_note:
        return (
            "This workspace has no quality gate: nothing bindable was found — "
            f"{record.authoring_note}. Set verifier.checks to state what verifies it."
        )
    return (
        "This workspace has no quality gate, so nothing verified this run. Set "
        "verifier.checks to state what should, or verifier.checks: [] to state "
        "that nothing does."
    )
