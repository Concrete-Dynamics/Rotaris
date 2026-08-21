"""Productive use: a person watching an agent work can see a command's output while it runs.
Expected outcome: frames reach an attached display in order, survive a late attach, and
never let a broken display interfere with the command that produced them."""

from __future__ import annotations

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.terminal_stream.hub import (
    TerminalFrame,
    TerminalStreamControl,
    TerminalStreamHub,
    default_hub,
    frames_to_text,
    reset_default_hub,
)

SESSION = "sess-1"
STREAM = "fg:root"


@pytest.fixture
def hub() -> TerminalStreamHub:
    return TerminalStreamHub(buffer_bytes=4096)


@verifies(SWR.SWR_3617)
def test_a_registered_display_receives_frames_in_order(hub: TerminalStreamHub) -> None:
    seen: list[TerminalFrame] = []
    hub.register_sink(SESSION, seen.append)
    hub.open_stream(SESSION, STREAM, command="pytest -q")

    hub.publish(SESSION, STREAM, "delta", "collecting ")
    hub.publish(SESSION, STREAM, "delta", "...\n")

    output = [frame for frame in seen if frame.kind == "delta"]
    assert [frame.data for frame in output] == ["collecting ", "...\n"]
    assert [frame.seq for frame in output] == sorted(frame.seq for frame in output)


@verifies(SWR.SWR_3617)
def test_publishing_without_a_display_costs_nothing_and_raises_nothing(
    hub: TerminalStreamHub,
) -> None:
    # The headless engine and the whole existing test suite run with no sink.
    assert hub.has_sink(SESSION) is False
    assert hub.publish(SESSION, STREAM, "delta", "quiet") is not None
    assert hub.publish("", STREAM, "delta", "nowhere") is None


@verifies(SWR.SWR_3617)
def test_a_display_that_raises_does_not_break_the_command(hub: TerminalStreamHub) -> None:
    def broken(_frame: TerminalFrame) -> None:
        raise RuntimeError("the window went away")

    hub.register_sink(SESSION, broken)
    hub.open_stream(SESSION, STREAM, command="sleep 1")

    assert hub.publish(SESSION, STREAM, "delta", "still fine") is not None


@verifies(SWR.SWR_3617)
def test_a_display_opened_mid_command_replays_what_it_missed(hub: TerminalStreamHub) -> None:
    hub.open_stream(SESSION, STREAM, command="make build")
    hub.publish(SESSION, STREAM, "delta", "step 1\n")
    hub.publish(SESSION, STREAM, "delta", "step 2\n")

    assert frames_to_text(hub.replay(SESSION, STREAM)) == "step 1\nstep 2\n"


@verifies(SWR.SWR_3617)
def test_a_whole_screen_frame_makes_earlier_output_redundant(hub: TerminalStreamHub) -> None:
    hub.publish(SESSION, STREAM, "delta", "old output\n")
    hub.publish(SESSION, STREAM, "screen", "redrawn screen")

    assert frames_to_text(hub.replay(SESSION, STREAM)) == "redrawn screen"


@verifies(SWR.SWR_3617)
def test_a_runaway_command_cannot_grow_the_replay_buffer_without_bound() -> None:
    hub = TerminalStreamHub(buffer_bytes=64)
    for _ in range(50):
        hub.publish(SESSION, STREAM, "delta", "x" * 32)

    replayed = frames_to_text(hub.replay(SESSION, STREAM))
    assert len(replayed) <= 64
    info = next(item for item in hub.open_streams(SESSION) if item.stream_id == STREAM)
    assert info.truncated is True, "a display must be able to say output was dropped"


@verifies(SWR.SWR_3617)
def test_open_streams_describe_what_a_display_can_offer(hub: TerminalStreamHub) -> None:
    hub.open_stream(SESSION, STREAM, command="npm run dev")
    hub.open_stream(SESSION, "bg:ts_abc", command="tail -f log.txt")

    listed = {info.stream_id: info for info in hub.open_streams(SESSION)}
    assert listed[STREAM].command == "npm run dev"
    assert listed[STREAM].running is True

    hub.close_stream(SESSION, STREAM, exit_code=3)
    closed = next(item for item in hub.open_streams(SESSION) if item.stream_id == STREAM)
    assert (closed.running, closed.exit_code) == (False, 3)


@verifies(SWR.SWR_3617)
def test_one_run_never_reads_another_runs_terminals(hub: TerminalStreamHub) -> None:
    hub.open_stream(SESSION, STREAM, command="mine")
    hub.publish(SESSION, STREAM, "delta", "mine\n")

    assert hub.open_streams("other-session") == []
    assert hub.replay("other-session", STREAM) == []


@verifies(SWR.SWR_3617)
def test_typing_reaches_the_stream_that_declared_how_to_take_input(
    hub: TerminalStreamHub,
) -> None:
    typed: list[tuple[str, bool]] = []
    hub.open_stream(SESSION, STREAM, command="python")
    hub.register_control(
        SESSION,
        STREAM,
        TerminalStreamControl(send_keys=lambda text, enter: typed.append((text, enter))),
    )

    assert hub.send_keys(SESSION, STREAM, "print(1)", enter=True) is True
    assert typed == [("print(1)", True)]


@verifies(SWR.SWR_3617)
def test_typing_into_a_command_that_already_ended_is_refused_not_raised(
    hub: TerminalStreamHub,
) -> None:
    hub.open_stream(SESSION, STREAM, command="echo hi")
    hub.register_control(SESSION, STREAM, TerminalStreamControl(send_keys=lambda _t, _e: None))
    hub.close_stream(SESSION, STREAM, exit_code=0)

    assert hub.send_keys(SESSION, STREAM, "too late") is False
    assert hub.resize(SESSION, STREAM, 100, 40) is False


@verifies(SWR.SWR_3617)
def test_the_process_wide_hub_is_one_object_and_can_be_reset() -> None:
    first = default_hub()
    assert default_hub() is first

    first.open_stream(SESSION, STREAM, command="left over")
    reset_default_hub()
    assert default_hub().open_streams(SESSION) == []
