"""The reduced-motion gate: one decision, read at the moment an animation starts (SWR-3723).

The gate exists so that a reader who asked the operating system for reduced
motion — or ticked the box in Settings — never sees a pulse, a rise or a knob
travel. These tests hold the gate's contract: the preference resolves in the
right order, and every animated surface completes instantly behind a closed
gate instead of animating anyway.
"""

from __future__ import annotations

import pytest
from PySide6.QtCore import QAbstractAnimation
from rotaris_core.reqtocode import SWR, verifies

from rotaris.theme import reduced_motion, tokens
from rotaris.theme.motif import PulseAnimation

pytestmark = pytest.mark.unit


class _RecordingSettings:
    """A stand-in for QSettings so a test never touches the user's real store."""

    def __init__(self) -> None:
        self.values: dict[str, object] = {}

    def value(self, key: str, default: object = None) -> object:
        return self.values.get(key, default)

    def setValue(self, key: str, value: object) -> None:  # noqa: N802 — Qt's spelling
        self.values[key] = value


@verifies(SWR.SWR_3723)
def test_the_gate_reads_the_platform_default_when_nothing_is_stored(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a fresh install on a machine that asks for stillness.

    Expected outcome: with nothing in Settings, the platform's own answer wins.
    """
    monkeypatch.setattr(reduced_motion, "_stored", None)
    monkeypatch.setattr(reduced_motion, "_platform", True)
    monkeypatch.setattr(reduced_motion, "_settings", _RecordingSettings())

    assert reduced_motion.reduced_motion() is True


@verifies(SWR.SWR_3723)
def test_the_stored_preference_wins_over_the_platform(monkeypatch: pytest.MonkeyPatch) -> None:
    """Productive use: the user turns animations back on in Settings.

    Expected outcome: a stored "off" overrides the platform's "on" — the toggle
    exists to be flipped, in both directions.
    """
    monkeypatch.setattr(reduced_motion, "_stored", False)
    monkeypatch.setattr(reduced_motion, "_platform", True)

    assert reduced_motion.reduced_motion() is False


@verifies(SWR.SWR_3723)
def test_setting_the_preference_persists_it(monkeypatch: pytest.MonkeyPatch) -> None:
    """Productive use: the choice survives a relaunch."""
    store = _RecordingSettings()
    monkeypatch.setattr(reduced_motion, "_stored", None)
    monkeypatch.setattr(reduced_motion, "_settings", store)

    reduced_motion.set_reduced_motion(True)

    assert store.values["ui/reduced_motion"] is True
    assert reduced_motion.reduced_motion() is True


@verifies(SWR.SWR_3723)
def test_a_closed_gate_stops_the_pulse_and_leaves_the_dot_opaque(
    qtbot, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Productive use: a running agent whose dot must not breathe.

    Expected outcome: the pulse never starts, and the dot rests at full
    opacity — the state colour still says "running", the motion does not.
    """
    from PySide6.QtWidgets import QWidget

    monkeypatch.setattr(reduced_motion, "_stored", True)
    widget = QWidget()
    qtbot.addWidget(widget)
    pulse = PulseAnimation(widget, tokens())

    pulse.start()

    assert pulse.running is False
    # The value the dot paints with, not a graphics effect's: the pulse stopped
    # applying itself when the offscreen render an effect forces became the
    # dominant cost of a live run (SWR-2454).
    assert pulse.opacity == 1.0


@verifies(SWR.SWR_3723)
def test_a_closed_gate_lands_the_toggle_knob_instantly(
    qtbot, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Productive use: a user flips a switch with reduced motion on.

    Expected outcome: the knob is at its destination with no animation running.
    """
    from rotaris.widgets.meters import ToggleSwitch

    monkeypatch.setattr(reduced_motion, "_stored", True)
    switch = ToggleSwitch(False)
    qtbot.addWidget(switch)

    switch.setChecked(True)

    assert switch._knob == 1.0
    assert switch._travel.state() != QAbstractAnimation.State.Running


@verifies(SWR.SWR_3723)
def test_a_closed_gate_keeps_the_spinner_still(qtbot, monkeypatch: pytest.MonkeyPatch) -> None:
    """Productive use: a view loads while reduced motion is on.

    Expected outcome: the spinner paints once and its timer never runs.
    """
    from rotaris.widgets.overlays import Spinner

    monkeypatch.setattr(reduced_motion, "_stored", True)
    spinner = Spinner()
    qtbot.addWidget(spinner)

    spinner.show()

    assert spinner.spinning is False
