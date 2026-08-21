"""What a run released from the requirements board is allowed to do (SWR-3707).

A board release is unattended by construction. The flow runs on a worker thread,
the agent works in the requirement's own tree, and nothing registers an approval
host for it — only the composer does that, because only the composer has a human
in front of the transcript that would raise the question. A run that stops to
ask is therefore a run that stops.

So a board run is given the permissive preset *and*
``runtime.allow_unsandboxed_autonomous`` together. Either alone leaves it where
it started: without the preset the policy engine denies the first tool that
needs approval, and without the opt-in SWR-2508 downgrades the preset straight
back to ``ask`` for exactly the reason that makes a release unattended.

Two things keep that from being the silent elevation SWR-2508 exists to prevent,
and both live here as preferences rather than as workspace configuration:

* the user is told, before the first release of each launch, and can refuse;
* the behaviour itself is a switch they can see and turn off in Settings, which
  is what keeps it discoverable after the telling has been silenced.

Preferences rather than ``agents.yaml`` because this is a fact about *Rotaris*
and the way this desktop starts requirement runs, not about the project. Writing
it into the workspace would elevate every headless run of that repository too,
and it would travel with the repository to whoever copied it next.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import QSettings
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.config.schema import RotarisConfig

__all__ = [
    "FULL_PERMISSION_KEY",
    "FULL_PERMISSION_MODE",
    "NOTICE_SUPPRESSED_KEY",
    "elevated",
    "full_permission_runs",
    "notice_suppressed",
    "set_full_permission_runs",
    "suppress_notice",
]

#: Whether board-started runs are elevated at all. Default on: a release that
#: cannot finish is the defect this requirement was written for.
FULL_PERMISSION_KEY = "requirements/fullPermissionRuns"

#: Whether the user has silenced the disclosure for good. Default off, and only
#: ever written by the button that says so.
NOTICE_SUPPRESSED_KEY = "requirements/fullPermissionNoticeSuppressed"

#: The preset a board run is given. Named once, here — nowhere else in the
#: desktop decides what "full permissions" resolves to.
FULL_PERMISSION_MODE = "autonomous"


def _flag(key: str, default: bool) -> bool:
    """A stored boolean, tolerant of how ``QSettings`` chose to write it.

    An INI file round-trips a bool as the string ``"true"``; the native
    back-ends hand back a real bool. Reading only one of the two shapes is how a
    preference silently reverts to its default on someone else's machine.
    """
    stored = QSettings().value(key)
    if stored is None:
        return default
    if isinstance(stored, bool):
        return stored
    return str(stored).strip().lower() in {"1", "true", "yes", "on"}


def _write(key: str, value: bool) -> None:
    settings = QSettings()
    settings.setValue(key, value)
    # Rotaris is closed by closing its window, and an unsynced preference is one
    # that silently did not take.
    settings.sync()


@traces(SWR.SWR_3707)
def full_permission_runs() -> bool:
    """Whether a run the board starts is elevated. On unless turned off."""
    return _flag(FULL_PERMISSION_KEY, True)


@traces(SWR.SWR_3707)
def set_full_permission_runs(enabled: bool) -> None:
    """Record the Settings switch. Takes effect on the next run started."""
    _write(FULL_PERMISSION_KEY, enabled)


@traces(SWR.SWR_3707)
def notice_suppressed() -> bool:
    """Whether the user asked never to be told again. Off unless they did."""
    return _flag(NOTICE_SUPPRESSED_KEY, False)


@traces(SWR.SWR_3707)
def suppress_notice() -> None:
    """Never tell them again — the answer the third button records."""
    _write(NOTICE_SUPPRESSED_KEY, True)


@traces(SWR.SWR_3707, SWR.SWR_2508)
def elevated(config: RotarisConfig) -> RotarisConfig:
    """*config* with both halves of the elevation applied, as a copy.

    A copy, never a mutation: the caller holds the workspace's loaded
    configuration and every other run started from this process reads the same
    object. Mutating it would elevate the composer's next run as well, which is
    the one place a human *is* available to answer a prompt.

    Both fields together, deliberately. ``permission_mode`` alone is undone by
    :func:`~rotaris_core.permissions.modes.resolve_effective_mode`, and the
    opt-in alone permits nothing that was not already permitted.
    """
    runtime = config.runtime.model_copy(
        update={
            "permission_mode": FULL_PERMISSION_MODE,
            "allow_unsandboxed_autonomous": True,
        },
    )
    return config.model_copy(update={"runtime": runtime})
