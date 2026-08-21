"""Productive use: an operator configures a permissive permission mode and starts a run
that nobody is watching, on a host without the container sandbox.
Expected outcome: the run is downgraded to 'ask' with a reason the operator can read,
unless a human can answer prompts or the workspace explicitly opted in."""

from __future__ import annotations

import pytest

from rotaris_core.permissions import (
    DOWNGRADE_TARGET,
    resolve_effective_mode,
    sandbox_active,
)
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_2508)
def test_unattended_unsandboxed_autonomous_run_is_downgraded_to_ask() -> None:
    effective = resolve_effective_mode(
        "autonomous",
        interactive=False,
        sandboxed=False,
        opt_in=False,
    )

    assert effective.mode == DOWNGRADE_TARGET
    assert effective.requested == "autonomous"
    assert effective.downgraded
    assert "allow_unsandboxed_autonomous" in effective.reason


@verifies(SWR.SWR_2508)
@pytest.mark.parametrize(
    ("interactive", "sandboxed", "opt_in"),
    [
        (True, False, False),
        (False, True, False),
        (False, False, True),
    ],
)
def test_autonomous_survives_when_any_precondition_lifts_the_downgrade(
    interactive: bool,
    sandboxed: bool,
    opt_in: bool,
) -> None:
    effective = resolve_effective_mode(
        "autonomous",
        interactive=interactive,
        sandboxed=sandboxed,
        opt_in=opt_in,
    )

    assert effective.mode == "autonomous"
    assert not effective.downgraded
    assert effective.reason == ""


@verifies(SWR.SWR_2508)
@pytest.mark.parametrize("mode", ["ask", "restricted"])
def test_non_permissive_modes_pass_through_untouched(mode: str) -> None:
    effective = resolve_effective_mode(mode, interactive=False, sandboxed=False, opt_in=False)

    assert effective.mode == mode
    assert not effective.downgraded


@verifies(SWR.SWR_2508)
def test_unknown_mode_resolves_strict_and_is_not_downgraded() -> None:
    effective = resolve_effective_mode(
        "not-a-real-mode",
        interactive=False,
        sandboxed=False,
        opt_in=False,
    )

    assert effective.mode == "restricted"
    assert not effective.downgraded


@verifies(SWR.SWR_2508)
def test_unset_mode_resolves_to_the_ask_default() -> None:
    effective = resolve_effective_mode(None, interactive=False, sandboxed=False, opt_in=False)

    assert effective.mode == "ask"
    assert not effective.downgraded


@verifies(SWR.SWR_2508)
def test_no_host_is_sandboxed_until_the_container_sandbox_lands() -> None:
    from rotaris_core.config.schema import RotarisConfig

    assert sandbox_active(RotarisConfig()) is False
