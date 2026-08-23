"""Launch the Serena runtime carried by Rotaris distributions (SWR-3724).

Installed Python builds spawn this module under their active interpreter.
Frozen builds re-exec the current Rotaris executable with :data:`SENTINEL`;
every PyInstaller launcher intercepts that marker before importing its normal
UI or CLI entry point. Both paths invoke the same installed ``serena-agent``
distribution and preserve its stdio MCP transport.
"""

from __future__ import annotations

import sys
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Sequence

BUNDLED_SERENA_COMMAND = "rotaris-serena"
"""Stable command token used by the default MCP configuration."""

SENTINEL = "--rotaris-run-bundled-serena"
"""Argument that routes a frozen Rotaris process directly into Serena."""


def _run_serena(arguments: Sequence[str]) -> int:
    from serena.cli import top_level  # type: ignore[import-untyped]

    argv_before = sys.argv
    sys.argv = [BUNDLED_SERENA_COMMAND, *arguments]
    try:
        result = top_level()
    except SystemExit as stop:
        return int(stop.code or 0)
    finally:
        sys.argv = argv_before
    return int(result or 0)


@traces(SWR.SWR_3724)
def intercept(argv: Sequence[str]) -> int | None:
    """Run bundled Serena when a frozen launcher receives its sentinel."""
    if len(argv) < 2 or argv[1] != SENTINEL:
        return None
    return _run_serena(argv[2:])


@traces(SWR.SWR_3724)
def resolved_command(arguments: Sequence[str]) -> tuple[str, list[str]]:
    """Return the direct Serena invocation for this installed runtime."""
    if getattr(sys, "frozen", False):
        return sys.executable, [SENTINEL, *arguments]
    return sys.executable, ["-m", __name__, *arguments]


@traces(SWR.SWR_3724)
def main(argv: Sequence[str] | None = None) -> int:
    """``python -m`` entry for installed Python distributions."""
    arguments = list(sys.argv if argv is None else argv)
    return _run_serena(arguments[1:])


if __name__ == "__main__":
    raise SystemExit(main())
