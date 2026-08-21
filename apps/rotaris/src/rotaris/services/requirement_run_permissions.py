"""What a run released from the requirements board is allowed to do (SWR-3707).

A board release **used to be** unattended by construction: the run held no
coordinator handle, so nothing registered an approval host for it and a run that
stopped to ask was a run that stopped. Since SWR-3624 it is an ordinary session —
it has a handle, an approval host and a person who can be brought to it, and the
board says on the card when one is waiting (SWR-3625). Nobody is *watching* it,
which is a different thing and the reason the elevation stayed on by default: a
release the user walked away from should finish, not park on the first write.

So a board run is given the permissive preset *and*
``runtime.allow_unsandboxed_autonomous`` together. Either alone leaves it where
it started: without the preset the policy engine denies the first tool that
needs approval, and without the opt-in SWR-2508 downgrades the preset straight
back to ``ask``.

Turning the switch off is now a real setting rather than a way to break a
release. The engine reads ``interactive`` from whether an approval host is
registered (``agents.factory``), and a coordinator-driven run registers one — so
an unelevated release stops and asks, the card states it, and answering it lets
the run carry on. Before SWR-3624 the same switch produced a run that was denied
everything and reported success having changed nothing.

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
    "WAIT_BUDGET_KEY",
    "WAIT_BUDGET_STOPS",
    "answer_wait_seconds",
    "elevated",
    "full_permission_runs",
    "notice_suppressed",
    "set_answer_wait_seconds",
    "set_full_permission_runs",
    "suppress_notice",
    "wait_budget_index",
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


#: How long a run may wait for the person it is asking, in seconds, with ``0``
#: meaning "no limit" — the reading
#: :func:`~rotaris_core.core.waiting.wait_budget` gives it. A preference rather
#: than workspace configuration for the same reason its neighbour is: it is a
#: fact about how *this desktop* runs requirements, and writing it into
#: ``agents.yaml`` would travel with the repository to whoever cloned it next.
WAIT_BUDGET_KEY = "requirements/answerWaitSeconds"

#: The stops the Settings control offers, in order. Discrete rather than free
#: text because the useful answers are an order of magnitude apart and nobody
#: means 47 minutes; the last one is the default, because a run that asks is
#: waiting for a person, and a person is not a timeout.
WAIT_BUDGET_STOPS: tuple[tuple[str, float], ...] = (
    ("5 minutes", 300.0),
    ("10 minutes", 600.0),
    ("30 minutes", 1800.0),
    ("1 hour", 3600.0),
    ("2 hours", 7200.0),
    ("5 hours", 18000.0),
    ("12 hours", 43200.0),
    ("1 day", 86400.0),
    ("2 days", 172800.0),
    ("Indefinitely", 0.0),
)


@traces(SWR.SWR_3625)
def answer_wait_seconds() -> float:
    """How long a released run may wait for an answer. ``0`` means no limit.

    Indefinite unless the user chose otherwise, which is the whole point of
    saying on the board that a run is waiting: the answer comes when they get to
    it. A stored value that is not a number at all falls back to the default
    rather than to zero-the-integer, because "the preference file is damaged" and
    "wait forever" are different answers.
    """
    stored = QSettings().value(WAIT_BUDGET_KEY)
    if stored is None:
        return WAIT_BUDGET_STOPS[-1][1]
    try:
        seconds = float(stored)
    except (TypeError, ValueError):
        return WAIT_BUDGET_STOPS[-1][1]
    return seconds if seconds >= 0 else WAIT_BUDGET_STOPS[-1][1]


@traces(SWR.SWR_3625)
def set_answer_wait_seconds(seconds: float) -> None:
    """Record the chosen budget. Takes effect on the next run started."""
    settings = QSettings()
    settings.setValue(WAIT_BUDGET_KEY, float(seconds))
    settings.sync()


@traces(SWR.SWR_3625)
def wait_budget_index(seconds: float) -> int:
    """Which stop *seconds* is, for the control that offers them.

    An unrecognised value — a preference written by a later version, a hand-edited
    file — reads as the default rather than as the first stop, so a control that
    cannot show the stored value shows the safe one instead of silently
    shortening the wait to five minutes.
    """
    for index, (_label, value) in enumerate(WAIT_BUDGET_STOPS):
        if value == seconds:
            return index
    return len(WAIT_BUDGET_STOPS) - 1


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
