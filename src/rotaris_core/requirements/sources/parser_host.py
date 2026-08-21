"""Runs a generated requirement parser in a process of its own (SWR-3123).

The contract says a parser is "bounded by a timeout and killed on it", and a
thread cannot be killed — so a parser runs as a real OS process. Which process
depends on how Rotaris itself is running, and both answers avoid needing any
Python the workspace does not already have:

- **From source**, the child is ``python -m rotaris_core.requirements.sources.
  parser_host`` under the same interpreter.
- **Frozen** (PyInstaller: ``sys.executable`` is the Rotaris binary, not a
  Python), Rotaris **re-execs itself** with a sentinel first argument. The three
  shipped launchers call :func:`intercept` before anything else; a process
  spawned with the sentinel runs the parser and exits without ever importing Qt
  or the SDK.

Both paths converge on :func:`_child_main`, so the frozen path is proven by the
same function the from-source tests exercise.

The child **re-runs admissibility before executing** — the parent's check is
not trusted across the process boundary, because the file could change between
the parent's read and the child's. The child reads bytes once and admits and
executes the same bytes, so there is no gap to race.

Execution is ``exec`` of the admitted source with ``argv`` set to the repository
root — the contract's one input — in a namespace of its own. The child's stdout
is the contract's channel; whatever the parser printed is handed back verbatim
for :func:`~rotaris_core.requirements.sources.generated.read_parser_output` to
judge in the parent.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.sources.generated import ParserRunError, admit_parser

if TYPE_CHECKING:
    from collections.abc import Sequence

__all__ = ["SENTINEL", "intercept", "run_parser"]

#: The argv marker a frozen Rotaris recognises as "you were spawned to run a
#: parser". Namespaced and unpronounceable as a user flag on purpose.
SENTINEL = "--rotaris-run-requirement-parser"

#: The child says why it failed on stderr and exits with this, so the parent can
#: tell "the parser was refused or crashed" from "the parser ran and its output
#: is bad" — the latter is judged in the parent, where the contract lives.
_CHILD_FAILURE_EXIT = 3


@traces(SWR.SWR_3123)
def intercept(argv: Sequence[str]) -> int | None:
    """Run as a parser host if *argv* says so; ``None`` for a normal launch.

    The one line every frozen launcher calls first. Costing an ``argv[1]``
    comparison on every ordinary start is the price of not shipping a fourth
    executable for something that runs for fractions of a second.
    """
    if len(argv) < 2 or argv[1] != SENTINEL:
        return None
    if len(argv) != 4:
        print(f"usage: <rotaris> {SENTINEL} <repository-root> <parser-file>", file=sys.stderr)
        return 2
    return _child_main(Path(argv[2]), Path(argv[3]))


def _child_main(root: Path, parser: Path) -> int:
    """Admit and execute one parser. The whole child process.

    Admission happens *here*, on the bytes this process read, whatever the
    parent concluded: the file could have changed between the two reads, and the
    check that matters is the one in the process that executes.
    """
    try:
        source_bytes = parser.read_bytes()
    except OSError as error:
        print(f"parser could not be read: {error}", file=sys.stderr)
        return _CHILD_FAILURE_EXIT
    admission = admit_parser(source_bytes.decode("utf-8", errors="replace"))
    if not admission.admissible:
        print(admission.describe(), file=sys.stderr)
        return _CHILD_FAILURE_EXIT
    # The contract's one input is the repository root, handed the way a script
    # receives arguments. ``__name__`` is ``"__main__"`` so the parser's own
    # ``if __name__ == "__main__":`` block runs.
    namespace: dict[str, object] = {"__name__": "__main__", "__file__": str(parser)}
    argv_before = sys.argv
    sys.argv = [str(parser), str(root)]
    try:
        code = compile(source_bytes, str(parser), "exec")
        exec(code, namespace)  # noqa: S102 — the admitted contract, in the process built to run it
    except SystemExit as stop:
        return int(stop.code or 0)
    except BaseException as error:  # noqa: BLE001 — the parser's crash is the child's report
        print(f"parser raised {type(error).__name__}: {error}", file=sys.stderr)
        return _CHILD_FAILURE_EXIT
    finally:
        sys.argv = argv_before
    return 0


def _spawn_argv(root: Path, parser: Path) -> list[str]:
    """How this Rotaris starts a child of itself.

    Frozen, ``sys.executable`` is the Rotaris binary and the sentinel routes it
    here; from source it is a Python interpreter and ``-m`` does. Neither needs
    a Python the workspace happens to have, which is the OS-independence clause
    of SWR-3123 applied to the machine as well as the tree.
    """
    if getattr(sys, "frozen", False):
        return [sys.executable, SENTINEL, str(root), str(parser)]
    return [sys.executable, "-m", __name__, str(root), str(parser)]


@traces(SWR.SWR_3123)
def run_parser(root: Path, parser: Path, *, timeout: float) -> str:
    """Execute *parser* over *root* in a child process and return its stdout.

    Raises:
        ParserRunError: the child exceeded *timeout* (it is killed, never left
            running), could not be started, was refused by its own admissibility
            check, or crashed — each as a sentence carrying the child's stderr,
            because the child's report is the only evidence there is.
    """
    try:
        completed = subprocess.run(  # noqa: S603 — argv is built above from our own executable
            _spawn_argv(root, parser),
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=timeout,
            check=False,
            cwd=str(root),
        )
    except subprocess.TimeoutExpired as expired:
        raise ParserRunError(
            f"the parser exceeded its {timeout:g}s budget and was killed",
        ) from expired
    except OSError as error:
        raise ParserRunError(f"the parser process could not be started ({error})") from error
    if completed.returncode != 0:
        detail = (completed.stderr or "").strip() or "no output"
        raise ParserRunError(
            f"the parser exited with status {completed.returncode}: {detail}",
        )
    return completed.stdout


def main(argv: Sequence[str] | None = None) -> int:
    """``python -m`` entry: the from-source child."""
    arguments = list(sys.argv if argv is None else argv)
    if len(arguments) != 3:
        print(
            "usage: python -m rotaris_core.requirements.sources.parser_host"
            " <repository-root> <parser-file>",
            file=sys.stderr,
        )
        return 2
    return _child_main(Path(arguments[1]), Path(arguments[2]))


if __name__ == "__main__":
    sys.exit(main())
