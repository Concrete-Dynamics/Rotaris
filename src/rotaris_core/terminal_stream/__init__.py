"""Live terminal output streaming out of the engine (SWR-3617, SWR-3618).

The hardened terminal returns one observation when a command finishes.  That is
what the *agent* needs; it is not what a person watching a four-minute test run
needs.  This package carries the same terminal's output out while it is still
running, so a UI can render it live.

Two pieces, deliberately separate:

* :mod:`rotaris_core.terminal_stream.hub` — a session-keyed sink registry with a
  bounded per-stream replay buffer.  It knows nothing about terminals.
* :mod:`rotaris_core.terminal_stream.tap` — per-backend adapters that sample a
  live ``TerminalInterface`` and normalise it into frames.  It knows nothing
  about who is listening.
"""

from __future__ import annotations

from rotaris_core.terminal_stream.hub import (
    TerminalFrame,
    TerminalStreamControl,
    TerminalStreamHub,
    TerminalStreamInfo,
    default_hub,
)
from rotaris_core.terminal_stream.tap import TerminalTap, tap_for_terminal

__all__ = [
    "TerminalFrame",
    "TerminalStreamControl",
    "TerminalStreamHub",
    "TerminalStreamInfo",
    "TerminalTap",
    "default_hub",
    "tap_for_terminal",
]
