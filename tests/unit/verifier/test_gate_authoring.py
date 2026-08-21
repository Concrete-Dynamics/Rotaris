"""Productive use: a user starts a run in an empty directory and asks for a
project. The first iteration scaffolds one.

Expected outcome: that run finishes — an early scaffolding iteration must be able
to — but it does not report clean, because nothing verified it. Once the
techstack exists, the gatekeeper authors a gate, and the *next* iteration is
gated by it. A workspace that states its own suite is never re-authored, and an
authoring attempt that finds nothing is remembered rather than repeated.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.config.schema import CheckConfig, RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.verifier.authoring import (
    authoring_decision,
    gate_warning,
    record_authoring,
    techstack_event,
)
from rotaris_core.verifier.gate_state import GateRecord, load_gate_record

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit


def _record(state: str, *, fingerprint: str = "fp", note: str = "") -> GateRecord:
    return GateRecord(
        state=state,  # type: ignore[arg-type]
        fingerprint="" if state == "absent" else fingerprint,
        authoring_note=note,
    )


def _config(tmp_path: Path, **verifier: object) -> RotarisConfig:
    config = RotarisConfig(workspace_root=tmp_path)
    for key, value in verifier.items():
        setattr(config.verifier, key, value)
    return config


# -- the techstack event -----------------------------------------------------


@verifies(SWR.SWR_2615, SWR.SWR_2612)
def test_the_event_fires_once_on_the_transition_out_of_absent() -> None:
    """The techstack is what the first run *produces*, so this is the only
    moment there is anything to author from."""
    assert techstack_event(_record("absent"), _record("pending"))
    assert techstack_event(None, _record("pending"))


@verifies(SWR.SWR_2615)
def test_the_event_does_not_fire_again_on_later_iterations() -> None:
    """Once per transition, not once per iteration — otherwise every run in a
    workspace with a techstack would ask a model about it again."""
    assert not techstack_event(_record("pending"), _record("pending"))
    assert not techstack_event(_record("calibrated"), _record("stale"))


@verifies(SWR.SWR_2615)
def test_an_empty_workspace_is_not_a_techstack_event() -> None:
    """A directory with no code yet is missing a project, not a gate."""
    assert not techstack_event(None, _record("absent"))


# -- when authoring runs -----------------------------------------------------


@verifies(SWR.SWR_2615)
def test_a_workspace_that_just_grew_a_techstack_is_authored(tmp_path: Path) -> None:
    decision = authoring_decision(_config(tmp_path), _record("absent"), _record("pending"))

    assert decision.author
    assert "acquired a techstack" in decision.reason


@verifies(SWR.SWR_2615, SWR.SWR_2601)
def test_a_workspace_that_states_its_own_suite_is_never_authored(tmp_path: Path) -> None:
    """A stated decision is not re-litigated — an explicit `[]` included.

    That empty list is the user saying this workspace runs no verification, and
    authoring one over it would be the product overruling them.
    """
    stated = _config(tmp_path, checks=[CheckConfig(name="t", command="pytest")])
    assert not authoring_decision(stated, _record("absent"), _record("pending")).author

    nothing = _config(tmp_path, checks=[])
    assert not authoring_decision(nothing, _record("absent"), _record("pending")).author


@verifies(SWR.SWR_2615)
def test_an_attempt_that_found_nothing_is_not_repeated_at_the_same_fingerprint(
    tmp_path: Path,
) -> None:
    """Re-asking a model about a workspace nobody touched cannot produce a new
    answer, and the note expires the moment the workspace does move."""
    barren = _record("pending", note="nothing bindable was found")

    decision = authoring_decision(_config(tmp_path), _record("absent"), barren)

    assert not decision.author
    assert "already ran at this fingerprint" in decision.reason

    moved = _record("pending", fingerprint="moved")
    assert authoring_decision(_config(tmp_path), _record("absent"), moved).author


@verifies(SWR.SWR_2615, SWR.SWR_2617)
def test_the_kill_switch_keeps_detection_and_routes_the_write_to_a_proposal(
    tmp_path: Path,
) -> None:
    """Off means "a person approves each change", not "the gate stops adapting"."""
    decision = authoring_decision(
        _config(tmp_path, author_gate=False),
        _record("absent"),
        _record("pending"),
    )

    assert not decision.author
    assert decision.propose_instead


# -- remembering what happened -----------------------------------------------


@verifies(SWR.SWR_2615)
def test_a_successful_write_leaves_no_note_and_records_the_provenance(
    tmp_path: Path,
) -> None:
    """The suite is configured now; the next resolution finds it by itself."""
    record_authoring(tmp_path, _record("pending"), wrote=True, note="bound pytest")

    stored = load_gate_record(tmp_path)
    assert stored is not None
    assert stored.authoring_note == ""
    assert stored.suite_origin == "authored"


@verifies(SWR.SWR_2615)
def test_a_write_that_produced_nothing_records_why(tmp_path: Path) -> None:
    record_authoring(tmp_path, _record("pending"), wrote=False, note="no runner resolves here")

    stored = load_gate_record(tmp_path)
    assert stored is not None
    assert stored.authoring_note == "no runner resolves here"
    assert stored.suite_origin is None


# -- saying so ---------------------------------------------------------------


@verifies(SWR.SWR_2615)
def test_a_pending_gate_warns_and_says_what_to_do_about_it() -> None:
    """`verifier_results: skipped` used to be readable as "verified, nothing to
    verify". This is what makes the other reading impossible to miss."""
    warning = gate_warning(_record("pending"))

    assert "no quality gate" in warning
    assert "verifier.checks" in warning


@verifies(SWR.SWR_2615)
def test_a_failed_authoring_attempt_says_what_it_found(tmp_path: Path) -> None:
    del tmp_path

    warning = gate_warning(_record("pending", note="no runner resolves here"))

    assert "no runner resolves here" in warning


@verifies(SWR.SWR_2615)
def test_an_empty_workspace_and_a_gated_one_both_stay_quiet() -> None:
    """Warning about a directory with no code would train people to ignore it,
    and warning about a gated run would be a lie."""
    assert gate_warning(_record("absent")) == ""
    assert gate_warning(_record("calibrated")) == ""
    assert gate_warning(_record("stale")) == ""
    assert gate_warning(None) == ""
